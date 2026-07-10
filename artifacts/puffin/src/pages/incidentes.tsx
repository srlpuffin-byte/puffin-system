import React, { useState } from "react";
import { useGetIncidentes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Operario</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando incidentes...</TableCell></TableRow>
                ) : incidentes?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay incidentes registrados.</TableCell></TableRow>
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
                          className={inc.estado === "resuelto" ? "bg-green-600" : ""}
                        >
                          {inc.estado?.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ReportarIncidenteDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
