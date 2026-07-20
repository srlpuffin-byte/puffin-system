import React, { useState } from "react";
import { useGetIncidentes, getGetIncidentesQueryKey, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";

const TIPO_LABELS: Record<string, string> = {
  rotura: "Rotura",
  golpe: "Golpe / Colisión",
  accidente: "Accidente personal",
  falla: "Falla operativa",
  problema_mecanico: "Problema mecánico",
  otro: "Otro",
};

export function Incidentes() {
  const { data: incidentes, isLoading } = useGetIncidentes();
  const [openDialog, setOpenDialog] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";
  const queryClient = useQueryClient();

  const handleResolver = async (id: number) => {
    try {
      setResolvingId(id);
      await apiFetch(`/incidentes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ estado: "resuelto" }),
      });
      queryClient.invalidateQueries({ queryKey: getGetIncidentesQueryKey() });
    } catch (err) {
      console.error("Error resolving incident:", err);
    } finally {
      setResolvingId(null);
    }
  };

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy HH:mm") : "-" },
    { header: "Tipo", key: "tipo", formatter: (v: string) => TIPO_LABELS[v] || v },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Operario", key: "empleado_nombre" },
    { header: "Descripción", key: "descripcion" },
    { header: "Estado", key: "estado", formatter: (v: string) => v?.toUpperCase() }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Registro de Incidentes</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {incidentes && (
            <ExportButtons 
              data={incidentes} 
              columns={exportColumns} 
              filename="Reporte_Incidentes" 
              title="Reporte de Incidentes" 
            />
          )}
          <Button className="bg-destructive hover:bg-destructive/90 flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Reportar Incidente
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Operario</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando incidentes...</TableCell></TableRow>
                  ) : incidentes?.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay incidentes registrados.</TableCell></TableRow>
                  ) : (
                    incidentes?.map((inc) => (
                      <TableRow key={inc.id}>
                        <TableCell className="font-medium">
                          {inc.fecha ? format(new Date(inc.fecha), "dd/MM/yyyy HH:mm") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-destructive border-destructive">
                            {TIPO_LABELS[inc.tipo || ""] || inc.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>{inc.maquina_nombre || "-"}</TableCell>
                        <TableCell>{inc.empleado_nombre || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate" title={inc.descripcion}>{inc.descripcion}</TableCell>
                        <TableCell>
                          <Badge
                            variant={inc.estado === "resuelto" ? "default" : "destructive"}
                            className={inc.estado === "resuelto" ? "bg-green-600 hover:bg-green-700" : ""}
                          >
                            {inc.estado?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {!isEmpleado && inc.estado !== "resuelto" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolver(inc.id)}
                              disabled={resolvingId === inc.id}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                              Resolver
                            </Button>
                          )}
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
                <div className="text-center py-8">Cargando incidentes...</div>
              ) : incidentes?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay incidentes registrados.</div>
              ) : (
                incidentes?.map((inc) => (
                  <div key={inc.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base text-destructive leading-tight">{TIPO_LABELS[inc.tipo || ""] || inc.tipo}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">{inc.fecha ? format(new Date(inc.fecha), "dd/MM/yyyy HH:mm") : "-"}</span>
                      </div>
                      <Badge variant={inc.estado === "resuelto" ? "default" : "destructive"} className={inc.estado === "resuelto" ? "bg-green-600" : ""}>
                        {inc.estado?.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-2 rounded border mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold">Máquina</span>
                        <span className="font-medium truncate" title={inc.maquina_nombre || "-"}>{inc.maquina_nombre || "-"}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold">Operario</span>
                        <span className="font-medium truncate" title={inc.empleado_nombre || "-"}>{inc.empleado_nombre || "-"}</span>
                      </div>
                    </div>

                    <div className="text-sm">
                      <p className="text-slate-800 line-clamp-3">{inc.descripcion}</p>
                    </div>

                    {!isEmpleado && inc.estado !== "resuelto" && (
                      <div className="mt-2 pt-2 border-t flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResolver(inc.id)}
                          disabled={resolvingId === inc.id}
                          className="text-green-700 border-green-200 hover:bg-green-50 h-8"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Marcar Resuelto
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportarIncidenteDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
