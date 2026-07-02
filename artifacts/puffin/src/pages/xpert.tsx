import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Satellite, Gauge, Zap, Navigation, Clock, Activity, Settings, Radio } from "lucide-react";

interface Maquina {
  id: number;
  nombre: string;
  tipo: string;
  estado: string;
  horometro: number;
  kilometros: number;
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
  const { data: maquinas = [] } = useQuery<Maquina[]>({
    queryKey: ["maquinas"],
    queryFn: () => apiFetch("/maquinas"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-600 p-2">
          <Satellite className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Xpert Satcom</h1>
          <p className="text-sm text-muted-foreground">Telemetría satelital y rastreo GPS de maquinaria</p>
        </div>
        <Badge variant="secondary" className="ml-auto">Integración pendiente</Badge>
      </div>

      <Card className="border-l-4 border-l-yellow-500 bg-yellow-50">
        <CardContent className="pt-4">
          <p className="text-sm text-yellow-800">
            Esta integración requiere instalar los dispositivos GPS Xpert Satcom en la maquinaria y configurar 
            las credenciales de acceso a la plataforma. Contactá a Xpert Satcom para activar el servicio.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" /> Telemetría disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {TELEMETRY_FIELDS.map((f) => (
                <div key={f.label} className="flex items-center gap-3 p-3 border rounded-lg opacity-60">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <f.icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto text-xs">Pendiente</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" /> Maquinaria a conectar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {maquinas.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">No hay maquinaria registrada</p>
              )}
              {maquinas.map((maq) => (
                <div key={maq.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{maq.nombre}</p>
                    <p className="text-xs text-muted-foreground">{maq.tipo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-300" />
                    <Badge variant="secondary" className="text-xs">Sin GPS</Badge>
                  </div>
                </div>
              ))}
              {maquinas.length > 0 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Instalá un dispositivo Xpert Satcom en cada equipo para activar el rastreo GPS
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
              <Badge variant="secondary">Sin configurar</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Módulo</span>
              <span className="font-mono text-xs">/integrations/xpert</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Dispositivos registrados</span>
              <span className="font-bold">0</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
