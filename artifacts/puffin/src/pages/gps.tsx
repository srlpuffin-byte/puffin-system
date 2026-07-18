import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Wifi, WifiOff, Zap, ZapOff } from "lucide-react";
import { SatcomMap } from "@/components/map/SatcomMap";

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

export function Gps() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: mapPoints = [], isLoading, refetch } = useQuery<MapPoint[]>({
    queryKey: ["satcom-mapa"],
    queryFn: () => apiFetch("/integrations/xpert/mapa"),
    refetchInterval: 30000,
  });

  const withGps = mapPoints.filter(p => p.lat !== null);
  const online = mapPoints.filter(p => p.estado_satcom === "online");

  // Highlight selected point
  const displayPoints = selectedId
    ? mapPoints
    : mapPoints;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0 -m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight text-primary">GPS y Rastreo</h1>
          <Badge variant="secondary" className="text-xs">
            {withGps.length} en mapa · {online.length} en línea
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Main layout: map + sidebar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-72 shrink-0 border-r overflow-y-auto bg-background">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flota ({mapPoints.length})</p>
          </div>

          {mapPoints.length === 0 && !isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <p className="text-2xl mb-2">🛰</p>
              <p>No hay máquinas vinculadas con GPS.</p>
              <p className="text-xs mt-1">Configuralo en <span className="font-mono text-primary">Integraciones → Xpert Satcom</span></p>
            </div>
          )}

          {isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">Cargando...</div>
          )}

          <div className="divide-y">
            {mapPoints.map(p => {
              const isSelected = selectedId === p.maquina_id;
              const hasGps = p.lat !== null;
              return (
                <button
                  key={p.maquina_id}
                  onClick={() => setSelectedId(isSelected ? null : p.maquina_id)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/60 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        p.estado_satcom === "online" ? "bg-green-500" :
                        p.estado_satcom === "offline" ? "bg-red-400" :
                        "bg-slate-300"
                      }`} />
                      <span className="text-sm font-medium truncate">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.encendido
                        ? <Zap className="h-3 w-3 text-green-600" />
                        : <ZapOff className="h-3 w-3 text-slate-400" />
                      }
                      {hasGps
                        ? <Wifi className="h-3 w-3 text-blue-500" />
                        : <WifiOff className="h-3 w-3 text-slate-300" />
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-4">
                    <span className="text-[11px] text-muted-foreground">{p.tipo}</span>
                    {p.velocidad_kmh !== null && p.velocidad_kmh > 0 && (
                      <span className="text-[11px] font-medium text-blue-600">{p.velocidad_kmh} km/h</span>
                    )}
                  </div>
                  {!hasGps && (
                    <p className="text-[10px] text-amber-600 ml-4 mt-1">Sin señal GPS</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map — takes all remaining space */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <SatcomMap points={displayPoints} height="100%" />
          {/* Leyenda */}
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-3 border text-xs space-y-1.5 z-[1000]">
            <p className="font-semibold text-slate-700 mb-2">Leyenda</p>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> Encendida / En línea</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" /> Apagada / Sin señal</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" /> Estado desconocido</div>
          </div>
        </div>

      </div>
    </div>
  );
}
