import React, { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetEmpleado } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, User, Phone, FileText, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { IniciarJornadaDialog } from "@/components/forms/iniciar-jornada-dialog";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";

export function OperarioFicha() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const operarioId = parseInt(id || "0", 10);
  const { data: operario, isLoading } = useGetEmpleado(operarioId, { query: { enabled: !!operarioId } });
  const [openJornada, setOpenJornada] = useState(false);
  const [openIncidente, setOpenIncidente] = useState(false);

  if (isLoading) return <div className="p-8 text-center">Cargando perfil de operario...</div>;
  if (!operario) return <div className="p-8 text-center text-red-500">Operario no encontrado</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/operarios">
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
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
          </h1>
          <p className="text-muted-foreground">{operario.cargo || "Operario"} • DNI: {operario.dni}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Datos Personales
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
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
            {operario.alertas_count ? (
              <div className="col-span-2 mt-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-center justify-between">
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
              onClick={() => setLocation("/documentos")}
            >
              Ver Documentación
            </Button>
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
