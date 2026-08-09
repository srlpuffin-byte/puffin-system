import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Wifi, WifiOff, Zap, ZapOff, Plus, Pencil, Check, X, Link as LinkIcon, Unlink, Settings2, Search, Tractor } from "lucide-react";
import { SatcomMap } from "@/components/map/SatcomMap";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetMaquinas, getGetMaquinasQueryKey } from "@workspace/api-client-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

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
  proyecto_lugar?: string | null;
}

interface SatcomDevice {
  id: number;
  name: string;
  status: string;
}

// Dialog mode: "link-unlinked" (link a free device) | "relink" (change GPS of a linked machine)
type LinkDialogMode = "link-unlinked" | "relink";

export function Gps() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  // Link dialog state
  const [linkDialog, setLinkDialog] = useState<{
    open: boolean;
    mode: LinkDialogMode;
    point: MapPoint | null;  // the GPS point being acted on
  }>({ open: false, mode: "link-unlinked", point: null });
  const [selectedMaquinaId, setSelectedMaquinaId] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [machineSearch, setMachineSearch] = useState("");
  const [machineRelinkSearch, setMachineRelinkSearch] = useState("");

  const queryClient = useQueryClient();
  const { data: maquinas } = useGetMaquinas();

  // Fetch all Satcom devices (for re-linking picker)
  const { data: satcomDevices = [] } = useQuery<SatcomDevice[]>({
    queryKey: ["satcom-devices"],
    queryFn: () => apiFetch("/integrations/xpert/devices"),
    staleTime: 60_000,
  });

  const { data: mapPoints = [], isLoading, refetch } = useQuery<MapPoint[]>({
    queryKey: ["satcom-mapa"],
    queryFn: () => apiFetch("/integrations/xpert/mapa"),
    refetchInterval: 30000,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────────

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
      queryClient.invalidateQueries({ queryKey: getGetMaquinasQueryKey() });
    },
    onError: () => toast.error("Error al crear la máquina"),
  });

  const linkMaquinaMutation = useMutation({
    mutationFn: async ({ maquina_id, satcom_id }: { maquina_id: number; satcom_id: number }) => {
      return apiFetch("/integrations/xpert/link", {
        method: "POST",
        body: JSON.stringify({ maquina_id, satcom_id }),
      });
    },
    onSuccess: () => {
      toast.success("GPS vinculado correctamente");
      queryClient.invalidateQueries({ queryKey: ["satcom-mapa"] });
      queryClient.invalidateQueries({ queryKey: getGetMaquinasQueryKey() });
      setLinkDialog({ open: false, mode: "link-unlinked", point: null });
    },
    onError: () => toast.error("Error al vincular el GPS"),
  });

  // Unlink: set satcom_id to null on the machine
  const unlinkMutation = useMutation({
    mutationFn: async (maquina_id: number) => {
      return apiFetch(`/maquinas/${maquina_id}`, {
        method: "PUT",
        body: JSON.stringify({ satcom_id: null }),
      });
    },
    onSuccess: () => {
      toast.success("GPS desvinculado correctamente");
      queryClient.invalidateQueries({ queryKey: ["satcom-mapa"] });
      queryClient.invalidateQueries({ queryKey: getGetMaquinasQueryKey() });
    },
    onError: () => toast.error("Error al desvincular el GPS"),
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
    onError: () => toast.error("Error al actualizar el nombre"),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const openRelinkDialog = (point: MapPoint) => {
    setLinkDialog({ open: true, mode: "relink", point });
    setSelectedDeviceId("");
    setSelectedMaquinaId("");
    setMachineRelinkSearch("");
  };

  const openLinkUnlinkedDialog = (point: MapPoint) => {
    setLinkDialog({ open: true, mode: "link-unlinked", point });
    setSelectedMaquinaId("");
    setMachineSearch("");
  };

  const handleLinkConfirm = () => {
    if (!linkDialog.point) return;

    if (linkDialog.mode === "link-unlinked") {
      // Linking a free GPS to an existing machine
      if (linkDialog.point.device_id && selectedMaquinaId) {
        linkMaquinaMutation.mutate({
          maquina_id: parseInt(selectedMaquinaId),
          satcom_id: linkDialog.point.device_id,
        });
      }
    } else {
      // Re-linking: assign the CURRENT GPS device to a DIFFERENT machine
      // The backend will automatically unlink it from the old machine
      if (linkDialog.point.device_id && selectedMaquinaId) {
        linkMaquinaMutation.mutate({
          maquina_id: parseInt(selectedMaquinaId),
          satcom_id: linkDialog.point.device_id,
        });
      }
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────────

  const withGps = mapPoints.filter(p => p.lat !== null);
  const online = mapPoints.filter(p => p.estado_satcom === "online");
  const linkedPoints = mapPoints.filter(p => !p.is_unlinked);
  const unlinkedPoints = mapPoints.filter(p => p.is_unlinked);

  // Satcom devices that are currently free (not used by any linked machine)
  const linkedDeviceIds = new Set(linkedPoints.map(p => p.device_id).filter(Boolean));
  const freeDevices = satcomDevices.filter(d => !linkedDeviceIds.has(d.id));

  const [mobileView, setMobileView] = useState<"lista" | "mapa">("mapa");

  // ─── Render ───────────────────────────────────────────────────────────────────

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

        {/* Sidebar */}
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
                <div
                  key={pointId}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/60 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"}`}
                >
                  {/* Clickable area for map focus */}
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedId(isSelected ? null : pointId);
                      setMobileView("mapa");
                    }}
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
                          <span className="text-sm font-medium truncate">{p.nombre}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.encendido ? <Zap className="h-3 w-3 text-green-600" /> : <ZapOff className="h-3 w-3 text-slate-400" />}
                        {hasGps ? <Wifi className="h-3 w-3 text-blue-500" /> : <WifiOff className="h-3 w-3 text-slate-300" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-4 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">{p.tipo}</span>
                      {p.proyecto_lugar && (
                        <span className="text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                          En: {p.proyecto_lugar}
                        </span>
                      )}
                      {p.velocidad_kmh !== null && p.velocidad_kmh > 0 && (
                        <span className="text-[11px] font-medium text-blue-600">{p.velocidad_kmh} km/h</span>
                      )}
                    </div>
                    {!hasGps && (
                      <p className="text-[10px] text-amber-600 ml-4 mt-1">Sin señal GPS</p>
                    )}
                  </button>

                  {/* Action row: rename + GPS management */}
                  <div className="flex items-center gap-1 mt-2 ml-4" onClick={e => e.stopPropagation()}>
                    <button
                      className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                      onClick={() => { setEditingId(p.maquina_id); setEditingName(p.nombre); }}
                    >
                      <Pencil className="h-2.5 w-2.5" /> Renombrar
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
                          <Settings2 className="h-2.5 w-2.5" /> GPS
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem
                          onClick={() => openRelinkDialog(p)}
                          className="cursor-pointer text-sm"
                        >
                          <LinkIcon className="h-3.5 w-3.5 mr-2 text-blue-500" />
                          Cambiar dispositivo GPS
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            if (p.maquina_id && confirm(`¿Desvincular el GPS de "${p.nombre}"? La máquina quedará sin rastreo hasta que se vincule nuevamente.`)) {
                              unlinkMutation.mutate(p.maquina_id);
                            }
                          }}
                          className="cursor-pointer text-sm text-red-600 focus:text-red-600"
                        >
                          <Unlink className="h-3.5 w-3.5 mr-2" />
                          Desvincular GPS
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
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
                          {p.encendido ? <Zap className="h-3 w-3 text-green-600" /> : <ZapOff className="h-3 w-3 text-slate-400" />}
                          {hasGps ? <Wifi className="h-3 w-3 text-amber-500" /> : <WifiOff className="h-3 w-3 text-slate-300" />}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-amber-600/80 font-medium">Equipo sin asignar</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs bg-amber-200/50 hover:bg-amber-200 text-amber-900 border-0 px-2 shadow-none"
                            onClick={(e) => { e.stopPropagation(); openLinkUnlinkedDialog(p); }}
                          >
                            <LinkIcon className="h-3 w-3 sm:mr-1" />
                            <span className="hidden sm:inline">Vincular</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs bg-amber-200/50 hover:bg-amber-200 text-amber-900 border-0 px-2 shadow-none"
                            disabled={createMaquinaMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); createMaquinaMutation.mutate(p); }}
                          >
                            {createMaquinaMutation.isPending ? "..." : (
                              <>
                                <Plus className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">Crear</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Map */}
        <div className={`
          ${mobileView === "mapa" ? "flex" : "hidden"} sm:flex
          flex-1 flex-col relative
        `} style={{ minHeight: 0 }}>
          <SatcomMap points={mapPoints} activePointId={selectedId} height="100%" />
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-3 border text-xs space-y-1.5 z-[1000]">
            <p className="font-semibold text-slate-700 mb-2">Leyenda</p>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> Encendida / En línea</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" /> Apagada / Sin señal</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" /> Estado desconocido</div>
          </div>
          <button
            onClick={() => setMobileView("lista")}
            className="sm:hidden absolute top-3 left-3 z-[1001] bg-white shadow-md rounded-lg px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 text-slate-700"
          >
            ← Lista
          </button>
        </div>

      </div>

      {/* ── Link / Re-link Dialog ─────────────────────────────────────────── */}
      <Dialog open={linkDialog.open} onOpenChange={(open) => !open && setLinkDialog({ open: false, mode: "link-unlinked", point: null })}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {linkDialog.mode === "relink" ? "Cambiar dispositivo GPS" : "Vincular GPS a Máquina Existente"}
            </DialogTitle>
            <DialogDescription>
              {linkDialog.mode === "relink" ? (
                <>Seleccioná a qué máquina corresponde el GPS <b>{linkDialog.point?.nombre}</b>.</>
              ) : (
                <>Seleccioná a qué máquina corresponde el GPS <b>{linkDialog.point?.nombre}</b>.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {linkDialog.mode === "link-unlinked" ? (
              // Visual card grid: pick an EXISTING MACHINE (without GPS)
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar máquina por nombre o patente..."
                    value={machineSearch}
                    onChange={e => setMachineSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                  {maquinas
                    ?.filter(m =>
                      m.estado !== "baja" &&
                      !(m as any).satcom_id &&
                      (`${m.nombre} ${m.patente || ''} ${m.marca || ''} ${m.modelo || ''}`.toLowerCase().includes(machineSearch.toLowerCase()))
                    )
                    .map(m => {
                      const isChosen = selectedMaquinaId === m.id.toString();
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMaquinaId(m.id.toString())}
                          className={`group relative rounded-xl border-2 overflow-hidden text-left transition-all focus:outline-none ${
                            isChosen
                              ? "border-primary shadow-md ring-2 ring-primary/30"
                              : "border-slate-200 hover:border-primary/50 hover:shadow-sm"
                          }`}
                        >
                          {/* Photo */}
                          <div className="aspect-video w-full bg-slate-100 relative overflow-hidden">
                            {(m as any).imagen_url ? (
                              <img
                                src={(m as any).imagen_url}
                                alt={m.nombre}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Tractor className="h-10 w-10 text-slate-300" />
                              </div>
                            )}
                            {isChosen && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <Check className="h-8 w-8 text-primary drop-shadow-lg" />
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div className="p-2">
                            <p className="text-xs font-semibold leading-tight truncate text-slate-800">{m.nombre}</p>
                            {(m.marca || m.modelo) && (
                              <p className="text-[10px] text-muted-foreground truncate">{m.marca} {m.modelo}</p>
                            )}
                            {m.patente && (
                              <p className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1 rounded mt-0.5 inline-block">{m.patente}</p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  }
                  {maquinas?.filter(m => m.estado !== "baja" && !(m as any).satcom_id).length === 0 && (
                    <div className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                      No hay máquinas disponibles sin GPS asignado
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog({ open: false, mode: "link-unlinked", point: null })}>
              Cancelar
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={
                linkMaquinaMutation.isPending ||
                !selectedMaquinaId || selectedMaquinaId === "none"
              }
              onClick={handleLinkConfirm}
            >
              {linkMaquinaMutation.isPending ? "Guardando..." : (linkDialog.mode === "relink" ? "Cambiar GPS" : "Vincular")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
