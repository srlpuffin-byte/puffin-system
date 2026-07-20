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

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden divide-y">
              {isLoading ? (
                <div className="text-center py-8">Cargando registros...</div>
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
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <RegistrarCargaDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
