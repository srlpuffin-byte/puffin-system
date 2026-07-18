import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetMaquina, useGetFotografias, useGetMantenimientos } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Truck, Settings, Wrench, Droplets, Edit, Image as ImageIcon, ClipboardList, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
  const { data: fotos } = useGetFotografias({ entidad_tipo: "maquina", entidad_id: maquinaId }, { query: { enabled: !!maquinaId } as any });
  const { data: mantenimientos } = useGetMantenimientos({ maquina_id: maquinaId }, { query: { enabled: !!maquinaId } as any });
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
        <div className="md:col-span-2 space-y-6">
          {fotos && fotos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Fotografías
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fotos.map(f => (
                  <div key={f.id} className="relative rounded-lg overflow-hidden border">
                    <img src={f.url} alt="Fotografía" className="w-full h-48 object-cover" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
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
        {maquina.descripcion && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Descripción / Observaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{maquina.descripcion}</p>
            </CardContent>
          </Card>
        )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Mantenimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mantenimientos && mantenimientos.length > 0 ? (() => {
                const ultimo = mantenimientos[mantenimientos.length - 1];
                const ultimo_fecha = ultimo?.fecha ? format(new Date(ultimo.fecha + 'T12:00:00'), "dd/MM/yyyy", { locale: es }) : "—";
                return (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Último Service</p>
                      <p className="font-medium">{ultimo_fecha} — {ultimo?.tipo}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Próximo Service</p>
                      <p className="font-medium text-yellow-600 font-bold">
                        {ultimo?.proximo_service ? format(new Date(ultimo.proximo_service + 'T12:00:00'), "dd/MM/yyyy", { locale: es }) : maquina.proximo_service || "No programado"}
                      </p>
                    </div>
                  </>
                );
              })() : (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Último Service</p>
                    <p className="font-medium">{maquina.ultimo_service || "No registrado"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Próximo Service</p>
                    <p className="font-medium text-yellow-600 font-bold">{maquina.proximo_service || "No programado"}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Historial de mantenimientos */}
          {mantenimientos && mantenimientos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  Historial de Mantenimientos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mantenimientos.map((m: any) => (
                  <div key={m.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                    <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${m.estado === "realizado" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                      {m.estado === "realizado" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{m.tipo}</p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {m.fecha ? format(new Date(m.fecha + 'T12:00:00'), "dd/MM/yy", { locale: es }) : "—"}
                        </span>
                      </div>
                      {m.descripcion && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.descripcion}</p>
                      )}
                      {(m.horometro_actual || m.kilometros_actual) && (
                        <p className="text-xs text-slate-500 mt-1">
                          {m.horometro_actual ? `${m.horometro_actual} h` : ""}{m.horometro_actual && m.kilometros_actual ? " · " : ""}{m.kilometros_actual ? `${m.kilometros_actual} km` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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
