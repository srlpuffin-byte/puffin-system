import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProyecto, useGetProyectos } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas } from "@workspace/api-client-react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useGetFotografias } from "@workspace/api-client-react";

interface NuevoProyectoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevoProyectoDialog({ open, onOpenChange }: NuevoProyectoDialogProps) {
  const [lugar, setLugar] = useState("");
  const [hectareas, setHectareas] = useState("");
  const [precioHectarea, setPrecioHectarea] = useState("");
  const [empleadosIds, setEmpleadosIds] = useState<number[]>([]);
  const [maquinasIds, setMaquinasIds] = useState<number[]>([]);
  const [searchEmpleados, setSearchEmpleados] = useState("");
  const [searchMaquinas, setSearchMaquinas] = useState("");
  
  const createMut = useCreateProyecto();
  const { data: proyectos } = useGetProyectos();
  const { data: empleadosData } = useGetEmpleados();
  const { data: maquinasData } = useGetMaquinas();
  const { data: fotografias } = useGetFotografias({ entidad_tipo: "maquina" } as any);

  const getMaquinaFoto = (id: number) => {
    return fotografias?.find(f => f.entidad_id === id)?.url;
  };

  // Mapear en qué proyecto activo está cada empleado (puede estar en varios)
  const empleadoProyectos = new Map<number, string[]>();
  proyectos?.filter(p => p.estado === "activo").forEach(p => {
    (p.empleados_asignados || []).forEach(empId => {
      const prev = empleadoProyectos.get(empId) || [];
      empleadoProyectos.set(empId, [...prev, p.lugar]);
    });
  });

  // Máquinas: mantener lógica de exclusión (una máquina no puede estar en dos lugares)
  const maquinasEnUso = new Set(proyectos?.filter(p => p.estado === "activo").flatMap(p => p.maquinas_asignadas || []));

  const empleados = empleadosData;
  const maquinas = maquinasData?.filter(maq => !maquinasEnUso.has(maq.id));

  // Reiniciar estado al abrir/cerrar
  useEffect(() => {
    if (open) {
      setLugar("");
      setHectareas("");
      setPrecioHectarea("");
      setEmpleadosIds([]);
      setMaquinasIds([]);
      setSearchEmpleados("");
      setSearchMaquinas("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMut.mutateAsync({
        lugar,
        hectareas,
        precio_hectarea: precioHectarea,
        empleados_asignados: empleadosIds,
        maquinas_asignadas: maquinasIds,
        estado: "activo"
      });
      toast.success("Proyecto creado con éxito");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Error al crear el proyecto");
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo Proyecto</DialogTitle>
          <DialogDescription>
            Crea un nuevo proyecto, ingresa las hectáreas a trabajar y asigna los recursos necesarios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-2">
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
                placeholder="Ej. 1500"
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
                placeholder="Ej. 25000"
                required
              />
            </div>
            
            <div className="sm:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-500 font-medium">Ganancia Estimada:</span>
              <span className="text-lg font-bold text-green-600">
                ${gananciaEstimada.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label>Empleados Asignados</Label>
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
                  {empleados?.filter(emp => `${emp.nombre} ${emp.apellido}`.toLowerCase().includes(searchEmpleados.toLowerCase())).map(emp => {
                    const proyectosActuales = empleadoProyectos.get(emp.id) || [];
                    return (
                      <div key={emp.id} className="flex items-start space-x-2 py-0.5">
                        <Checkbox 
                          id={`emp-${emp.id}`} 
                          checked={empleadosIds.includes(emp.id)}
                          onCheckedChange={() => toggleEmpleado(emp.id)}
                          className="mt-0.5"
                        />
                        <label htmlFor={`emp-${emp.id}`} className="text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                          <span>{emp.nombre} {emp.apellido}</span>
                          {proyectosActuales.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                              {proyectosActuales.map((lugar, i) => (
                                <span key={i} className="inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                  En: {lugar.length > 22 ? lugar.slice(0, 22) + "…" : lugar}
                                </span>
                              ))}
                            </span>
                          )}
                        </label>
                      </div>
                    );
                  })}
                  {(!empleados || empleados.filter(emp => `${emp.nombre} ${emp.apellido}`.toLowerCase().includes(searchEmpleados.toLowerCase())).length === 0) && (
                    <p className="text-sm text-muted-foreground">No hay empleados encontrados.</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <Label>Maquinaria Asignada</Label>
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
                              id={`maq-${maq.id}`} 
                              checked={maquinasIds.includes(maq.id)}
                              onCheckedChange={() => toggleMaquina(maq.id)}
                            />
                            <HoverCard openDelay={200}>
                              <HoverCardTrigger asChild>
                                <label 
                                  htmlFor={`maq-${maq.id}`} 
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
                              id={`maq-${maq.id}`} 
                              checked={maquinasIds.includes(maq.id)}
                              onCheckedChange={() => toggleMaquina(maq.id)}
                            />
                            <HoverCard openDelay={200}>
                              <HoverCardTrigger asChild>
                                <label 
                                  htmlFor={`maq-${maq.id}`} 
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

          <DialogFooter className="mt-6 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMut.isPending} className="bg-primary hover:bg-primary/90 text-white">
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createMut.isPending ? "Creando..." : "Crear Proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
