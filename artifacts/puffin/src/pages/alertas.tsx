import React, { useState } from "react";
import { useGetAlertas, useUpdateAlerta } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAlertasQueryKey } from "@workspace/api-client-react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { CrearAlertaDialog } from "@/components/forms/crear-alerta-dialog";

export function Alertas() {
  const { data: alertas, isLoading } = useGetAlertas({ estado: 'activa' });
  const updateMut = useUpdateAlerta();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);

  const handleResolver = (id: number) => {
    updateMut.mutate(
      { id, data: { estado: 'resuelta' } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAlertasQueryKey({ estado: 'activa' }) });
        }
      }
    );
  };

  const exportColumns = [
    { header: "Prioridad", key: "prioridad", formatter: (v: string) => v?.toUpperCase() },
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy HH:mm") : "-" },
    { header: "Tipo", key: "tipo", formatter: (v: string) => v?.charAt(0).toUpperCase() + v?.slice(1) },
    { header: "Entidad", key: "entidad_nombre" },
    { header: "Descripción", key: "descripcion" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Centro de Alertas</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {alertas && (
            <ExportButtons 
              data={alertas} 
              columns={exportColumns} 
              filename="Reporte_Alertas" 
              title="Reporte de Alertas" 
            />
          )}
          <Button onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Alerta
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
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">Cargando alertas...</TableCell>
                    </TableRow>
                  ) : alertas?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                          <span>No hay alertas activas en este momento.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    alertas?.map((alerta) => (
                      <TableRow key={alerta.id}>
                        <TableCell>
                          <Badge className={
                            alerta.prioridad === 'roja' ? 'bg-[#DC2626] hover:bg-[#DC2626]/90' :
                            alerta.prioridad === 'amarilla' ? 'bg-[#D97706] hover:bg-[#D97706]/90' :
                            'bg-[#2563EB] hover:bg-[#2563EB]/90'
                          }>
                            {alerta.prioridad.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {alerta.fecha ? format(new Date(alerta.fecha), "dd/MM/yyyy HH:mm") : "-"}
                        </TableCell>
                        <TableCell className="capitalize">{alerta.tipo}</TableCell>
                        <TableCell>{alerta.entidad_nombre || "-"}</TableCell>
                        <TableCell>{alerta.descripcion}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleResolver(alerta.id)}
                            disabled={updateMut.isPending}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                            Resolver
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
                <div className="text-center py-8">Cargando alertas...</div>
              ) : alertas?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <span>No hay alertas activas.</span>
                  </div>
                </div>
              ) : (
                alertas?.map((alerta) => (
                  <div key={alerta.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base text-primary leading-tight capitalize">{alerta.tipo}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">{alerta.fecha ? format(new Date(alerta.fecha), "dd/MM/yyyy HH:mm") : "-"}</span>
                      </div>
                      <Badge className={
                        alerta.prioridad === 'roja' ? 'bg-[#DC2626]' :
                        alerta.prioridad === 'amarilla' ? 'bg-[#D97706]' :
                        'bg-[#2563EB]'
                      }>
                        {alerta.prioridad.toUpperCase()}
                      </Badge>
                    </div>

                    {alerta.entidad_nombre && (
                      <div className="flex items-center gap-1 text-sm font-medium text-slate-700 bg-slate-50 p-2 rounded border">
                        <span className="text-xs text-muted-foreground">Entidad:</span> {alerta.entidad_nombre}
                      </div>
                    )}

                    <div className="text-sm">
                      <p className="text-slate-800">{alerta.descripcion}</p>
                    </div>

                    <div className="mt-2 pt-2 border-t flex justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleResolver(alerta.id)}
                        disabled={updateMut.isPending}
                        className="text-green-700 border-green-200 hover:bg-green-50 h-8"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Resolver
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <CrearAlertaDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
