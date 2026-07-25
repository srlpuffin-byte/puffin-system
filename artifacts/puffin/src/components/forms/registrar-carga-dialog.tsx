import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCreateCombustible, useGetEmpleados, useGetMaquinas, getGetCombustibleQueryKey, useUploadFotografia, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { Camera, Tractor, Users, Briefcase, Check, ChevronsUpDown } from "lucide-react";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
  empleadoIdFijo?: number;
}

export function RegistrarCargaDialog({ open, onOpenChange, maquinaIdFija, empleadoIdFijo }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateCombustible();
  const uploadMut = useUploadFotografia();
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas } = useGetMaquinas();
  const { data: user } = useGetMe();
  const { data: proyectos } = useGetProyectos();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";
  const [fotoNivel, setFotoNivel] = useState<{ base64: string; name: string } | null>(null);
  const [openOperario, setOpenOperario] = useState(false);
  const [openMaquina, setOpenMaquina] = useState(false);

  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    litros: "",
    precio: "",
    importe: "",
    estacion: "",
    kilometraje: "",
  });

  const set = (field: string, val: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if ((field === "litros" || field === "precio") && next.litros && next.precio) {
        next.importe = (parseFloat(next.litros) * parseFloat(next.precio)).toFixed(0);
      }
      return next;
    });
  };

  useEffect(() => {
    if (isEmpleado && user && empleados?.length) {
      const miEmpleado = empleados.find(e => 
        e.nombre.toLowerCase() === user.nombre.toLowerCase() && 
        e.apellido.toLowerCase() === user.apellido.toLowerCase()
      );
      if (miEmpleado && !form.empleado_id) {
        set("empleado_id", miEmpleado.id.toString());
      }
    }
  }, [isEmpleado, user, empleados, form.empleado_id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empleado_id || !form.maquina_id || !form.litros) {
      toast.error("Operario, máquina y litros son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          litros: parseFloat(form.litros),
          precio: form.precio ? parseFloat(form.precio) : undefined,
          importe: form.importe ? parseFloat(form.importe) : undefined,
          estacion: form.estacion || undefined,
          kilometraje: form.kilometraje ? parseFloat(form.kilometraje) : undefined,
        },
      },
      {
        onSuccess: async (carga) => {
          if (fotoNivel && carga.id) {
            try {
              await uploadMut.mutateAsync({
                data: {
                  entidad_tipo: "combustible",
                  entidad_id: carga.id,
                  base64Data: fotoNivel.base64,
                  filename: fotoNivel.name,
                  descripcion: "Foto nivel combustible"
                }
              });
            } catch {}
          }
          toast.success("Carga de combustible registrada");
          queryClient.invalidateQueries({ queryKey: getGetCombustibleQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", litros: "", precio: "", importe: "", estacion: "", kilometraje: "" });
          setFotoNivel(null);
        },
        onError: () => toast.error("Error al registrar la carga"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Carga de Combustible</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario *</Label>
              <Popover open={openOperario} onOpenChange={setOpenOperario}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openOperario}
                    className="w-full justify-between"
                    disabled={isEmpleado}
                  >
                    {form.empleado_id && empleados
                      ? empleados.find((e) => e.id.toString() === form.empleado_id)
                        ? `${empleados.find((e) => e.id.toString() === form.empleado_id)?.apellido}, ${empleados.find((e) => e.id.toString() === form.empleado_id)?.nombre}`
                        : "Seleccionar operario"
                      : "Seleccionar operario"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar operario..." />
                    <CommandList>
                      <CommandEmpty>No se encontró ningún operario.</CommandEmpty>
                      <CommandGroup>
                        {Array.isArray(empleados) ? empleados.map(e => {
                          const asig = proyectos?.find(p => p.empleados_asignados?.includes(e.id));
                          return (
                            <CommandItem
                              key={e.id}
                              value={`${e.apellido} ${e.nombre}`}
                              onSelect={() => {
                                set("empleado_id", e.id.toString());
                                setOpenOperario(false);
                              }}
                            >
                              <HoverCard openDelay={100} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <div className="flex items-center w-full cursor-help">
                                    <Check className={cn("mr-2 h-4 w-4", form.empleado_id === e.id.toString() ? "opacity-100" : "opacity-0")} />
                                    {e.apellido}, {e.nombre}
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent side="right" align="start" className="w-72 shadow-xl z-[999999]">
                                  <h4 className="font-bold text-sm border-b pb-2 mb-3 text-primary flex items-center gap-1">
                                    <Users className="h-4 w-4" /> {e.nombre} {e.apellido}
                                  </h4>
                                  <div className="text-xs text-slate-600">
                                    <div className="flex items-center gap-1 font-semibold text-slate-500 mb-1"><Briefcase className="h-3 w-3"/> Proyecto asignado:</div>
                                    {asig ? <span className="font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{asig.lugar}</span> : <span className="italic text-slate-400">Sin proyecto asignado</span>}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            </CommandItem>
                          );
                        }) : null}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina *</Label>
              <Popover open={openMaquina} onOpenChange={setOpenMaquina}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openMaquina}
                    className="w-full justify-between h-auto min-h-10 py-2"
                  >
                    {form.maquina_id && maquinas
                      ? (function() {
                          const m = maquinas.find((m) => m.id.toString() === form.maquina_id);
                          return m ? (
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-sm">
                                {m.nombre}{m.patente ? ` (${m.patente})` : m.dominio ? ` (${m.dominio})` : ''}
                              </span>
                            </div>
                          ) : "Seleccionar máquina";
                        })()
                      : "Seleccionar máquina"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar máquina..." />
                    <CommandList>
                      <CommandEmpty>No se encontró ninguna máquina.</CommandEmpty>
                      <CommandGroup>
                        {Array.isArray(maquinas) ? maquinas.filter(m => m.categoria !== "inventario").map(m => {
                          const asig = proyectos?.find(p => p.maquinas_asignadas?.includes(m.id));
                          return (
                            <CommandItem
                              key={m.id}
                              value={`${m.nombre} ${m.patente || ''} ${m.dominio || ''}`}
                              onSelect={() => {
                                set("maquina_id", m.id.toString());
                                setOpenMaquina(false);
                              }}
                              className="py-2"
                            >
                              <HoverCard openDelay={100} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <div className="flex items-center w-full cursor-help">
                                    <Check className={cn("mr-2 h-4 w-4 shrink-0", form.maquina_id === m.id.toString() ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col text-left overflow-hidden">
                                      <span className="font-semibold text-sm truncate">
                                        {m.nombre}{m.patente ? ` (${m.patente})` : m.dominio ? ` (${m.dominio})` : ''}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground mt-0.5 flex gap-2 truncate">
                                        <span className="font-medium text-slate-500">M: <span className="font-normal text-slate-700">{m.marca || "-"}</span></span>
                                        <span className="font-medium text-slate-500">Mod: <span className="font-normal text-slate-700">{m.modelo || "-"}</span></span>
                                      </span>
                                    </div>
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent side="right" align="start" className="w-72 shadow-xl z-[999999]">
                                  <h4 className="font-bold text-sm border-b pb-2 mb-3 text-primary flex items-center gap-1">
                                    <Tractor className="h-4 w-4" /> {m.nombre}
                                  </h4>
                                  <div className="text-xs text-slate-600 mb-3">
                                    <div className="flex items-center gap-1 font-semibold text-slate-500 mb-1"><Briefcase className="h-3 w-3"/> Proyecto asignado:</div>
                                    {asig ? <span className="font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{asig.lugar}</span> : <span className="italic text-slate-400">Sin proyecto asignado</span>}
                                  </div>
                                  <div className="grid grid-cols-2 gap-y-2 gap-x-1 text-xs">
                                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Marca</div>
                                    <div>{m.marca || "-"}</div>
                                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Modelo</div>
                                    <div>{m.modelo || "-"}</div>
                                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Patente</div>
                                    <div>{m.patente || m.dominio || "-"}</div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            </CommandItem>
                          );
                        }) : null}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Litros *</Label>
              <Input type="number" step="0.01" placeholder="180" value={form.litros} onChange={e => set("litros", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Precio por litro ($)</Label>
              <Input type="number" step="0.01" placeholder="1250" value={form.precio} onChange={e => set("precio", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Importe total ($)</Label>
              <Input type="number" placeholder="Auto" value={form.importe} onChange={e => set("importe", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Estación de servicio</Label>
              <Input placeholder="YPF Autopista Norte" value={form.estacion} onChange={e => set("estacion", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kilometraje actual (km)</Label>
              <Input type="number" placeholder="89500" value={form.kilometraje} onChange={e => set("kilometraje", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Foto del nivel de combustible</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors text-sm">
                <Camera className="h-4 w-4" />
                {fotoNivel ? "Foto cargada ✓" : "Tomar / subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1];
                      setFotoNivel({ base64, name: file.name });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {fotoNivel && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setFotoNivel(null)}>
                  Quitar
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Guardando..." : "Registrar Carga"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
