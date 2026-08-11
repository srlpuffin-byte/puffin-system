import React, { useState } from "react";
import { useGetJornadas, useDeleteJornada, useGetMe } from "@workspace/api-client-react";
import { TableSkeleton, CardSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Square, MapPin, Pencil, Trash2, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { IniciarJornadaDialog } from "@/components/forms/iniciar-jornada-dialog";
import { FinalizarJornadaDialog } from "@/components/forms/finalizar-jornada-dialog";
import { VerJornadaDialog } from "@/components/forms/ver-jornada-dialog";
import { EditarJornadaDialog } from "@/components/forms/editar-jornada-dialog";
import { CargarJornadaPasadaDialog } from "@/components/forms/cargar-jornada-pasada-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function Jornadas() {
  const queryClient = useQueryClient();
  const { data: jornadas, isLoading } = useGetJornadas();
  const { data: user } = useGetMe();
  const isAdmin = user?.rol?.toLowerCase() !== "empleado";
  const deleteMut = useDeleteJornada();
  const [openIniciar, setOpenIniciar] = useState(false);
  const [openJornadaPasada, setOpenJornadaPasada] = useState(false);
  const [jornadaAFinalizar, setJornadaAFinalizar] = useState<{
    id: number; empleado_nombre?: string; maquina_nombre?: string; horometro_inicio?: number | null;
  } | null>(null);
  const [jornadaAVer, setJornadaAVer] = useState<any | null>(null);
  const [jornadaAEditar, setJornadaAEditar] = useState<any | null>(null);
  const [jornadaAEliminar, setJornadaAEliminar] = useState<any | null>(null);

  const formatHoras = (val: any) => {
    if (val === null || val === undefined) return "-";
    const n = Number(val);
    if (isNaN(n) || n < 0) return "-";
    return `${parseFloat(n.toFixed(2))}h`;
  };

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Operario", key: "empleado_nombre" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Ubicación", key: "ubicacion" },
    { header: "Tipo de Trabajo", key: "tipo_trabajo" },
    { header: "H. Inicio", key: "horometro_inicio" },
    { header: "H. Fin", key: "horometro_fin" },
    { header: "Hs Máquina", key: "horas_trabajadas" },
    { header: "Hs Reloj", key: "horas_reloj" },
    { header: "Estado", key: "estado" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Jornadas Laborales</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {jornadas && (
            <ExportButtons 
              data={jornadas} 
              columns={exportColumns} 
              filename="Reporte_Jornadas" 
              title="Reporte de Jornadas Laborales" 
            />
          )}
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setOpenJornadaPasada(true)}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Cargar jornada anterior
          </Button>
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenIniciar(true)}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Iniciar Jornada
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
                    <TableHead>Operario</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Reloj</TableHead>
                    <TableHead>Hs Máq.</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones / Tarea</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableSkeleton cols={8} rows={5} />
                  ) : jornadas?.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay jornadas registradas.</TableCell></TableRow>
                  ) : (
                    jornadas?.map((jor: any) => (
                      <TableRow key={jor.id} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setJornadaAVer(jor)}>
                        <TableCell className="font-medium">
                          {jor.fecha ? format(new Date(jor.fecha), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>{jor.empleado_nombre}</TableCell>
                        <TableCell>{jor.maquina_nombre}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span>{jor.hora_inicio || "-"} a {jor.hora_fin || "-"}</span>
                            {jor.horas_reloj != null && <span className="text-xs text-muted-foreground">{formatHoras(jor.horas_reloj)} reloj</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {jor.horas_trabajadas != null ? <span className="font-semibold text-blue-700">{jor.horas_trabajadas} h</span> : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={jor.estado === "en_curso" ? "outline" : "secondary"}
                                 className={jor.estado === "en_curso" ? "text-blue-600 border-blue-600" : ""}>
                            {jor.estado.toUpperCase().replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            {(jor.ubicacion || jor.tipo_trabajo) && (
                              <div className="flex items-center text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md max-w-[180px] text-right justify-end border border-muted">
                                <MapPin className="w-3 h-3 mr-1 inline-block opacity-70" />
                                <span className="truncate">
                                  {jor.ubicacion || "-"} {jor.ubicacion && jor.tipo_trabajo ? "•" : ""} {jor.tipo_trabajo || ""}
                                </span>
                              </div>
                            )}
                            {jor.estado === "en_curso" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJornadaAFinalizar({
                                    id: jor.id,
                                    empleado_nombre: jor.empleado_nombre,
                                    maquina_nombre: jor.maquina_nombre,
                                    horometro_inicio: jor.horometro_inicio,
                                  });
                                }}
                              >
                                <Square className="mr-2 h-4 w-4" />
                                Finalizar
                              </Button>
                            )}
                            {isAdmin && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="Editar jornada"
                                  onClick={(e) => { e.stopPropagation(); setJornadaAEditar(jor); }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Eliminar jornada"
                                  onClick={(e) => { e.stopPropagation(); setJornadaAEliminar(jor); }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
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
                <CardSkeleton rows={4} />
              ) : jornadas?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay jornadas registradas.</div>
              ) : (
                jornadas?.map((jor: any) => (
                  <div key={jor.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setJornadaAVer(jor)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base text-primary leading-tight">{jor.empleado_nombre}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">{jor.fecha ? format(new Date(jor.fecha), "dd/MM/yyyy") : "-"}</span>
                      </div>
                      <Badge variant={jor.estado === "en_curso" ? "outline" : "secondary"} className={jor.estado === "en_curso" ? "text-blue-600 border-blue-600" : ""}>
                        {jor.estado.toUpperCase().replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="font-medium">{jor.maquina_nombre}</span>
                      </div>
                      {(jor.ubicacion || jor.tipo_trabajo) && (
                        <div className="flex items-start gap-1 mt-1 text-xs text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{jor.ubicacion || "-"} {jor.ubicacion && jor.tipo_trabajo ? "•" : ""} {jor.tipo_trabajo || ""}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-sm bg-slate-50 p-2 rounded border mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold">Inicio</span>
                        <span className="font-medium">{jor.hora_inicio || "-"}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold">Fin</span>
                        <span className="font-medium">{jor.hora_fin || "-"}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold" title="Horas Reloj (Empleado)">Hs Reloj</span>
                        <span className="font-bold text-slate-700">{formatHoras(jor.horas_reloj)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase text-blue-700 font-semibold" title="Horas Máquina (Horómetro)">Hs Máq</span>
                        <span className="font-bold text-blue-700">{formatHoras(jor.horas_trabajadas)}</span>
                      </div>
                    </div>

                    {jor.estado === "en_curso" && (
                      <div className="mt-2 pt-2 border-t">
                        <Button
                          variant="destructive"
                          className="w-full h-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setJornadaAFinalizar({
                              id: jor.id,
                              empleado_nombre: jor.empleado_nombre,
                              maquina_nombre: jor.maquina_nombre,
                              horometro_inicio: jor.horometro_inicio,
                            });
                          }}
                        >
                          <Square className="mr-2 h-4 w-4" /> Finalizar Jornada
                        </Button>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="mt-2 pt-2 border-t flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => { e.stopPropagation(); setJornadaAEditar(jor); }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                          onClick={(e) => { e.stopPropagation(); setJornadaAEliminar(jor); }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
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

      <IniciarJornadaDialog open={openIniciar} onOpenChange={setOpenIniciar} />

      <CargarJornadaPasadaDialog open={openJornadaPasada} onOpenChange={setOpenJornadaPasada} />

      {jornadaAFinalizar && (
        <FinalizarJornadaDialog
          open={!!jornadaAFinalizar}
          onOpenChange={(o) => { if (!o) setJornadaAFinalizar(null); }}
          jornadaId={jornadaAFinalizar.id}
          empleadoNombre={jornadaAFinalizar.empleado_nombre}
          maquinaNombre={jornadaAFinalizar.maquina_nombre}
          horometroInicio={jornadaAFinalizar.horometro_inicio}
        />
      )}

      <VerJornadaDialog 
        open={!!jornadaAVer} 
        onOpenChange={(o) => { if (!o) setJornadaAVer(null); }} 
        jornada={jornadaAVer} 
      />

      <EditarJornadaDialog
        open={!!jornadaAEditar}
        onOpenChange={(o) => { if (!o) setJornadaAEditar(null); }}
        jornada={jornadaAEditar}
      />

      {/* Diálogo de confirmación de eliminación */}
      {jornadaAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-white/10 shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">Eliminar Jornada</h3>
            <p className="text-white/70 text-sm mb-6">
              ¿Estás seguro que querés eliminar la jornada de <strong>{jornadaAEliminar.empleado_nombre}</strong> del {jornadaAEliminar.fecha ? format(new Date(jornadaAEliminar.fecha), "dd/MM/yyyy") : "-"}? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={() => setJornadaAEliminar(null)}
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMut.isPending}
                onClick={() => {
                  deleteMut.mutate(
                    { id: jornadaAEliminar.id },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ["jornadas"] });
                        toast.success("Jornada eliminada");
                        setJornadaAEliminar(null);
                      },
                      onError: (err: any) => {
                        toast.error(err?.response?.data?.error || "Error al eliminar jornada");
                      },
                    }
                  );
                }}
              >
                {deleteMut.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
