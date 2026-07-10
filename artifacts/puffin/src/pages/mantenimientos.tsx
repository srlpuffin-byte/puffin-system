import React, { useState } from "react";
import { useGetMantenimientos, useUpdateMantenimientoEstado, getGetMantenimientosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { RegistrarMantenimientoDialog } from "@/components/forms/registrar-mantenimiento-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";

export function Mantenimientos() {
  const queryClient = useQueryClient();
  const { data: mantenimientos, isLoading } = useGetMantenimientos();
  const updateEstadoMut = useUpdateMantenimientoEstado();
  const [openDialog, setOpenDialog] = useState(false);

  const handleEstadoChange = (id: number, nuevoEstado: string) => {
    toast.loading("Actualizando estado...", { id: \`update-\${id}\` });
    updateEstadoMut.mutate(
      { id, data: { estado: nuevoEstado } },
      {
        onSuccess: () => {
          toast.success("Estado actualizado", { id: \`update-\${id}\` });
          queryClient.invalidateQueries({ queryKey: getGetMantenimientosQueryKey() });
        },
        onError: () => {
          toast.error("Error al actualizar", { id: \`update-\${id}\` });
        }
      }
    );
  };

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Tipo", key: "tipo", formatter: (v: string) => v?.charAt(0).toUpperCase() + v?.slice(1) },
    { header: "Descripción", key: "descripcion" },
    { header: "Horómetro", key: "horas" },
    { header: "Próximo Service", key: "proximo_service", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Estado", key: "estado", formatter: (v: string) => v?.toUpperCase() }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Mantenimientos</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {mantenimientos && (
            <ExportButtons 
              data={mantenimientos} 
              columns={exportColumns} 
              filename="Reporte_Mantenimientos" 
              title="Reporte de Mantenimientos" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Mantenimiento
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
                  <TableHead>Máquina</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Horómetro</TableHead>
                  <TableHead>Próximo Service</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando mantenimientos...</TableCell></TableRow>
                ) : mantenimientos?.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay mantenimientos registrados.</TableCell></TableRow>
                ) : (
                  mantenimientos?.map((mant) => (
                    <TableRow key={mant.id}>
                      <TableCell className="font-medium">
                        {mant.fecha ? format(new Date(mant.fecha), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell>{mant.maquina_nombre}</TableCell>
                      <TableCell className="capitalize">{mant.tipo}</TableCell>
                      <TableCell className="max-w-xs truncate" title={mant.descripcion || ""}>{mant.descripcion || "-"}</TableCell>
                      <TableCell>{mant.horas ? `${mant.horas} h` : "-"}</TableCell>
                      <TableCell>
                        {mant.proximo_service ? format(new Date(mant.proximo_service), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mant.estado}
                          onValueChange={(v) => handleEstadoChange(mant.id, v)}
                          disabled={updateEstadoMut.isPending}
                        >
                          <SelectTrigger className={\`w-[130px] h-8 text-xs font-semibold \${mant.estado === "realizado" ? "border-green-500 text-green-700 bg-green-50" : mant.estado === "cancelado" ? "border-red-500 text-red-700 bg-red-50" : ""}\`}>
                            <SelectValue placeholder="Estado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="realizado">Realizado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RegistrarMantenimientoDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
