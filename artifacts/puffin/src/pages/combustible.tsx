import React, { useState } from "react";
import { useGetCombustible } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { RegistrarCargaDialog } from "@/components/forms/registrar-carga-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";

export function Combustible() {
  const { data: registros, isLoading } = useGetCombustible();
  const [openDialog, setOpenDialog] = useState(false);

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Operario", key: "empleado_nombre" },
    { header: "Litros", key: "litros" },
    { header: "Precio/L", key: "precio", formatter: (v: number) => v ? `$${Number(v).toLocaleString()}` : "-" },
    { header: "Importe", key: "importe", formatter: (v: number) => v ? `$${Number(v).toLocaleString()}` : "-" },
    { header: "Estación", key: "estacion" },
    { header: "Km", key: "kilometraje" }
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
          <div className="rounded-md border overflow-x-auto">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando registros...</TableCell></TableRow>
                ) : registros?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay cargas registradas.</TableCell></TableRow>
                ) : (
                  registros?.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">
                        {reg.fecha ? format(new Date(reg.fecha), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell>{reg.maquina_nombre}</TableCell>
                      <TableCell>{reg.empleado_nombre}</TableCell>
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RegistrarCargaDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
