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

export function useGlobalNotifications() {
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<GlobalNotificationItem[]>([]);
  const [location, setLocation] = useLocation();

  const lastSeenMsgTimestampRef = useRef<number>(Date.now());
  const isInitialLoadRef = useRef(true);

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

        // 1. Consultar chats de WhatsApp
        const chatsRes = await fetch("/api/whatsapp-chats", { headers });
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          const sessions = chatsData.sessions || [];

          let totalUnread = 0;
          let newestIncomingTime = lastSeenMsgTimestampRef.current;
          let latestNewMessage: { sender: string; text: string; phone: string } | null = null;

          sessions.forEach((s: any) => {
            if (s.unread_count && s.unread_count > 0) {
              totalUnread += s.unread_count;
            }

            // Verificar si el último mensaje es de un usuario y es más reciente que nuestra marca de tiempo
            if (s.last_message?.role === "user" && s.last_message?.created_at) {
              const msgTime = new Date(s.last_message.created_at).getTime();
              if (msgTime > lastSeenMsgTimestampRef.current) {
                newestIncomingTime = Math.max(newestIncomingTime, msgTime);
                latestNewMessage = {
                  sender: s.contact_name || s.phone,
                  text: s.last_message.content || (s.last_message.has_media ? "📷 Archivo adjunto" : "Nuevo mensaje"),
                  phone: s.phone,
                };
              }
            }
          });

          if (isMounted) {
            setUnreadWhatsAppCount(totalUnread);

            // Si hay un mensaje nuevo que no estaba en el estado inicial
            if (!isInitialLoadRef.current && latestNewMessage) {
              lastSeenMsgTimestampRef.current = newestIncomingTime;

              // Solo emitir sonido y toast si NO estamos ya dentro de la sección de whatsapp mirando ese chat
              const isLookingAtChat = location === "/whatsapp" || location.startsWith("/whatsapp?");

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
              // En la carga inicial solo marcamos el tiempo de corte
              lastSeenMsgTimestampRef.current = Date.now();
            }

            // Actualizar App Badge nativo (soporte en iPhone iOS 16.4+, Android y PWA Desktop)
            if ("setAppBadge" in navigator) {
              try {
                if (totalUnread > 0) {
                  navigator.setAppBadge(totalUnread);
                } else {
                  navigator.clearAppBadge();
                }
              } catch {}
            }
          }
        }

        // 2. Consultar notificaciones recientes del servidor
        const notifsRes = await fetch("/api/push-notifications/recent", { headers });
        if (notifsRes.ok && isMounted) {
          const notifsData = await notifsRes.json();
          setRecentNotifications(notifsData.notifications || []);
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

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [location, setLocation]);

  return {
    unreadWhatsAppCount,
    recentNotifications,
  };
}
