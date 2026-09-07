import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell,
  Clock,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Zap,
  Gauge,
  Wrench,
  FileCheck,
  AlertTriangle,
  Play,
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";

interface NotificacionesConfig {
  id: number;
  empresa_id: number;
  whatsapp_activo: boolean;
  jornadas_12h_activo: boolean;
  jornadas_horas_limite: number;
  satcom_velocidad_activo: boolean;
  combustible_mantenimiento_activo: boolean;
  documentacion_activo: boolean;
  incidentes_activo: boolean;
  notificar_empleado_whatsapp: boolean;
  notificar_empleado_push: boolean;
  notificar_admin_push: boolean;
  updated_at?: string;
}

export function AdminNotificaciones() {
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<{
    totalActivas?: number;
    excedidas?: number;
    enviadas?: number;
    message?: string;
  } | null>(null);

  // Obtener la configuración actual
  const { data: config, isLoading } = useQuery<NotificacionesConfig>({
    queryKey: ["notificaciones-config"],
    queryFn: () => apiFetch("/notificaciones-config"),
  });

  // Mutación para actualizar un campo de configuración
  const updateMutation = useMutation({
    mutationFn: (patch: Partial<NotificacionesConfig>) =>
      apiFetch<{ success: boolean; config: NotificacionesConfig }>("/notificaciones-config", {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["notificaciones-config"], data.config);
      toast.success("Configuración de notificaciones actualizada");
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al actualizar la configuración");
    },
  });

  // Mutación para disparar chequeo manual de jornadas
  const testJornadasMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        success: boolean;
        message: string;
        result: { totalActivas: number; excedidas: number; enviadas: number };
      }>("/notificaciones-config/test-jornadas", {
        method: "POST",
      }),
    onSuccess: (data) => {
      setTestResult(data.result);
      toast.success(data.message || "Chequeo de jornadas realizado con éxito");
      qc.invalidateQueries({ queryKey: ["alertas"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al verificar jornadas");
    },
  });

  // Mutación para enviar push de prueba
  const testPushMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean }>("/notificaciones-config/test-push", {
        method: "POST",
        body: JSON.stringify({
          title: "🔔 PUFFIN - Notificación de Prueba",
          body: "El sistema de notificaciones está funcionando correctamente.",
        }),
      }),
    onSuccess: () => {
      toast.success("Notificación push enviada a todos los dispositivos registrados");
    },
    onError: (err: any) => {
      toast.error(err.message || "Error enviando notificación push");
    },
  });

  const handleToggle = (key: keyof NotificacionesConfig, value: boolean | number) => {
    updateMutation.mutate({ [key]: value });
  };

  if (isLoading || !config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando configuración de notificaciones...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Administración de Notificaciones</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Control de Alertas
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Habilitá o deshabilitá qué avisos envía el sistema automáticamente a empleados y administradores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/alertas">
            <Button variant="outline" size="sm" className="gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              Ver Alertas del Sistema
            </Button>
          </Link>
        </div>
      </div>

      {/* SECCIÓN OBLIGATORIA: RECORDATORIO DE JORNADAS 12H */}
      <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-card to-card shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mt-1">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">Recordatorio de Cierre de Jornada (+12h)</CardTitle>
                  <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                    OBLIGATORIO OPERATIVO
                  </Badge>
                </div>
                <CardDescription className="mt-1 text-sm">
                  Detecta automáticamente a operarios que hayan iniciado jornada y hayan transcurrido 12 horas sin finalizarla, enviándoles una notificación directa a su app y celular (Web Push) para que recuerden registrar el cierre y el horómetro final (sin depender de WhatsApp ni ventanas de 24hs).
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto bg-card px-3 py-2 rounded-lg border">
              <Label htmlFor="jornadas-activo" className="text-sm font-semibold cursor-pointer">
                {config.jornadas_12h_activo ? "Activado" : "Pausado"}
              </Label>
              <Switch
                id="jornadas-activo"
                checked={config.jornadas_12h_activo}
                onCheckedChange={(val) => handleToggle("jornadas_12h_activo", val)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Parámetros de la regla */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl border bg-background/60 space-y-2">
              <Label htmlFor="horas-limite" className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Límite de Tiempo
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="horas-limite"
                  type="number"
                  min="4"
                  max="24"
                  className="w-24 font-bold text-base"
                  defaultValue={config.jornadas_horas_limite || 12}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value) || 12;
                    if (val !== config.jornadas_horas_limite) {
                      handleToggle("jornadas_horas_limite", val);
                    }
                  }}
                />
                <span className="text-sm font-medium text-muted-foreground">Horas continuas</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Por defecto 12 horas. Se recomienda no exceder este valor para control de turnos.
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-background/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-push-emp" className="text-sm font-semibold flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-blue-500" />
                    Web Push a su Celular / App
                  </Label>
                  <p className="text-xs text-muted-foreground">Llega a la pantalla de bloqueo y PWA del operario</p>
                </div>
                <Switch
                  id="notif-push-emp"
                  checked={config.notificar_empleado_push}
                  onCheckedChange={(val) => handleToggle("notificar_empleado_push", val)}
                />
              </div>

              <div className="pt-2 border-t text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Llega directo a su usuario sin depender de WhatsApp ni ventanas de 24hs.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-background/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-admin" className="text-sm font-medium flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-amber-500" />
                    Alerta a Administradores
                  </Label>
                  <p className="text-xs text-muted-foreground">Notifica al panel y a los supervisores</p>
                </div>
                <Switch
                  id="notif-admin"
                  checked={config.notificar_admin_push}
                  onCheckedChange={(val) => handleToggle("notificar_admin_push", val)}
                />
              </div>

              <div className="pt-2">
                <div className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded-lg flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>Se comprueba de fondo automáticamente cada 15 min.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vista previa del mensaje que recibe el operario en su app */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                VISTA PREVIA DE LA NOTIFICACIÓN EN LA APP DEL OPERARIO
              </span>
              <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                Push & App Directa
              </Badge>
            </div>
            <div className="bg-background/90 rounded-lg p-3 text-xs font-sans text-foreground/90 border shadow-xs leading-relaxed space-y-1">
              <p className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1.5">
                <span>⏱️ PUFFIN • Recordatorio de Fin de Jornada (+12h)</span>
              </p>
              <p>
                Hola <strong>[Operario]</strong>, tu jornada en <strong>[Equipo/Máquina]</strong> lleva <strong>12 horas</strong> iniciada y aún no fue finalizada.
              </p>
              <p className="text-muted-foreground text-[11px]">
                Por favor ingresá a registrar el cierre de la jornada y el horómetro final.
              </p>
            </div>
          </div>

          {/* Botón de acción para forzar chequeo inmediato */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t">
            <div>
              <p className="text-xs font-medium">¿Querés verificar las jornadas activas en este instante?</p>
              <p className="text-[11px] text-muted-foreground">
                El sistema analizará todas las jornadas en curso ahora mismo y enviará los avisos pendientes.
              </p>
            </div>

            <Button
              onClick={() => testJornadasMutation.mutate()}
              disabled={testJornadasMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-xs"
            >
              {testJornadasMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              Verificar Jornadas Abiertas Ahora
            </Button>
          </div>

          {/* Resultado del chequeo */}
          {testResult && (
            <div className="p-3.5 rounded-lg border bg-amber-500/10 border-amber-500/30 flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Resultado del chequeo:</p>
                  <p className="text-muted-foreground">
                    Jornadas en curso: <strong>{testResult.totalActivas ?? 0}</strong> | 
                    Excedidas de 12h: <strong>{testResult.excedidas ?? 0}</strong> | 
                    Avisos enviados: <strong>{testResult.enviadas ?? 0}</strong>
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTestResult(null)}
                className="text-xs h-7"
              >
                Cerrar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECCIÓN CANALES Y TIPOS DE ALERTAS DEL SISTEMA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Canales Generales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Canales de Comunicación
            </CardTitle>
            <CardDescription className="text-xs">
              Activá o pausá los canales de salida para notificaciones de toda la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <Label htmlFor="master-wa" className="text-sm font-semibold cursor-pointer">
                    Canal WhatsApp API (Meta)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Envío de alertas automáticas vía WhatsApp oficial
                  </p>
                </div>
              </div>
              <Switch
                id="master-wa"
                checked={config.whatsapp_activo}
                onCheckedChange={(val) => handleToggle("whatsapp_activo", val)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Web Push (Celulares y Navegadores)</p>
                  <p className="text-xs text-muted-foreground">
                    Alertas push en iPhone PWA, Android y computadoras
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testPushMutation.mutate()}
                disabled={testPushMutation.isPending}
                className="text-xs gap-1.5"
              >
                {testPushMutation.isPending ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Bell className="h-3 w-3" />
                )}
                Probar Push
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Módulos de Alertas Configurables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Módulos y Disparadores de Alertas
            </CardTitle>
            <CardDescription className="text-xs">
              Elegí qué eventos generan alertas automáticas en el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
              <div className="flex items-center gap-2.5">
                <Gauge className="h-4 w-4 text-blue-500" />
                <div>
                  <Label htmlFor="mod-satcom" className="text-xs font-semibold cursor-pointer">
                    Exceso de Velocidad GPS / Satcom
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Detecta excesos de velocidad en máquinas en tiempo real
                  </p>
                </div>
              </div>
              <Switch
                id="mod-satcom"
                checked={config.satcom_velocidad_activo}
                onCheckedChange={(val) => handleToggle("satcom_velocidad_activo", val)}
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
              <div className="flex items-center gap-2.5">
                <Wrench className="h-4 w-4 text-amber-500" />
                <div>
                  <Label htmlFor="mod-maint" className="text-xs font-semibold cursor-pointer">
                    Mantenimiento y Combustible
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Services programados por horas y consumos de combustible
                  </p>
                </div>
              </div>
              <Switch
                id="mod-maint"
                checked={config.combustible_mantenimiento_activo}
                onCheckedChange={(val) => handleToggle("combustible_mantenimiento_activo", val)}
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-4 w-4 text-purple-500" />
                <div>
                  <Label htmlFor="mod-docs" className="text-xs font-semibold cursor-pointer">
                    Documentación y Vencimientos
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Carnets de conducir, seguros y VTV próximos a expirar
                  </p>
                </div>
              </div>
              <Switch
                id="mod-docs"
                checked={config.documentacion_activo}
                onCheckedChange={(val) => handleToggle("documentacion_activo", val)}
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div>
                  <Label htmlFor="mod-incid" className="text-xs font-semibold cursor-pointer">
                    Incidentes y Averías Críticas
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Avisos inmediatos al registrar un siniestro o rotura
                  </p>
                </div>
              </div>
              <Switch
                id="mod-incid"
                checked={config.incidentes_activo}
                onCheckedChange={(val) => handleToggle("incidentes_activo", val)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nota de Seguridad e Integridad del Sistema */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-foreground">
            Garantía de Seguridad e Integridad de Datos
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Habilitar o pausar cualquiera de estas notificaciones <strong>no afecta ni elimina ninguna información</strong> de la base de datos, jornadas registradas, planillas de Google Sheets ni descargas de Excel. La plataforma continúa registrando todas las operaciones normalmente y solo ajusta el envío de avisos en tiempo real.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AdminNotificaciones;
