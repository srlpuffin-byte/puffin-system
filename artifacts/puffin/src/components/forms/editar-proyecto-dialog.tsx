import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateProyecto, type Proyecto } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas } from "@workspace/api-client-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditarProyectoDialogProps {
  proyecto: Proyecto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarProyectoDialog({ proyecto, open, onOpenChange }: EditarProyectoDialogProps) {
  const [lugar, setLugar] = useState("");
  const [hectareas, setHectareas] = useState("");
  const [precioHectarea, setPrecioHectarea] = useState("");
  const [estado, setEstado] = useState("activo");
  const [empleadosIds, setEmpleadosIds] = useState<number[]>([]);
  const [maquinasIds, setMaquinasIds] = useState<number[]>([]);

  const updateMut = useUpdateProyecto();
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();

  // Cargar datos del proyecto al abrir
  useEffect(() => {
    if (proyecto && open) {
      setLugar(proyecto.lugar);
      setHectareas(proyecto.hectareas);
      setPrecioHectarea(proyecto.precio_hectarea);
      setEstado(proyecto.estado);
      setEmpleadosIds(proyecto.empleados_asignados ?? []);
      setMaquinasIds(proyecto.maquinas_asignadas ?? []);
    }
  }, [proyecto, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proyecto) return;
    try {
      await updateMut.mutateAsync({
        id: proyecto.id,
        data: {
          lugar,
          hectareas,
          precio_hectarea: precioHectarea,
          empleados_asignados: empleadosIds,
          maquinas_asignadas: maquinasIds,
          estado,
        },
      });
      toast.success("Proyecto actualizado correctamente");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Error al actualizar el proyecto");
    }
  };

  const gananciaEstimada = (parseFloat(hectareas) || 0) * (parseFloat(precioHectarea) || 0);

  const toggleEmpleado = (id: number) => {
    setEmpleadosIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const toggleMaquina = (id: number) => {
    setMaquinasIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Proyecto</DialogTitle>
          <DialogDescription>
            Modificá los datos del proyecto, asigná más empleados o maquinaria según se requiera.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Lugar del Proyecto *</Label>
              <Input
                value={lugar}
                onChange={e => setLugar(e.target.value)}
                placeholder="Ej. Establecimiento Don Juan"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Hectáreas a Realizar *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={hectareas}
                onChange={e => setHectareas(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Precio por Hectárea ($) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={precioHectarea}
                onChange={e => setPrecioHectarea(e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-500 font-medium">Ganancia Estimada:</span>
              <span className="text-lg font-bold text-green-600">
                ${gananciaEstimada.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Estado del Proyecto</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Empleados Asignados</Label>
                <span className="text-xs text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {empleadosIds.length} seleccionados
                </span>
              </div>
              <ScrollArea className="h-[220px] border rounded-md p-4">
                <div className="space-y-3">
                  {empleados?.map(emp => (
                    <div key={emp.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-emp-${emp.id}`}
                        checked={empleadosIds.includes(emp.id)}
                        onCheckedChange={() => toggleEmpleado(emp.id)}
                      />
                      <label
                        htmlFor={`edit-emp-${emp.id}`}
                        className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                      >
                        {emp.nombre} {emp.apellido}
                        {emp.cargo && <span className="text-xs text-muted-foreground ml-1">· {emp.cargo}</span>}
                      </label>
                    </div>
                  ))}
                  {(!empleados || empleados.length === 0) && (
                    <p className="text-sm text-muted-foreground">No hay empleados disponibles.</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Maquinaria Asignada</Label>
                <span className="text-xs text-muted-foreground bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {maquinasIds.length} seleccionadas
                </span>
              </div>
              <ScrollArea className="h-[220px] border rounded-md p-4">
                <div className="space-y-3">
                  {maquinas?.map(maq => (
                    <div key={maq.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-maq-${maq.id}`}
                        checked={maquinasIds.includes(maq.id)}
                        onCheckedChange={() => toggleMaquina(maq.id)}
                      />
                      <label
                        htmlFor={`edit-maq-${maq.id}`}
                        className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                      >
                        {maq.marca} {maq.modelo}
                        <span className="text-xs text-muted-foreground ml-1">· {maq.patente || maq.dominio || "S/P"}</span>
                      </label>
                    </div>
                  ))}
                  {(!maquinas || maquinas.length === 0) && (
                    <p className="text-sm text-muted-foreground">No hay máquinas disponibles.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMut.isPending} className="bg-primary hover:bg-primary/90 text-white">
              {updateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {updateMut.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
