import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Wifi, WifiOff, Zap, ZapOff, Plus, Pencil, Check, X } from "lucide-react";
import { SatcomMap } from "@/components/map/SatcomMap";
import { toast } from "sonner";

interface MapPoint {
  maquina_id: number | null;
  device_id: number | null;
  nombre: string;
  tipo: string;
  estado_satcom: string;
  lat: number | null;
  lng: number | null;
  velocidad_kmh: number | null;
  encendido: boolean;
  is_unlinked?: boolean;
  imagen_url?: string | null;
}

export function Gps() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const queryClient = useQueryClient();

  const { data: mapPoints = [], isLoading, refetch } = useQuery<MapPoint[]>({
    queryKey: ["satcom-mapa"],
    queryFn: () => apiFetch("/integrations/xpert/mapa"),
    refetchInterval: 30000,
  });

  const createMaquinaMutation = useMutation({
    mutationFn: async (device: MapPoint) => {
      return apiFetch("/maquinas", {
        method: "POST",
        body: JSON.stringify({
          nombre: device.nombre,
          tipo: "GPS Asignado",
          categoria: "maquinaria",
          satcom_id: device.device_id
        }),
      });
    },
    onSuccess: () => {
      toast.success("Máquina creada y vinculada correctamente");
      queryClient.invalidateQueries({ queryKey: ["satcom-mapa"] });
    },
    onError: () => {
      toast.error("Error al crear la máquina");
    }
  });

  const updateMaquinaMutation = useMutation({
    mutationFn: async ({ id, nombre }: { id: number; nombre: string }) => {
      return apiFetch(`/maquinas/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nombre }),
      });
    },
    onSuccess: () => {
      toast.success("Nombre actualizado correctamente");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["satcom-mapa"] });
    },
    onError: () => {
      toast.error("Error al actualizar el nombre");
    }
  });

  const withGps = mapPoints.filter(p => p.lat !== null);
  const online = mapPoints.filter(p => p.estado_satcom === "online");
  const linkedPoints = mapPoints.filter(p => !p.is_unlinked);
  const unlinkedPoints = mapPoints.filter(p => p.is_unlinked);

  const [mobileView, setMobileView] = useState<"lista" | "mapa">("mapa");

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0 -m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-base sm:text-xl font-bold tracking-tight text-primary truncate">GPS y Rastreo</h1>
          <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">
            {withGps.length} en mapa · {online.length} en línea
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile toggle */}
          <div className="flex sm:hidden rounded-lg border overflow-hidden text-xs">
            <button
              onClick={() => setMobileView("lista")}
              className={`px-3 py-1.5 font-medium transition-colors ${mobileView === "lista" ? "bg-primary text-white" : "bg-background text-muted-foreground"}`}
            >
              Lista
            </button>
            <button
              onClick={() => setMobileView("mapa")}
              className={`px-3 py-1.5 font-medium transition-colors ${mobileView === "mapa" ? "bg-primary text-white" : "bg-background text-muted-foreground"}`}
            >
              Mapa
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""} sm:mr-2`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Mobile badge */}
      <div className="flex sm:hidden items-center gap-2 px-4 py-1.5 bg-muted/40 text-xs text-muted-foreground border-b shrink-0">
        <span className="font-medium text-foreground">{withGps.length} en mapa</span>
        <span>·</span>
        <span className="text-green-600 font-medium">{online.length} en línea</span>
      </div>

      {/* Main layout: sidebar + map */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — full width on mobile when lista, hidden when mapa */}
        <div className={`
          ${mobileView === "lista" ? "flex" : "hidden"} sm:flex
          w-full sm:w-72 shrink-0 border-r overflow-y-auto bg-background flex-col
        `}>
          <div className="p-3 border-b shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flota ({linkedPoints.length})</p>
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

          <div className="divide-y overflow-y-auto">
            {linkedPoints.map(p => {
              const pointId = `maq-${p.maquina_id}`;
              const isSelected = selectedId === pointId;
              const hasGps = p.lat !== null;
              return (
                <button
                  key={pointId}
                  onClick={() => {
                    setSelectedId(isSelected ? null : pointId);
                    setMobileView("mapa"); // auto-switch to map on mobile
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/60 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        p.estado_satcom === "online" ? "bg-green-500" :
                        p.estado_satcom === "offline" ? "bg-red-400" :
                        "bg-slate-300"
                      }`} />
                      {editingId === p.maquina_id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input 
                            autoFocus
                            className="text-sm font-medium bg-white border border-blue-300 rounded px-1.5 py-0.5 w-32 outline-none focus:ring-2 focus:ring-blue-500"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') updateMaquinaMutation.mutate({ id: p.maquina_id!, nombre: editingName });
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button 
                            className="p-1 hover:bg-green-100 text-green-600 rounded"
                            onClick={() => updateMaquinaMutation.mutate({ id: p.maquina_id!, nombre: editingName })}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button 
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/name">
                          <span className="text-sm font-medium truncate">{p.nombre}</span>
                          <button 
                            className="opacity-0 group-hover/name:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(p.maquina_id);
                              setEditingName(p.nombre);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
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

          {unlinkedPoints.length > 0 && (
            <>
              <div className="p-3 border-y bg-slate-50 shrink-0 mt-auto">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">GPS Sin Asignar ({unlinkedPoints.length})</p>
              </div>
              <div className="divide-y bg-amber-50/30 overflow-y-auto max-h-[40vh]">
                {unlinkedPoints.map(p => {
                  const pointId = `dev-${p.device_id}`;
                  const isSelected = selectedId === pointId;
                  const hasGps = p.lat !== null;
                  return (
                    <button
                      key={pointId}
                      onClick={() => setSelectedId(isSelected ? null : pointId)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-amber-100/50 ${isSelected ? "bg-amber-100 border-l-2 border-l-amber-500" : "border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2 w-2 rounded-full shrink-0 bg-amber-500" />
                          <span className="text-sm font-medium truncate">{p.nombre}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.encendido
                            ? <Zap className="h-3 w-3 text-green-600" />
                            : <ZapOff className="h-3 w-3 text-slate-400" />
                          }
                          {hasGps
                            ? <Wifi className="h-3 w-3 text-amber-500" />
                            : <WifiOff className="h-3 w-3 text-slate-300" />
                          }
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                        <span>No vinculado a ninguna máquina</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="w-full mt-3 bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200"
                        disabled={createMaquinaMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          createMaquinaMutation.mutate(p);
                        }}
                      >
                        {createMaquinaMutation.isPending ? "Creando..." : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Crear máquina
                          </>
                        )}
                      </Button>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Map — full screen on mobile when mapa, hidden when lista */}
        <div className={`
          ${mobileView === "mapa" ? "flex" : "hidden"} sm:flex
          flex-1 flex-col relative
        `} style={{ minHeight: 0 }}>
          <SatcomMap points={mapPoints} activePointId={selectedId} height="100%" />
          {/* Leyenda */}
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-3 border text-xs space-y-1.5 z-[1000]">
            <p className="font-semibold text-slate-700 mb-2">Leyenda</p>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> Encendida / En línea</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" /> Apagada / Sin señal</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" /> Estado desconocido</div>
          </div>
          {/* Volver a lista en mobile */}
          <button
            onClick={() => setMobileView("lista")}
            className="sm:hidden absolute top-3 left-3 z-[1001] bg-white shadow-md rounded-lg px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 text-slate-700"
          >
            ← Lista
          </button>
        </div>

      </div>
    </div>
  );
}
