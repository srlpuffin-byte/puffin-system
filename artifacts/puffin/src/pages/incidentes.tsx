import React, { useState } from "react";
import { useGetIncidentes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Registro de Incidentes</h1>
        <Button className="bg-destructive hover:bg-destructive/90" onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Reportar Incidente
        </Button>
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
