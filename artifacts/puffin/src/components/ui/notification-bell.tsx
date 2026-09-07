import React, { useState } from "react";
import {
  Bell,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Send,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useGlobalNotifications, GlobalNotificationItem } from "@/hooks/use-global-notifications";
import { useLocation } from "wouter";
import { toast } from "sonner";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const {
    unreadWhatsAppCount,
    recentNotifications,
    deleteNotification,
    clearAllNotifications,
  } = useGlobalNotifications();

  const {
    permission,
    isSubscribed,
    isLoading,
    subscribeToPush,
    sendTestNotification,
  } = usePushNotifications();

  const totalBadges = unreadWhatsAppCount;

  const handleItemClick = (item: GlobalNotificationItem) => {
    setOpen(false);
    if (item.url) {
      setLocation(item.url);
    } else if (item.tipo === "whatsapp") {
      setLocation("/whatsapp");
    } else {
      setLocation("/alertas");
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllNotifications();
    toast.success("Bandeja de notificaciones vaciada");
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteNotification(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          title="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          {totalBadges > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-background animate-pulse">
              {totalBadges > 9 ? "9+" : totalBadges}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] sm:w-[380px] p-0 shadow-xl border border-border bg-popover rounded-xl overflow-hidden"
      >
        {/* Encabezado con título y botón de vaciar */}
        <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">Centro de Notificaciones</h4>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadWhatsAppCount > 0 && (
              <Badge
                variant="secondary"
                className="text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 py-0 px-1.5"
              >
                {unreadWhatsAppCount} WhatsApp
              </Badge>
            )}

            {recentNotifications && recentNotifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleClearAll}
                title="Borrar todas las notificaciones de la campanita"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Vaciar
              </Button>
            )}
          </div>
        </div>

        {/* Banner de Estado Push para iPhone / Dispositivo */}
        <div className="p-3 border-b border-border bg-slate-50 dark:bg-slate-900/50">
          {permission === "granted" && isSubscribed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Notificaciones activas en este dispositivo
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={sendTestNotification}
                title="Probar notificación en tu iPhone"
              >
                <Send className="h-3 w-3 mr-1" />
                Probar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-lg shrink-0 mt-0.5">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Activá los avisos en tu iPhone
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Recibí alertas instantáneas cuando te envíen mensajes de WhatsApp o surjan avisos del sistema.
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full h-8 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                onClick={subscribeToPush}
                disabled={isLoading}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {isLoading ? "Configurando..." : "Activar Notificaciones"}
              </Button>
            </div>
          )}
        </div>

        {/* Lista de Notificaciones con opción de borrar individualmente */}
        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
          {recentNotifications && recentNotifications.length > 0 ? (
            recentNotifications.map((item) => {
              const isWa = item.tipo === "whatsapp";
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-start gap-3 group relative cursor-pointer"
                >
                  <div
                    className={`p-2 rounded-full shrink-0 ${
                      isWa
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                    }`}
                  >
                    {isWa ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {item.titulo}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {item.mensaje}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {new Date(item.fecha).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  {/* Botón para eliminar esta notificación */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteItem(e, item.id)}
                    className="absolute right-2 top-2.5 p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                    title="Eliminar esta notificación"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center px-4">
              <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">
                Bandeja vacía
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                No tienes notificaciones pendientes en este momento.
              </p>
            </div>
          )}
        </div>

        {/* Pie de página con accesos directos */}
        <div className="p-2 bg-muted/20 border-t border-border flex items-center justify-between text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false);
              setLocation("/whatsapp");
            }}
          >
            <MessageSquare className="h-3 w-3 mr-1 text-emerald-500" />
            Ir a WhatsApp
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false);
              setLocation("/alertas");
            }}
          >
            Ver Alertas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
