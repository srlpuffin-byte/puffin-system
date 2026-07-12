import React, { useState } from "react";
import { useGetJornadas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Square, MapPin } from "lucide-react";
import { format } from "date-fns";
import { IniciarJornadaDialog } from "@/components/forms/iniciar-jornada-dialog";
import { FinalizarJornadaDialog } from "@/components/forms/finalizar-jornada-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";

export function Jornadas() {
  const { data: jornadas, isLoading } = useGetJornadas();
  const [openIniciar, setOpenIniciar] = useState(false);
  const [jornadaAFinalizar, setJornadaAFinalizar] = useState<{
    id: number; empleado_nombre?: string; maquina_nombre?: string; horometro_inicio?: number | null;
  } | null>(null);

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Operario", key: "empleado_nombre" },
    { header: "Máquina", key: "maquina_nombre" },
    { header: "Ubicación", key: "ubicacion" },
    { header: "Tipo de Trabajo", key: "tipo_trabajo" },
    { header: "H. Inicio", key: "horometro_inicio" },
    { header: "H. Fin", key: "horometro_fin" },
    { header: "Horas Trabajadas", key: "horas_trabajadas" },
    { header: "Estado", key: "estado" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Jornadas Laborales</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {jornadas && (
            <ExportButtons 
              data={jornadas} 
              columns={exportColumns} 
              filename="Reporte_Jornadas" 
              title="Reporte de Jornadas Laborales" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenIniciar(true)}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Iniciar Jornada
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
                  <TableHead>Operario</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones / Tarea</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando jornadas...</TableCell></TableRow>
                ) : jornadas?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay jornadas registradas.</TableCell></TableRow>
                ) : (
                  jornadas?.map((jor: any) => (
                    <TableRow key={jor.id}>
                      <TableCell className="font-medium">
                        {jor.fecha ? format(new Date(jor.fecha), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell>{jor.empleado_nombre}</TableCell>
                      <TableCell>{jor.maquina_nombre}</TableCell>
                      <TableCell>{jor.hora_inicio || "-"}</TableCell>
                      <TableCell>{jor.hora_fin || "-"}</TableCell>
                      <TableCell>
                        {jor.horas_trabajadas != null ? `${jor.horas_trabajadas} h` : "-"}
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
                              onClick={() => setJornadaAFinalizar({
                                id: jor.id,
                                empleado_nombre: jor.empleado_nombre,
                                maquina_nombre: jor.maquina_nombre,
                                horometro_inicio: jor.horometro_inicio,
                              })}
                            >
                              <Square className="mr-2 h-4 w-4" />
                              Finalizar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <IniciarJornadaDialog open={openIniciar} onOpenChange={setOpenIniciar} />

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
    </div>
  );
}
