import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateProyecto, useGetProyectos, type Proyecto } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas } from "@workspace/api-client-react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetFotografias } from "@workspace/api-client-react";

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
  const [searchEmpleados, setSearchEmpleados] = useState("");
  const [searchMaquinas, setSearchMaquinas] = useState("");

  const updateMut = useUpdateProyecto();
  const { data: proyectos } = useGetProyectos();
  const { data: empleadosData } = useGetEmpleados();
  const { data: maquinasData } = useGetMaquinas();
  const { data: fotografias } = useGetFotografias({ entidad_tipo: "maquina" });

  const getMaquinaFoto = (id: number) => {
    return fotografias?.find(f => f.entidad_id === id)?.url;
  };

  // Filtrar los que ya están asignados a OTROS proyectos activos
  const empleadosEnUso = new Set(proyectos?.filter(p => p.estado === "activo" && p.id !== proyecto?.id).flatMap(p => p.empleados_asignados || []));
  const maquinasEnUso = new Set(proyectos?.filter(p => p.estado === "activo" && p.id !== proyecto?.id).flatMap(p => p.maquinas_asignadas || []));

  const empleados = empleadosData?.filter(emp => !empleadosEnUso.has(emp.id));
  const maquinas = maquinasData?.filter(maq => !maquinasEnUso.has(maq.id));

  // Cargar datos del proyecto al abrir
  useEffect(() => {
    if (proyecto && open) {
      setLugar(proyecto.lugar);
      setHectareas(proyecto.hectareas);
      setPrecioHectarea(proyecto.precio_hectarea);
      setEstado(proyecto.estado);
      setEmpleadosIds(proyecto.empleados_asignados ?? []);
      setMaquinasIds(proyecto.maquinas_asignadas ?? []);
      setSearchEmpleados("");
      setSearchMaquinas("");
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
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empleado..."
                  value={searchEmpleados}
                  onChange={(e) => setSearchEmpleados(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-[220px] border rounded-md p-4">
                <div className="space-y-3">
                  {empleados?.filter(emp => `${emp.nombre} ${emp.apellido}`.toLowerCase().includes(searchEmpleados.toLowerCase())).map(emp => (
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
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar máquina..."
                  value={searchMaquinas}
                  onChange={(e) => setSearchMaquinas(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-[220px] border rounded-md p-4">
                <div className="space-y-4">
                  {maquinas?.filter(m => m.categoria !== "inventario" && (`${m.nombre} ${m.marca || ''} ${m.modelo || ''}`).toLowerCase().includes(searchMaquinas.toLowerCase())).length! > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Maquinaria Pesada</h4>
                      <div className="space-y-3">
                        {maquinas?.filter(m => m.categoria !== "inventario" && (`${m.nombre} ${m.marca || ''} ${m.modelo || ''}`).toLowerCase().includes(searchMaquinas.toLowerCase())).map(maq => (
                          <div key={maq.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-maq-${maq.id}`}
                              checked={maquinasIds.includes(maq.id)}
                              onCheckedChange={() => toggleMaquina(maq.id)}
                            />
                            <HoverCard openDelay={200}>
                              <HoverCardTrigger asChild>
                                <label
                                  htmlFor={`edit-maq-${maq.id}`}
                                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 py-1"
                                >
                                  {maq.nombre} {maq.marca ? `- ${maq.marca} ${maq.modelo || ''}` : ''}
                                  <span className="text-xs text-muted-foreground ml-1">· {maq.patente || maq.dominio || "S/P"}</span>
                                </label>
                              </HoverCardTrigger>
                              {getMaquinaFoto(maq.id) && (
                                <HoverCardContent side="right" className="w-64 p-0 overflow-hidden shadow-lg border-2 border-primary/20">
                                  <img src={getMaquinaFoto(maq.id)} alt={maq.nombre} className="w-full h-auto object-cover aspect-video" />
                                </HoverCardContent>
                              )}
                            </HoverCard>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {maquinas?.filter(m => m.categoria === "inventario" && (`${m.nombre} ${m.codigo || ''} ${m.tipo || ''}`).toLowerCase().includes(searchMaquinas.toLowerCase())).length! > 0 && (
                    <div className="pt-2">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Inventario / Herramientas</h4>
                      <div className="space-y-3">
                        {maquinas?.filter(m => m.categoria === "inventario" && (`${m.nombre} ${m.codigo || ''} ${m.tipo || ''}`).toLowerCase().includes(searchMaquinas.toLowerCase())).map(maq => (
                          <div key={maq.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-maq-${maq.id}`}
                              checked={maquinasIds.includes(maq.id)}
                              onCheckedChange={() => toggleMaquina(maq.id)}
                            />
                            <HoverCard openDelay={200}>
                              <HoverCardTrigger asChild>
                                <label
                                  htmlFor={`edit-maq-${maq.id}`}
                                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 py-1"
                                >
                                  {maq.nombre}
                                  <span className="text-xs text-muted-foreground ml-1">· {maq.codigo || maq.tipo}</span>
                                </label>
                              </HoverCardTrigger>
                              {getMaquinaFoto(maq.id) && (
                                <HoverCardContent side="right" className="w-64 p-0 overflow-hidden shadow-lg border-2 border-primary/20">
                                  <img src={getMaquinaFoto(maq.id)} alt={maq.nombre} className="w-full h-auto object-cover aspect-video" />
                                </HoverCardContent>
                              )}
                            </HoverCard>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
