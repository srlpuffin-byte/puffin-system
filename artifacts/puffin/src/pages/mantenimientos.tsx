import React, { useState } from "react";
import { useGetMantenimientos, useUpdateMantenimientoEstado, getGetMantenimientosQueryKey, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { format } from "date-fns";
import { RegistrarMantenimientoDialog } from "@/components/forms/registrar-mantenimiento-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";

export function Mantenimientos() {
  const queryClient = useQueryClient();
  const { data: mantenimientos, isLoading } = useGetMantenimientos();
  const updateEstadoMut = useUpdateMantenimientoEstado();
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";
  const [openDialog, setOpenDialog] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const handleEstadoChange = (id: number, nuevoEstado: string) => {
    toast.loading("Actualizando estado...", { id: `update-${id}` });
    updateEstadoMut.mutate(
      { id, data: { estado: nuevoEstado as any } },
      {
        onSuccess: () => {
          toast.success("Estado actualizado", { id: `update-${id}` });
          queryClient.invalidateQueries({ queryKey: getGetMantenimientosQueryKey() });
        },
        onError: () => {
          toast.error("Error al actualizar", { id: `update-${id}` });
        }
      }
    );
  };

  const handleEdit = (mant: any) => {
    setEditData(mant);
    setOpenDialog(true);
  };

  const handleNew = () => {
    setEditData(null);
    setOpenDialog(true);
  };

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v + 'T12:00:00'), "dd/MM/yyyy") : "-" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Tipo", key: "tipo", formatter: (v: string) => v?.charAt(0).toUpperCase() + v?.slice(1) },
    { header: "Descripción", key: "descripcion" },
    { header: "Horómetro", key: "horas" },
    { header: "Próximo Service", key: "proximo_service", formatter: (v: string) => v ? format(new Date(v + 'T12:00:00'), "dd/MM/yyyy") : "-" },
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
          <Button className="bg-primary flex-1 sm:flex-none" onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Mantenimiento
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Horómetro/Odómetro</TableHead>
                    <TableHead>Próximo Service</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando mantenimientos...</TableCell></TableRow>
                  ) : mantenimientos?.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay mantenimientos registrados.</TableCell></TableRow>
                  ) : (
                    mantenimientos?.map((mant) => (
                      <TableRow key={mant.id}>
                        <TableCell className="font-medium">
                          {mant.fecha ? format(new Date(mant.fecha + 'T12:00:00'), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>{mant.maquina_nombre}</TableCell>
                        <TableCell className="capitalize">{mant.tipo}</TableCell>
                        <TableCell className="max-w-xs truncate" title={mant.descripcion || ""}>{mant.descripcion || "-"}</TableCell>
                        <TableCell>{mant.horas ? `${mant.horas}` : "-"}</TableCell>
                        <TableCell>
                          {mant.proximo_service ? format(new Date(mant.proximo_service + 'T12:00:00'), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mant.estado}
                            onValueChange={(v) => handleEstadoChange(mant.id, v)}
                            disabled={updateEstadoMut.isPending || isEmpleado}
                          >
                            <SelectTrigger className={`w-[130px] h-8 text-xs font-semibold ${mant.estado === "realizado" ? "border-green-500 text-green-700 bg-green-50" : mant.estado === "cancelado" ? "border-red-500 text-red-700 bg-red-50" : ""}`}>
                              <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendiente">Pendiente</SelectItem>
                              <SelectItem value="realizado">Realizado</SelectItem>
                              <SelectItem value="cancelado">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {!isEmpleado && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(mant)}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
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
                <div className="text-center py-8">Cargando mantenimientos...</div>
              ) : mantenimientos?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay mantenimientos registrados.</div>
              ) : (
                mantenimientos?.map((mant) => (
                  <div key={mant.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base text-primary">{mant.maquina_nombre}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {mant.fecha ? format(new Date(mant.fecha + 'T12:00:00'), "dd/MM/yyyy") : "-"} • <span className="capitalize">{mant.tipo}</span>
                        </span>
                      </div>
                      <Select
                        value={mant.estado}
                        onValueChange={(v) => handleEstadoChange(mant.id, v)}
                        disabled={updateEstadoMut.isPending || isEmpleado}
                      >
                        <SelectTrigger className={`w-[110px] h-7 text-[10px] font-semibold ${mant.estado === "realizado" ? "border-green-500 text-green-700 bg-green-50" : mant.estado === "cancelado" ? "border-red-500 text-red-700 bg-red-50" : ""}`}>
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendiente">Pendiente</SelectItem>
                          <SelectItem value="realizado">Realizado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-sm bg-slate-50 p-2 rounded border mt-1">
                      <p className="line-clamp-2 text-slate-700">{mant.descripcion || "Sin descripción"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Uso Registrado</span>
                        <span className="font-medium">{mant.horas ? `${mant.horas}` : "-"}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Próximo Service</span>
                        <span className="font-medium">{mant.proximo_service ? format(new Date(mant.proximo_service + 'T12:00:00'), "dd/MM/yyyy") : "-"}</span>
                      </div>
                    </div>

                    {!isEmpleado && (
                      <div className="flex justify-end border-t pt-2 mt-1">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(mant)} className="h-8">
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
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

      <RegistrarMantenimientoDialog 
        open={openDialog} 
        onOpenChange={(val) => {
          setOpenDialog(val);
          if (!val) setEditData(null);
        }} 
        editData={editData}
      />
    </div>
  );
}
