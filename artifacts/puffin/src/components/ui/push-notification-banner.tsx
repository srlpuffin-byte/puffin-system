import React, { useState, useEffect } from "react";
import { Bell, X, Sparkles, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationBanner() {
  const { isSupported, permission, isSubscribed, isLoading, subscribeToPush } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("puffin_push_prompt_dismissed") === "true";
  });

  if (!isSupported || permission !== "default" || isSubscribed || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem("puffin_push_prompt_dismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-primary/20 px-3 py-2.5 sm:px-4 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1 bg-primary text-primary-foreground rounded-full shrink-0">
          <Smartphone className="h-3.5 w-3.5" />
        </div>
        <p className="text-foreground/90 font-medium truncate sm:text-clip">
          <strong className="text-primary font-semibold">Notificaciones en tu iPhone:</strong> Activá los avisos para recibir mensajes de WhatsApp y alertas al instante.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="h-7 text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
          onClick={subscribeToPush}
          disabled={isLoading}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          {isLoading ? "Activando..." : "Activar ahora"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          title="Descartar por ahora"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
