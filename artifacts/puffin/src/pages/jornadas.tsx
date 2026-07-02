import React, { useState } from "react";
import { useGetJornadas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Square } from "lucide-react";
import { format } from "date-fns";
import { IniciarJornadaDialog } from "@/components/forms/iniciar-jornada-dialog";
import { FinalizarJornadaDialog } from "@/components/forms/finalizar-jornada-dialog";

export function Jornadas() {
  const { data: jornadas, isLoading } = useGetJornadas();
  const [openIniciar, setOpenIniciar] = useState(false);
  const [jornadaAFinalizar, setJornadaAFinalizar] = useState<{
    id: number; empleado_nombre?: string; maquina_nombre?: string; horometro_inicio?: number | null;
  } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Jornadas Laborales</h1>
        <Button className="bg-primary" onClick={() => setOpenIniciar(true)}>
          <PlayCircle className="mr-2 h-4 w-4" />
          Iniciar Jornada
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="rounded-md border">
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
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando jornadas...</TableCell></TableRow>
                ) : jornadas?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay jornadas registradas.</TableCell></TableRow>
                ) : (
                  jornadas?.map((jor) => (
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
