import React, { useState } from "react";
import { useGetIncidentes, getGetIncidentesQueryKey, useGetMe } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, CheckCircle2, Eye, ImageOff } from "lucide-react";
import { format } from "date-fns";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const TIPO_LABELS: Record<string, string> = {
  rotura: "Rotura",
  golpe: "Golpe / Colisión",
  accidente: "Accidente personal",
  falla: "Falla operativa",
  problema_mecanico: "Problema mecánico",
  otro: "Otro",
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle para el administrador
// ─────────────────────────────────────────────────────────────────────────────
interface Incidente {
  id: number;
  tipo?: string | null;
  descripcion?: string | null;
  fecha?: string | null;
  estado?: string | null;
  maquina_nombre?: string | null;
  empleado_nombre?: string | null;
}

function IncidenteDetalleDialog({ incidente, open, onOpenChange }: {
  incidente: Incidente | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: fotos, isLoading: loadingFotos } = useQuery({
    queryKey: ["fotografias", "incidente", incidente?.id],
    queryFn: () =>
      apiFetch<{ id: number; url: string; descripcion?: string | null }[]>(
        `/fotografias?entidad_tipo=incidente&entidad_id=${incidente!.id}`
      ),
    enabled: open && !!incidente?.id,
  });

  if (!incidente) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <span className="text-xl">⚠️</span>
            {TIPO_LABELS[incidente.tipo || ""] || incidente.tipo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Info principal */}
          <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 border rounded-lg p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Fecha</span>
              <span className="font-medium">
                {incidente.fecha ? format(new Date(incidente.fecha), "dd/MM/yyyy HH:mm") : "-"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Estado</span>
              <Badge
                variant={incidente.estado === "resuelto" ? "default" : "destructive"}
                className={incidente.estado === "resuelto" ? "bg-green-600 w-fit" : "w-fit"}
              >
                {incidente.estado?.toUpperCase()}
              </Badge>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Máquina</span>
              <span className="font-medium">{incidente.maquina_nombre || "—"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Operario</span>
              <span className="font-medium">{incidente.empleado_nombre || "—"}</span>
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Descripción</p>
            <p className="text-sm text-slate-800 leading-relaxed bg-white border rounded-lg p-3">
              {incidente.descripcion || "Sin descripción."}
            </p>
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">
              Fotografías del incidente
            </p>
            {loadingFotos ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Cargando fotos...</div>
            ) : fotos && fotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {fotos.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="relative rounded-lg overflow-hidden border aspect-video bg-muted hover:opacity-90 transition-opacity">
                      <img
                        src={f.url}
                        alt={f.descripcion || "Foto incidente"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {f.descripcion && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{f.descripcion}</p>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground border rounded-lg bg-slate-50">
                <ImageOff className="h-8 w-8 opacity-30" />
                <p className="text-xs">No se adjuntaron fotos a este incidente.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export function Incidentes() {
  const { data: incidentes, isLoading } = useGetIncidentes();
  const [openDialog, setOpenDialog] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [selectedIncidente, setSelectedIncidente] = useState<Incidente | null>(null);
  const [editingIncidente, setEditingIncidente] = useState<Incidente | null>(null);
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";
  const queryClient = useQueryClient();

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este incidente de forma permanente?")) return;
    try {
      await apiFetch(`/incidentes/${id}`, { method: "DELETE" });
      toast.success("Incidente eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: getGetIncidentesQueryKey() });
    } catch (err: any) {
      toast.error("Error al eliminar el incidente");
    }
  };

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
                      <TableRow key={inc.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedIncidente(inc as Incidente)}>
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
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedIncidente(inc as Incidente)} className="cursor-pointer">
                                  <Eye className="mr-2 h-4 w-4" /> Ver detalle
                                </DropdownMenuItem>
                                {!isEmpleado && (
                                  <>
                                    <DropdownMenuItem onClick={() => setEditingIncidente(inc as Incidente)} className="cursor-pointer">
                                      <Pencil className="mr-2 h-4 w-4" /> Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(inc.id)} className="cursor-pointer text-red-600 focus:text-red-600">
                                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
                  <div
                    key={inc.id}
                    className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedIncidente(inc as Incidente)}
                  >
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
                      <p className="text-slate-800 line-clamp-2">{inc.descripcion}</p>
                    </div>

                    <div className="mt-1 pt-2 border-t flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-600 h-8 px-2"
                        onClick={(e) => { e.stopPropagation(); setSelectedIncidente(inc as Incidente); }}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Ver detalle
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        {!isEmpleado && inc.estado !== "resuelto" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleResolver(inc.id); }}
                            disabled={resolvingId === inc.id}
                            className="text-green-700 border-green-200 hover:bg-green-50 h-8 px-2"
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Resolver
                          </Button>
                        )}
                        {!isEmpleado && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingIncidente(inc as Incidente); }} className="cursor-pointer">
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(inc.id); }} className="cursor-pointer text-red-600 focus:text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportarIncidenteDialog open={openDialog} onOpenChange={setOpenDialog} />
      {editingIncidente && (
        <ReportarIncidenteDialog 
          open={!!editingIncidente} 
          onOpenChange={(v) => { if (!v) setEditingIncidente(null); }} 
          editData={editingIncidente} 
        />
      )}

      <IncidenteDetalleDialog
        incidente={selectedIncidente}
        open={!!selectedIncidente}
        onOpenChange={(v) => { if (!v) setSelectedIncidente(null); }}
      />
    </div>
  );
}
