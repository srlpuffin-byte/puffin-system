import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notification-sound";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isIosStandalone, setIsIosStandalone] = useState(false);

  useEffect(() => {
    // Detectar si está en iOS (iPhone / iPad) y si está en modo standalone (PWA en pantalla de inicio)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = 
      (window.navigator as any).standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches;

    setIsIosStandalone(isIos && isStandalone);

    const supported = 
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "PushManager" in window;

    setIsSupported(supported);

    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = useCallback(async () => {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!reg || !reg.pushManager) return;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (err) {
      console.warn("[Push Hook] Error verificando suscripción existente:", err);
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("Tu navegador no soporta notificaciones push.");
      return false;
    }

    setIsLoading(true);

    try {
      // 1. Solicitar permiso al usuario (en iOS Safari debe dispararse en respuesta a un clic del usuario)
      const permResult = await Notification.requestPermission();
      setPermission(permResult);

      if (permResult !== "granted") {
        toast.error("Permiso de notificaciones denegado. Podés activarlo en los ajustes de tu teléfono.");
        setIsLoading(false);
        return false;
      }

      // 2. Obtener clave pública VAPID del servidor
      const keyRes = await fetch("/api/push-notifications/public-key");
      if (!keyRes.ok) throw new Error("No se pudo obtener la clave del servidor.");
      const { publicKey } = await keyRes.json();

      // 3. Esperar a que el Service Worker esté listo
      const registration = await navigator.serviceWorker.ready;
      if (!registration.pushManager) {
        throw new Error("PushManager no está disponible en este dispositivo.");
      }

      // 4. Suscribir a PushManager
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      // 5. Enviar suscripción a nuestro backend
      const saveRes = await fetch("/api/push-notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userAgent: navigator.userAgent,
        }),
      });

      if (!saveRes.ok) {
        throw new Error("No se pudo registrar la suscripción en el servidor.");
      }

      setIsSubscribed(true);
      playNotificationSound("message");
      toast.success("¡Notificaciones activadas con éxito!", {
        description: "Recibirás avisos de WhatsApp y del sistema directamente en este dispositivo.",
      });

      // 6. Disparar notificación de prueba de bienvenida
      try {
        await fetch("/api/push-notifications/test", { method: "POST" });
      } catch {}

      return true;
    } catch (err: any) {
      console.error("[Push Hook] Error al activar notificaciones:", err);
      toast.error("Error al activar notificaciones: " + (err?.message || "Reintentá nuevamente."));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    try {
      toast.info("Enviando notificación de prueba...");
      const res = await fetch("/api/push-notifications/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        playNotificationSound("message");
        toast.success("Notificación de prueba enviada", {
          description: data.message || "Revisá las notificaciones de tu dispositivo.",
        });
      } else {
        toast.error(data.error || "No se pudo enviar la prueba.");
      }
    } catch (err: any) {
      toast.error("Error al enviar prueba: " + (err.message || ""));
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    isIosStandalone,
    subscribeToPush,
    sendTestNotification,
  };
}
