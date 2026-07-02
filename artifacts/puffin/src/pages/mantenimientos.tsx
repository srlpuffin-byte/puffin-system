import React, { useState } from "react";
import { useGetMantenimientos } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { RegistrarMantenimientoDialog } from "@/components/forms/registrar-mantenimiento-dialog";

export function Mantenimientos() {
  const { data: mantenimientos, isLoading } = useGetMantenimientos();
  const [openDialog, setOpenDialog] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Mantenimientos</h1>
        <Button className="bg-primary" onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar Mantenimiento
        </Button>
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
                        <Badge
                          variant={mant.estado === "realizado" ? "default" : mant.estado === "cancelado" ? "destructive" : "secondary"}
                          className={mant.estado === "realizado" ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                          {mant.estado?.toUpperCase() || "PENDIENTE"}
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

      <RegistrarMantenimientoDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
