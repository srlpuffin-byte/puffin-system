import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notification-sound";
import { getAuthToken } from "@/hooks/use-auth";

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
      "Notification" in window;

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
    if (!("Notification" in window)) {
      toast.error("Tu navegador o versión de iOS no soporta notificaciones push.");
      return false;
    }

    setIsLoading(true);

    try {
      // 1. Solicitar permiso al usuario (en iOS Safari debe ejecutarse en respuesta directa a un clic)
      let permResult = Notification.permission;
      if (permResult !== "granted") {
        try {
          permResult = await Notification.requestPermission();
        } catch {
          permResult = await new Promise<NotificationPermission>((resolve) => {
            Notification.requestPermission((res) => resolve(res));
          });
        }
      }
      setPermission(permResult);

      if (permResult !== "granted") {
        toast.error("Permiso de notificaciones no concedido", {
          description: "En tu iPhone ve a Ajustes > Safari (o Puffin) > Notificaciones y actívalas.",
          duration: 7000,
        });
        setIsLoading(false);
        return false;
      }

      // 2. Obtener clave pública VAPID del servidor
      const keyRes = await fetch("/api/push-notifications/public-key");
      if (!keyRes.ok) throw new Error("No se pudo conectar con el servidor para obtener la clave.");
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("Clave pública no disponible.");

      // 3. Asegurar que el Service Worker esté registrado y activo
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service Worker no soportado.");
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      if (!registration.pushManager) {
        throw new Error("PushManager no disponible en este navegador o modo.");
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

      // Serializar a formato plano JSON compatible con backend
      const subJson = subscription.toJSON();

      // 5. Enviar suscripción al backend incluyendo token si existe
      const token = getAuthToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const saveRes = await fetch("/api/push-notifications/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify({
          subscription: subJson,
          userAgent: navigator.userAgent,
        }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${saveRes.status} al registrar el dispositivo.`);
      }

      setIsSubscribed(true);
      playNotificationSound("message");
      toast.success("¡Notificaciones activadas!", {
        description: "Recibirás avisos de WhatsApp y del sistema directamente en este dispositivo.",
        duration: 5000,
      });

      // 6. Enviar notificación de prueba para confirmar recepción en iOS
      try {
        await fetch("/api/push-notifications/test", {
          method: "POST",
          headers,
        });
      } catch {}

      return true;
    } catch (err: any) {
      console.error("[Push Hook] Error al activar notificaciones:", err);
      toast.error("Error al activar notificaciones: " + (err?.message || "Reintentá nuevamente."), {
        duration: 6000,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    try {
      toast.info("Enviando notificación de prueba...");
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/push-notifications/test", { method: "POST", headers });
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
