import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetJornadas, useGetMantenimientos } from "@workspace/api-client-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquina: any;
}

export function HistorialMaquinaDialog({ open, onOpenChange, maquina }: Props) {
  const [tab, setTab] = useState("jornadas");
  const { data: jornadas, isLoading: loadingJornadas } = useGetJornadas(
    { maquina_id: maquina?.id }, 
    { query: { enabled: !!maquina && open } }
  );
  
  const { data: mantenimientos, isLoading: loadingMantenimientos } = useGetMantenimientos(
    { maquina_id: maquina?.id },
    { query: { enabled: !!maquina && open } }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Historial de {maquina?.nombre}</DialogTitle>
          <DialogDescription>
            Mostrando el historial completo de jornadas, mantenimientos y eventos de la máquina.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 mt-4">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none pb-0 h-auto bg-transparent mb-4">
              <TabsTrigger value="jornadas" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 pb-2">
                Jornadas
              </TabsTrigger>
              <TabsTrigger value="mantenimientos" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 pb-2">
                Mantenimientos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="jornadas" className="space-y-4">
              {loadingJornadas ? (
                <p className="text-center text-muted-foreground py-8">Cargando jornadas...</p>
              ) : jornadas?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay jornadas registradas para esta máquina.</p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Fecha</th>
                        <th className="p-3 font-medium">Operario</th>
                        <th className="p-3 font-medium">Obra / Trabajo</th>
                        <th className="p-3 font-medium text-right">Horas</th>
                        <th className="p-3 font-medium text-right">Km.</th>
                        <th className="p-3 font-medium text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {jornadas?.map((j) => (
                        <tr key={j.id} className="hover:bg-muted/50">
                          <td className="p-3">{format(new Date(j.fecha), 'dd/MM/yyyy', { locale: es })}</td>
                          <td className="p-3">{j.empleado_nombre}</td>
                          <td className="p-3">
                            <div className="font-medium">{j.nombre_obra || "-"}</div>
                            <div className="text-xs text-muted-foreground">{j.descripcion_trabajo || "-"}</div>
                          </td>
                          <td className="p-3 text-right">{j.horas_trabajadas?.toFixed(1) || "-"} h</td>
                          <td className="p-3 text-right">
                            {j.km_inicio && j.km_fin ? (j.km_fin - j.km_inicio).toFixed(1) + " km" : "-"}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              j.estado === "finalizada" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {j.estado === 'finalizada' ? 'Finalizada' : 'En Curso'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="mantenimientos" className="space-y-4">
              {loadingMantenimientos ? (
                <p className="text-center text-muted-foreground py-8">Cargando mantenimientos...</p>
              ) : mantenimientos?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay mantenimientos registrados.</p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Fecha Programada</th>
                        <th className="p-3 font-medium">Tipo</th>
                        <th className="p-3 font-medium">Descripción</th>
                        <th className="p-3 font-medium">Proveedor</th>
                        <th className="p-3 font-medium text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {mantenimientos?.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/50">
                          <td className="p-3">{format(new Date(m.fecha_programada), 'dd/MM/yyyy', { locale: es })}</td>
                          <td className="p-3 capitalize">{m.tipo}</td>
                          <td className="p-3">{m.descripcion}</td>
                          <td className="p-3">{m.proveedor || "-"}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              m.estado === "realizado" ? "bg-green-100 text-green-800" : m.estado === "cancelado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {m.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
