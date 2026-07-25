import React, { useState } from "react";
import { useCreateCombustible, useGetEmpleados, useGetMaquinas, getGetCombustibleQueryKey, useUploadFotografia, useGetMe } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Tractor, Users, Briefcase } from "lucide-react";
import { useGetProyectos } from "@/hooks/use-proyectos";

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
  const [hoveredItem, setHoveredItem] = useState<{ tipo: 'operario' | 'maquina', id: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

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
      <Dialog open={open} onOpenChange={open => {
        onOpenChange(open);
        if (!open) setHoveredItem(null);
      }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Carga de Combustible</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario *</Label>
              <Select
                value={form.empleado_id}
                onValueChange={v => set("empleado_id", v)}
                disabled={isEmpleado}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar operario" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(empleados) ? empleados.map(e => (
                    <SelectItem 
                      key={e.id} 
                      value={e.id.toString()}
                      onPointerMove={(ev) => {
                        setHoveredItem({ tipo: 'operario', id: e.id });
                        setMousePos({ x: ev.clientX, y: ev.clientY });
                      }}
                      onPointerLeave={() => setHoveredItem(null)}
                    >
                      {e.apellido}, {e.nombre}
                    </SelectItem>
                  )) : null}
                </SelectContent>
              </Select>
            </div>
          )}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina *</Label>
              <Select
                value={form.maquina_id}
                onValueChange={v => set("maquina_id", v)}
                required
              >
                <SelectTrigger className="h-auto min-h-10 py-2">
                  <SelectValue placeholder="Seleccionar máquina" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(maquinas) ? maquinas.filter(m => m.categoria !== "inventario").map(m => (
                    <SelectItem 
                      key={m.id} 
                      value={m.id.toString()} 
                      className="py-2"
                      onPointerMove={(ev) => {
                        setHoveredItem({ tipo: 'maquina', id: m.id });
                        setMousePos({ x: ev.clientX, y: ev.clientY });
                      }}
                      onPointerLeave={() => setHoveredItem(null)}
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-sm">
                          {m.nombre}{m.patente ? ` (${m.patente})` : m.dominio ? ` (${m.dominio})` : ''}
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 flex gap-2">
                          <span className="font-medium text-slate-500">M: <span className="font-normal text-slate-700">{m.marca || "-"}</span></span>
                          <span className="font-medium text-slate-500">Mod: <span className="font-normal text-slate-700">{m.modelo || "-"}</span></span>
                          <span className="font-medium text-slate-500">Año: <span className="font-normal text-slate-700">{m.anio || "-"}</span></span>
                        </span>
                      </div>
                    </SelectItem>
                  )) : null}
                </SelectContent>
              </Select>
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

      {/* Custom Tooltip that escapes Radix UI traps */}
      {hoveredItem && open && (
        <div 
          style={{ position: 'fixed', left: mousePos.x + 20, top: mousePos.y - 40, zIndex: 999999 }}
          className="bg-white border-2 border-slate-200 shadow-2xl p-4 w-72 rounded-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100"
        >
          {hoveredItem.tipo === 'maquina' ? (() => {
            const m = maquinas?.find(x => x.id === hoveredItem.id);
            if (!m) return null;
            const asig = proyectos?.find(p => p.maquinas_asignadas?.includes(m.id));
            return (
              <div>
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
              </div>
            );
          })() : (() => {
            const e = empleados?.find(x => x.id === hoveredItem.id);
            if (!e) return null;
            const asig = proyectos?.find(p => p.empleados_asignados?.includes(e.id));
            return (
              <div>
                <h4 className="font-bold text-sm border-b pb-2 mb-3 text-primary flex items-center gap-1">
                  <Users className="h-4 w-4" /> {e.nombre} {e.apellido}
                </h4>
                <div className="text-xs text-slate-600">
                  <div className="flex items-center gap-1 font-semibold text-slate-500 mb-1"><Briefcase className="h-3 w-3"/> Proyecto asignado:</div>
                  {asig ? <span className="font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{asig.lugar}</span> : <span className="italic text-slate-400">Sin proyecto asignado</span>}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </Dialog>
  );
}
