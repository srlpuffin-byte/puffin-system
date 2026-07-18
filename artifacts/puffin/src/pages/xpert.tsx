import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Satellite, Gauge, Zap, Navigation, Clock, Activity, Settings, Radio, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SatcomMap } from "@/components/map/SatcomMap";

interface Maquina {
  id: number;
  nombre: string;
  tipo: string;
  estado: string;
  horometro: number;
  kilometros: number;
  satcom_id?: number | null;
}

interface SatcomDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  positionId: number;
}

interface MapPoint {
  maquina_id: number;
  nombre: string;
  tipo: string;
  estado_satcom: string;
  lat: number | null;
  lng: number | null;
  velocidad_kmh: number | null;
  encendido: boolean;
}

const TELEMETRY_FIELDS = [
  { icon: Navigation, label: "Posición GPS", desc: "Coordenadas en tiempo real" },
  { icon: Gauge, label: "Velocidad", desc: "Velocidad actual del vehículo" },
  { icon: Zap, label: "Estado de encendido", desc: "Motor encendido / apagado" },
  { icon: Clock, label: "Horas de motor", desc: "Horómetro en tiempo real" },
  { icon: Activity, label: "Kilometraje", desc: "Odómetro actualizado automáticamente" },
  { icon: Radio, label: "Detenciones", desc: "Registro de paradas y tiempos detenido" },
];

export function Xpert() {
  const queryClient = useQueryClient();
  const [linkingMaquina, setLinkingMaquina] = useState<number | null>(null);

  const { data: maquinas = [] } = useQuery<Maquina[]>({
    queryKey: ["maquinas"],
    queryFn: () => apiFetch("/maquinas"),
  });

  const { data: devices = [] } = useQuery<SatcomDevice[]>({
    queryKey: ["satcom-devices"],
    queryFn: () => apiFetch("/integrations/xpert/devices"),
  });

  const { data: mapPoints = [], isLoading: mapLoading, refetch: refetchMap } = useQuery<MapPoint[]>({
    queryKey: ["satcom-mapa"],
    queryFn: () => apiFetch("/integrations/xpert/mapa"),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const linkMutation = useMutation({
    mutationFn: async ({ maquina_id, satcom_id }: { maquina_id: number; satcom_id: number }) => {
      return apiFetch("/integrations/xpert/link", {
        method: "POST",
        body: JSON.stringify({ maquina_id, satcom_id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maquinas"] });
      queryClient.invalidateQueries({ queryKey: ["satcom-mapa"] });
      setLinkingMaquina(null);
    }
  });

  const linkedCount = maquinas.filter(m => m.satcom_id).length;
  const isConfigured = devices.length > 0;
  const onlineCount = mapPoints.filter(p => p.estado_satcom === "online").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-600 p-2">
          <Satellite className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Xpert Satcom</h1>
          <p className="text-sm text-muted-foreground">Telemetría satelital y rastreo GPS de maquinaria</p>
        </div>
        <Badge variant={isConfigured ? "default" : "secondary"} className={isConfigured ? "ml-auto bg-green-600" : "ml-auto"}>
          {isConfigured ? "Integración activa" : "Integración pendiente"}
        </Badge>
      </div>

      {!isConfigured && (
        <Card className="border-l-4 border-l-yellow-500 bg-yellow-50">
          <CardContent className="pt-4">
            <p className="text-sm text-yellow-800">
              Esta integración requiere instalar los dispositivos GPS Xpert Satcom en la maquinaria y configurar
              las credenciales de acceso a la plataforma. Contactá a Xpert Satcom para activar el servicio.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      {isConfigured && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center p-4">
            <p className="text-2xl font-bold text-primary">{devices.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Dispositivos GPS</p>
          </Card>
          <Card className="text-center p-4">
            <p className="text-2xl font-bold text-green-600">{onlineCount}</p>
            <p className="text-xs text-muted-foreground mt-1">En línea ahora</p>
          </Card>
          <Card className="text-center p-4">
            <p className="text-2xl font-bold text-blue-600">{linkedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Máquinas vinculadas</p>
          </Card>
        </div>
      )}

      {/* Mapa */}
      {isConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5 text-blue-600" />
                Ubicación en tiempo real
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => refetchMap()} disabled={mapLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${mapLoading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <SatcomMap points={mapPoints} />
            <p className="text-xs text-muted-foreground mt-2 text-right">Actualización automática cada 30 segundos</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Telemetría disponible */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" /> Telemetría disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {TELEMETRY_FIELDS.map((f) => (
                <div key={f.label} className={`flex items-center gap-3 p-3 border rounded-lg ${isConfigured ? '' : 'opacity-60'}`}>
                  <div className="rounded-lg bg-slate-100 p-2">
                    <f.icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  <Badge variant={isConfigured ? "default" : "secondary"} className={`ml-auto text-xs ${isConfigured ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}`}>
                    {isConfigured ? "Activo" : "Pendiente"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Maquinaria a conectar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" /> Maquinaria a conectar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {maquinas.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">No hay maquinaria registrada</p>
              )}
              {maquinas.map((maq) => (
                <div key={maq.id} className="flex flex-col gap-2 p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{maq.nombre}</p>
                      <p className="text-xs text-muted-foreground">{maq.tipo}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${maq.satcom_id ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <Badge variant={maq.satcom_id ? "default" : "secondary"} className={maq.satcom_id ? "bg-green-100 text-green-700 hover:bg-green-100 text-xs" : "text-xs"}>
                        {maq.satcom_id ? "Con GPS" : "Sin GPS"}
                      </Badge>
                    </div>
                  </div>

                  {!maq.satcom_id && linkingMaquina === maq.id && (
                    <div className="mt-2 pt-2 border-t flex items-center gap-2">
                      <select
                        className="flex-1 text-sm border rounded p-1"
                        onChange={(e) => {
                          if (e.target.value) {
                            linkMutation.mutate({ maquina_id: maq.id, satcom_id: parseInt(e.target.value) });
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Seleccionar dispositivo...</option>
                        {devices.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.uniqueId})</option>
                        ))}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => setLinkingMaquina(null)}>Cancelar</Button>
                    </div>
                  )}

                  {!maq.satcom_id && linkingMaquina !== maq.id && isConfigured && (
                    <div className="mt-1">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setLinkingMaquina(maq.id)}>
                        Vincular dispositivo
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {maquinas.length > 0 && !isConfigured && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Instalá un dispositivo Xpert Satcom en cada equipo para activar el rastreo GPS
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuración */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Configuración de conexión</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Plataforma</span>
              <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">Xpert Satcom API</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Estado de conexión</span>
              <Badge variant={isConfigured ? "default" : "secondary"} className={isConfigured ? "bg-green-100 text-green-700" : ""}>
                {isConfigured ? "Conectado" : "Sin configurar"}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Módulo</span>
              <span className="font-mono text-xs">/integrations/xpert</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Dispositivos vinculados</span>
              <span className="font-bold">{linkedCount} / {maquinas.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
