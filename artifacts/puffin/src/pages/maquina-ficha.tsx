import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetMaquina } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Truck, Settings, Wrench, Droplets, Edit } from "lucide-react";
import { RegistrarMantenimientoDialog } from "@/components/forms/registrar-mantenimiento-dialog";
import { RegistrarCargaDialog } from "@/components/forms/registrar-carga-dialog";
import { ReportarIncidenteDialog } from "@/components/forms/reportar-incidente-dialog";
import { EditarMaquinaDialog } from "@/components/forms/editar-maquina-dialog";
import { HistorialMaquinaDialog } from "@/components/forms/historial-maquina-dialog";
import { History, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const estadoBadge = (estado: string) => {
  if (estado === "activa") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVA</Badge>;
  if (estado === "detenida") return <Badge variant="destructive">DETENIDA</Badge>;
  if (estado === "mantenimiento") return <Badge className="bg-yellow-500 text-white border-transparent">MANTENIMIENTO</Badge>;
  return <Badge variant="secondary">{estado.toUpperCase()}</Badge>;
};

export function MaquinaFicha() {
  const { id } = useParams();
  const maquinaId = parseInt(id || "0", 10);
  const { data: maquina, isLoading } = useGetMaquina(maquinaId, { query: { enabled: !!maquinaId } as any });
  const [openMant, setOpenMant] = useState(false);
  const [openComb, setOpenComb] = useState(false);
  const [openInc, setOpenInc] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);

  if (isLoading) return <div className="p-8 text-center">Cargando ficha de máquina...</div>;
  if (!maquina) return <div className="p-8 text-center text-red-500">Máquina no encontrada</div>;

  const missingInfo: string[] = [];
  if (maquina.categoria === "maquinaria") {
    if (!maquina.marca) missingInfo.push("Marca");
    if (!maquina.modelo) missingInfo.push("Modelo");
    if (!maquina.anio) missingInfo.push("Año");
    if (!maquina.patente && !maquina.dominio) missingInfo.push("Patente / Dominio");
    if (!maquina.motor) missingInfo.push("N° Motor");
    if (!maquina.chasis) missingInfo.push("N° Chasis");
    if (!maquina.filtro_tipo) missingInfo.push("Tipo de filtro");
    if (!maquina.filtro_codigo) missingInfo.push("Código de filtro");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/maquinas">
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            {maquina.nombre}
            {estadoBadge(maquina.estado)}
            <Button variant="ghost" size="sm" className="ml-2 h-7 px-2 border" onClick={() => setOpenEdit(true)}>
              <Edit className="w-3 h-3 mr-1" /> Editar
            </Button>
          </h1>
          <p className="text-muted-foreground">{maquina.codigo} • {maquina.tipo.toUpperCase()}</p>
        </div>
      </div>

      {missingInfo.length > 0 && (
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 font-bold">Información Faltante</AlertTitle>
          <AlertDescription className="text-red-700">
            Faltan completar los siguientes datos de la máquina: <strong>{missingInfo.join(", ")}</strong>. 
            Por favor, haz clic en "Editar" para completarlos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Datos Técnicos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Marca / Modelo</p>
              <p className="font-medium">{maquina.marca || "-"} {maquina.modelo || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Año</p>
              <p className="font-medium">{maquina.anio || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Patente / Dominio</p>
              <p className="font-medium">{maquina.patente || maquina.dominio || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Horómetro Actual</p>
              <p className="font-medium text-lg text-primary">{maquina.horometro || 0} h</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kilometraje</p>
              <p className="font-medium">{maquina.kilometros || 0} km</p>
            </div>
            {maquina.chasis && (
              <div>
                <p className="text-sm text-muted-foreground">N° Chasis</p>
                <p className="font-medium">{maquina.chasis}</p>
              </div>
            )}
            {maquina.motor && (
              <div>
                <p className="text-sm text-muted-foreground">N° Motor</p>
                <p className="font-medium">{maquina.motor}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Mantenimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Último Service</p>
                <p className="font-medium">{maquina.ultimo_service || "No registrado"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Próximo Service</p>
                <p className="font-medium text-yellow-600 font-bold">{maquina.proximo_service || "No programado"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full bg-primary" onClick={() => setOpenMant(true)}>
                <Wrench className="mr-2 h-4 w-4" />
                Registrar Mantenimiento
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setOpenComb(true)}>
                <Droplets className="mr-2 h-4 w-4" />
                Registrar Combustible
              </Button>
              <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10" onClick={() => setOpenInc(true)}>
                Reportar Incidente
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setOpenHistorial(true)}>
                <History className="mr-2 h-4 w-4" />
                Ver Historial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <RegistrarMantenimientoDialog open={openMant} onOpenChange={setOpenMant} maquinaIdFija={maquinaId} />
      <RegistrarCargaDialog open={openComb} onOpenChange={setOpenComb} maquinaIdFija={maquinaId} />
      <ReportarIncidenteDialog open={openInc} onOpenChange={setOpenInc} maquinaIdFija={maquinaId} />
      <EditarMaquinaDialog open={openEdit} onOpenChange={setOpenEdit} maquina={maquina} />
      <HistorialMaquinaDialog open={openHistorial} onOpenChange={setOpenHistorial} maquina={maquina} />
    </div>
  );
}
