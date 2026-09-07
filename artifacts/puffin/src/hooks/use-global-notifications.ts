import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notification-sound";
import { getAuthToken } from "@/hooks/use-auth";

export interface GlobalNotificationItem {
  id: string;
  tipo: "whatsapp" | "alerta" | "sistema";
  titulo: string;
  mensaje: string;
  url?: string;
  fecha: string;
}

function syncAppBadge(count: number) {
  if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
    try {
      if (count > 0) {
        navigator.setAppBadge(count);
      } else {
        navigator.clearAppBadge();
      }
    } catch {}
  }
  try {
    const baseTitle = "PUFFIN SRL";
    if (count > 0) {
      document.title = `(${count}) ${baseTitle}`;
    } else if (document.title.includes(baseTitle)) {
      document.title = baseTitle;
    }
  } catch {}
}

export function useGlobalNotifications() {
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<GlobalNotificationItem[]>([]);
  const [location, setLocation] = useLocation();

  const lastSeenMsgTimestampRef = useRef<number>(Date.now());
  const isInitialLoadRef = useRef(true);

  const totalBadges = unreadWhatsAppCount + recentNotifications.length;

  // Sincronizar el badge nativo de la app del celular cada vez que cambia el total de notificaciones
  useEffect(() => {
    syncAppBadge(totalBadges);
  }, [totalBadges]);

  // Polling cada 5 segundos para sincronizar notificaciones y mensajes en vivo
  useEffect(() => {
    let isMounted = true;

    async function checkNotifications() {
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        let currentUnread = unreadWhatsAppCount;
        let currentNotifsCount = recentNotifications.length;

        // 1. Consultar chats de WhatsApp
        const chatsRes = await fetch("/api/whatsapp-chats", { headers });
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          const sessions: any[] = Array.isArray(chatsData) ? chatsData : (chatsData.sessions || []);

          let totalUnread = 0;
          let newestIncomingTime = lastSeenMsgTimestampRef.current;
          let latestNewMessage: { sender: string; text: string; phone: string } | null = null;

          for (const s of sessions) {
            if (typeof s.unread_count === "number" && s.unread_count > 0) {
              totalUnread += s.unread_count;
            } else if (s.last_message?.role === "user") {
              totalUnread += 1;
            }

            // Verificar si el último mensaje es de un usuario y es más reciente que nuestra marca de tiempo
            if (s.last_message?.role === "user" && s.last_message?.created_at) {
              const msgTime = new Date(s.last_message.created_at).getTime();
              if (msgTime > lastSeenMsgTimestampRef.current) {
                newestIncomingTime = Math.max(newestIncomingTime, msgTime);
                latestNewMessage = {
                  sender: s.nombre || s.contact_name || s.phone,
                  text: s.last_message.content || (s.last_message.has_media ? "📷 Archivo adjunto" : "Nuevo mensaje"),
                  phone: s.phone,
                };
              }
            }
          }

          if (isMounted) {
            currentUnread = totalUnread;
            setUnreadWhatsAppCount(totalUnread);

            // Si hay un mensaje nuevo que no estaba en el estado inicial
            if (!isInitialLoadRef.current && latestNewMessage) {
              lastSeenMsgTimestampRef.current = newestIncomingTime;

              playNotificationSound("message");
              if ("vibrate" in navigator) {
                try { navigator.vibrate([150, 50, 150]); } catch {}
              }

              toast(`💬 WhatsApp: ${latestNewMessage.sender}`, {
                description: latestNewMessage.text,
                duration: 6000,
                action: {
                  label: "Ver chat",
                  onClick: () => setLocation("/whatsapp"),
                },
              });
            } else if (isInitialLoadRef.current) {
              lastSeenMsgTimestampRef.current = Date.now();
            }
          }
        }

        // 2. Consultar notificaciones recientes del servidor
        const notifsRes = await fetch("/api/push-notifications/recent", { headers });
        if (notifsRes.ok && isMounted) {
          const notifsData = await notifsRes.json();
          const list: GlobalNotificationItem[] = notifsData.notifications || [];
          currentNotifsCount = list.length;
          setRecentNotifications(list);
        }

        if (isMounted) {
          syncAppBadge(currentUnread + currentNotifsCount);
        }

        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
        }
      } catch (err) {
        // Ignorar fallas momentáneas de red
      }
    }

    checkNotifications();
    const interval = setInterval(checkNotifications, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkNotifications();
      }
    };
    window.addEventListener("focus", checkNotifications);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", checkNotifications);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [location, setLocation]);

  const deleteNotification = async (id: string) => {
    // Actualización optimista inmediata
    setRecentNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(`/api/push-notifications/recent/${id}`, {
        method: "DELETE",
        headers,
      });
    } catch (e) {
      console.warn("Error borrando notificación:", e);
    }
  };

  const clearAllNotifications = async () => {
    // Limpieza optimista inmediata
    setRecentNotifications([]);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/push-notifications/recent", {
        method: "DELETE",
        headers,
      });
    } catch (e) {
      console.warn("Error vaciando notificaciones:", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/push-notifications/recent/read-all", {
        method: "POST",
        headers,
      });
      setRecentNotifications([]);
    } catch {}
  };

  return {
    unreadWhatsAppCount,
    recentNotifications,
    totalBadges,
    deleteNotification,
    clearAllNotifications,
    markAllAsRead,
  };
}
