import React, { useState } from "react";
import { useGetCombustible, RegistroCombustible, useDeleteCombustible, getGetCombustibleQueryKey } from "@workspace/api-client-react";
import { TableSkeleton, CardSkeleton } from "@/components/ui/table-skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { RegistrarCargaDialog } from "@/components/forms/registrar-carga-dialog";
import { EditarCargaDialog } from "@/components/forms/editar-carga-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { toast } from "sonner";
import { Users, Tractor, Briefcase } from "lucide-react";

export function Combustible() {
  const queryClient = useQueryClient();
  const { data: registros, isLoading } = useGetCombustible();
  const { data: proyectos } = useGetProyectos();
  const [openDialog, setOpenDialog] = useState(false);
  const [cargaParaEditar, setCargaParaEditar] = useState<RegistroCombustible | null>(null);
  const deleteMut = useDeleteCombustible();

  const [openFotoDialog, setOpenFotoDialog] = useState(false);
  const [fotoUrlToView, setFotoUrlToView] = useState<string | null>(null);

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      deleteMut.mutate({ id }, {
        onSuccess: () => {
          toast.success("Registro eliminado correctamente");
          queryClient.invalidateQueries({ queryKey: getGetCombustibleQueryKey() });
        },
        onError: () => toast.error("Error al eliminar el registro")
      });
    }
  };

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Operario", key: "empleado_nombre" },
    { header: "Litros", key: "litros" },
    { header: "Precio/L", key: "precio", formatter: (v: number) => v ? `$${Number(v).toLocaleString()}` : "-" },
    { header: "Importe", key: "importe", formatter: (v: number) => v ? `$${Number(v).toLocaleString()}` : "-" },
    { header: "Estación", key: "estacion" },
    { header: "Km", key: "kilometraje" },
    { header: "Comprobante", key: "foto_url" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Control de Combustible</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {registros && (
            <ExportButtons 
              data={registros} 
              columns={exportColumns} 
              filename="Reporte_Combustible" 
              title="Reporte de Cargas de Combustible" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Carga
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="rounded-md border overflow-hidden">
            {/* Vista Desktop (Tabla) */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Operario</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Precio/L</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Estación</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-center">Comprobante</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableSkeleton cols={9} rows={5} />
                  ) : registros?.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No hay cargas registradas.</TableCell></TableRow>
                  ) : (
                    registros?.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell className="font-medium">
                          {reg.fecha ? format(new Date(reg.fecha), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const asig = proyectos?.find(p => p.maquinas_asignadas?.includes(reg.maquina_id));
                            return (
                              <HoverCard openDelay={100}>
                                <HoverCardTrigger asChild>
                                  <span className="cursor-help font-medium border-b border-dashed border-slate-300 hover:text-primary transition-colors pb-0.5">
                                    {reg.maquina_nombre}
                                  </span>
                                </HoverCardTrigger>
                                <HoverCardContent side="top" className="w-64 p-3 shadow-xl z-[100] bg-white border-2">
                                  <h4 className="font-bold text-sm border-b pb-2 mb-2 flex items-center gap-1 text-primary"><Tractor className="h-4 w-4"/> {reg.maquina_nombre}</h4>
                                  <div className="text-xs text-slate-600">
                                    <div className="flex items-center gap-1 font-semibold text-slate-500 mb-2"><Briefcase className="h-3 w-3"/> Proyecto asignado:</div>
                                    {asig ? <span className="font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{asig.lugar}</span> : <span className="italic text-slate-400">Sin proyecto asignado</span>}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const asig = proyectos?.find(p => p.empleados_asignados?.includes(reg.empleado_id));
                            return (
                              <HoverCard openDelay={100}>
                                <HoverCardTrigger asChild>
                                  <span className="cursor-help font-medium border-b border-dashed border-slate-300 hover:text-primary transition-colors pb-0.5">
                                    {reg.empleado_nombre}
                                  </span>
                                </HoverCardTrigger>
                                <HoverCardContent side="top" className="w-64 p-3 shadow-xl z-[100] bg-white border-2">
                                  <h4 className="font-bold text-sm border-b pb-2 mb-2 flex items-center gap-1 text-primary"><Users className="h-4 w-4"/> {reg.empleado_nombre}</h4>
                                  <div className="text-xs text-slate-600">
                                    <div className="flex items-center gap-1 font-semibold text-slate-500 mb-2"><Briefcase className="h-3 w-3"/> Proyecto asignado:</div>
                                    {asig ? <span className="font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{asig.lugar}</span> : <span className="italic text-slate-400">Sin proyecto asignado</span>}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-blue-700">{reg.litros} L</TableCell>
                        <TableCell className="text-right">
                          {reg.precio ? `$${Number(reg.precio).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {reg.importe ? `$${Number(reg.importe).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>{reg.estacion || "-"}</TableCell>
                        <TableCell className="text-right">
                          {reg.kilometraje ? `${Number(reg.kilometraje).toLocaleString()} km` : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {reg.foto_url ? (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 cursor-pointer" onClick={() => { setFotoUrlToView(reg.foto_url as string); setOpenFotoDialog(true); }}>Ver Foto</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => setCargaParaEditar(reg)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(reg.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden divide-y">
              {isLoading ? (
                <CardSkeleton rows={4} />
              ) : registros?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay cargas registradas.</div>
              ) : (
                registros?.map((reg) => (
                  <div key={reg.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base text-primary">{reg.maquina_nombre}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">{reg.fecha ? format(new Date(reg.fecha), "dd/MM/yyyy") : "-"}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-blue-700">{reg.litros} L</span>
                        <span className="text-sm font-medium">{reg.importe ? `$${Number(reg.importe).toLocaleString()}` : "-"}</span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mb-1">
                      <Button variant="outline" size="sm" onClick={() => setCargaParaEditar(reg)}>
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(reg.id)} className="text-red-500 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-2 rounded border mt-1">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Operario</span>
                        <span className="font-medium truncate" title={reg.empleado_nombre}>{reg.empleado_nombre}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Estación</span>
                        <span className="font-medium truncate" title={reg.estacion || "-"}>{reg.estacion || "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span>Precio unitario: <span className="font-medium text-slate-700">{reg.precio ? `$${Number(reg.precio).toLocaleString()}` : "-"}</span></span>
                      <span>Uso: <span className="font-medium text-slate-700">{reg.kilometraje ? `${Number(reg.kilometraje).toLocaleString()} km/h` : "-"}</span></span>
                    </div>

                    <div className="flex justify-between items-center text-xs mt-1 border-t pt-2">
                      <span className="text-muted-foreground">Comprobante:</span>
                      {reg.foto_url ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 cursor-pointer text-[10px] px-1 py-0" onClick={() => { setFotoUrlToView(reg.foto_url as string); setOpenFotoDialog(true); }}>Ver Foto</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">NO</Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <RegistrarCargaDialog open={openDialog} onOpenChange={setOpenDialog} />
      <EditarCargaDialog open={!!cargaParaEditar} onOpenChange={(open) => !open && setCargaParaEditar(null)} carga={cargaParaEditar} />
      
      {/* Dialog para Ver Foto */}
      <Dialog open={openFotoDialog} onOpenChange={setOpenFotoDialog}>
        <DialogContent className="sm:max-w-[600px] bg-white p-1">
          <div className="relative bg-slate-950 flex items-center justify-center min-h-[300px] rounded-md overflow-hidden">
            {fotoUrlToView ? (
              <img src={fotoUrlToView} alt="Comprobante" className="max-w-full max-h-[80vh] object-contain" />
            ) : (
              <div className="text-slate-400">Cargando...</div>
            )}
            <Button variant="ghost" className="absolute top-2 right-2 text-white bg-black/50 hover:bg-black/80" onClick={() => setOpenFotoDialog(false)}>
              ✕ Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
