import React, { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetEmpleado, useGetFotografias } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, User, Phone, FileText, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { IniciarJornadaDialog } from "@/components/forms/iniciar-jornada-dialog";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetJornadas } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditarOperarioDialog } from "@/components/forms/editar-operario-dialog";
import { Edit, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function OperarioFicha() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const operarioId = parseInt(id || "0", 10);
  const { data: operario, isLoading } = useGetEmpleado(operarioId, { query: { enabled: !!operarioId } as any });
  const { data: fotografias } = useGetFotografias({ entidad_tipo: "empleado", entidad_id: operarioId }, { query: { enabled: !!operarioId } as any });
  const [openJornada, setOpenJornada] = useState(false);
  const [openIncidente, setOpenIncidente] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  if (isLoading) return <div className="p-8 text-center">Cargando perfil de operario...</div>;
  if (!operario) return <div className="p-8 text-center text-red-500">Operario no encontrado</div>;

  const missingInfo: string[] = [];
  if (!operario.dni || operario.dni === "COMPLETAR") missingInfo.push("DNI");
  if (!operario.telefono) missingInfo.push("Teléfono personal");
  if (!operario.fecha_ingreso) missingInfo.push("Fecha de ingreso");
  if (!operario.contacto_familiar_nombre) missingInfo.push("Nombre de contacto de emergencia");
  if (!operario.contacto_familiar_telefono) missingInfo.push("Teléfono de contacto de emergencia");
  if (!(operario as any).contacto_familiar_relacion) missingInfo.push("Relación de contacto de emergencia");

  const fotoPerfil = fotografias?.find(f => f.descripcion === "Foto de perfil" || f.descripcion?.toLowerCase().includes("perfil"));
  const fotoCarnet = fotografias?.find(f => f.descripcion === "Carnet de conducir" || f.descripcion?.toLowerCase().includes("carnet"));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/operarios">
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        {fotoPerfil ? (
          <img 
            src={fotoPerfil.url} 
            alt="Perfil" 
            className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 shadow-sm"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            <User className="h-8 w-8 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            {operario.nombre} {operario.apellido}
            <Badge
              variant={operario.estado === "activo" ? "default" : "secondary"}
              className={operario.estado === "activo" ? "bg-green-600" : ""}
            >
              {operario.estado.toUpperCase()}
            </Badge>
            {operario.jornada_activa && (
              <Badge variant="outline" className="text-blue-600 border-blue-600">EN JORNADA</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-2 h-7 px-2 border" onClick={() => setOpenEdit(true)}>
              <Edit className="w-3 h-3 mr-1" /> Editar
            </Button>
          </h1>
          <p className="text-muted-foreground">{operario.cargo || "Operario"} • DNI: {operario.dni === "COMPLETAR" ? <span className="text-red-500 font-bold">FALTA DNI</span> : operario.dni}</p>
        </div>
      </div>

      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="balance">Balance de Jornadas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
          {missingInfo.length > 0 && (
            <Alert variant="destructive" className="bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800 font-bold">Información Faltante</AlertTitle>
              <AlertDescription className="text-red-700">
                Faltan completar los siguientes datos del operario: <strong>{missingInfo.join(", ")}</strong>. 
                Por favor, haz clic en "Editar" para completarlos.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Datos Personales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Teléfono
                    </p>
                    <p className="font-medium">{operario.telefono || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Fecha Ingreso
                    </p>
                    <p className="font-medium">
                      {operario.fecha_ingreso ? format(new Date(operario.fecha_ingreso), "dd/MM/yyyy") : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cargo</p>
                    <p className="font-medium">{operario.cargo || "No asignado"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <p className="font-medium capitalize">{operario.estado}</p>
                  </div>
                </div>
                
                {(fotoCarnet || fotoPerfil) && (
                  <div className="mt-6 pt-6 border-t">
                    <p className="text-sm font-semibold mb-3">Documentación Fotográfica</p>
                    <div className="flex flex-wrap gap-4">
                      {fotoPerfil && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Foto de Perfil</p>
                          <img 
                            src={fotoPerfil.url} 
                            alt="Perfil" 
                            className="w-32 h-32 md:w-48 md:h-48 rounded-lg shadow-sm border border-border/50 object-cover"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        </div>
                      )}
                      {fotoCarnet && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Carnet de Conducir</p>
                          <img src={fotoCarnet.url} alt="Carnet" className="max-w-full md:max-w-[300px] h-auto rounded-lg shadow-sm border border-border/50 object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {operario.alertas_count ? (
                  <div className="mt-6 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-center justify-between">
                    <span className="font-medium">
                      {operario.alertas_count} incidente(s) / alerta(s) registrada(s)
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white text-red-600 hover:text-red-700"
                      onClick={() => setLocation("/incidentes")}
                    >
                      Ver historial
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full bg-primary"
              disabled={operario.jornada_activa || operario.estado !== "activo"}
              onClick={() => setOpenJornada(true)}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {operario.jornada_activa ? "Jornada en curso" : "Iniciar Jornada"}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10"
              onClick={() => setOpenIncidente(true)}
            >
              Reportar Incidente
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const nombre = encodeURIComponent(`${operario.nombre} ${operario.apellido}`);
                window.location.href = `/documentos?empleado_id=${operario.id}&nombre=${nombre}`;
              }}
            >
              Ver Documentación
            </Button>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="balance">
        <Card>
          <CardHeader>
            <CardTitle>Historial de Jornadas</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceOperario operarioId={operarioId} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

      <IniciarJornadaDialog
        open={openJornada}
        onOpenChange={setOpenJornada}
        empleadoIdFijo={operarioId}
      />
      <ReportarIncidenteDialog
        open={openIncidente}
        onOpenChange={setOpenIncidente}
        empleadoIdFijo={operarioId}
      />
      <EditarOperarioDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        operario={operario}
      />
    </div>
  );
}

function BalanceOperario({ operarioId }: { operarioId: number }) {
  const { data: jornadas, isLoading } = useGetJornadas({ empleado_id: String(operarioId) } as any);

  if (isLoading) return <div className="p-4 text-center">Cargando jornadas...</div>;
  if (!jornadas || jornadas.length === 0) return <div className="p-4 text-center text-muted-foreground">No hay jornadas registradas para este operario.</div>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Máquina</TableHead>
            <TableHead>Horómetro Inicio</TableHead>
            <TableHead>Horómetro Fin</TableHead>
            <TableHead>Horas Trab.</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jornadas.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="font-medium">{format(new Date(j.fecha), "dd/MM/yyyy")}</TableCell>
              <TableCell>{(j as any).maquina_nombre || "-"}</TableCell>
              <TableCell>{j.horometro_inicio || "-"}</TableCell>
              <TableCell>{j.horometro_fin || "-"}</TableCell>
              <TableCell>{(j as any).horas_trabajadas?.toFixed(1) || "-"}</TableCell>
              <TableCell>
                <Badge variant={j.estado === "finalizada" ? "default" : "secondary"}>
                  {j.estado}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
