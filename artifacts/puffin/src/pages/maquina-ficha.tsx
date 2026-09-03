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
import { History, AlertTriangle, Trash2, Star, FileText, Plus, ExternalLink, Satellite, Power, PowerOff, RefreshCw, List, LayoutList, MapPin } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAuthToken } from "@/hooks/use-auth";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { getGetFotografiasQueryKey, useGetDocumentos } from "@workspace/api-client-react";
import { AñadirDocumentoDialog } from "@/components/forms/aniadir-documento-dialog";
import { RegistrarAlquilerDialog } from "@/components/forms/registrar-alquiler-dialog";

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
  const [openDocs, setOpenDocs] = useState(false);
  const [openAlquiler, setOpenAlquiler] = useState(false);
  const [historialView, setHistorialView] = useState<"tabla" | "timeline">("tabla");

  const queryClient = useQueryClient();
  const { data: documentos } = useGetDocumentos({ entidad_tipo: "maquina", entidad_id: maquinaId } as any, { query: { enabled: !!maquinaId } as any });

  const { data: alquileres } = useQuery({
    queryKey: ["alquileres", maquinaId],
    queryFn: async () => {
      const res = await fetch(`/api/alquileres/${maquinaId}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error("Error fetching alquileres");
      return res.json();
    },
    enabled: !!maquinaId
  });

  const alquilerActivo = alquileres?.find((a: any) => a.estado === "en_curso");

  const { data: historialUso, refetch: refetchHistorial } = useQuery({
    queryKey: ["historial-uso", maquinaId],
    queryFn: async () => {
      const res = await fetch(`/api/maquinas/${maquinaId}/historial-uso`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error("Error fetching historial");
      return res.json();
    },
    enabled: !!maquinaId
  });

  const handleDeleteFoto = async (id: number) => {
    if (confirm("¿Estás seguro de eliminar esta fotografía?")) {
      try {
        const res = await fetch(`/api/fotografias/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getAuthToken()}` }
        });
        if (!res.ok) throw new Error("Error HTTP " + res.status);
        queryClient.invalidateQueries({ queryKey: getGetFotografiasQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/fotografias"] });
        toast.success("Fotografía eliminada");
      } catch (e) {
        console.error(e);
        toast.error("Error al eliminar");
      }
    }
  };

  const handleSetMainFoto = async (id: number) => {
    try {
      const res = await fetch(`/api/fotografias/${id}/set-main`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error("Error HTTP " + res.status);
      queryClient.invalidateQueries({ queryKey: getGetFotografiasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/fotografias"] });
      toast.success("Establecida como foto principal");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar");
    }
  };

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
            {alquilerActivo && <Badge className="bg-purple-600 hover:bg-purple-700">EN ALQUILER</Badge>}
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
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" /> Fotografías
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Carousel className="w-full">
                  <CarouselContent>
                    {fotos.map((f, i) => (
                      <CarouselItem key={f.id}>
                        <div className="relative group rounded-lg overflow-hidden border bg-black flex justify-center items-center h-64 sm:h-96">
                          <img src={f.url} alt="Fotografía" className="w-full h-full object-contain" />
                          <div className="absolute top-2 right-2 flex flex-col sm:flex-row gap-2 z-10">
                            {i !== 0 && (
                              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleSetMainFoto(f.id); }} className="h-8 shadow-sm">
                                <Star className="w-4 h-4 mr-1 text-yellow-500 fill-yellow-500" /> Principal
                              </Button>
                            )}
                            <Button size="icon" variant="destructive" onClick={(e) => { e.stopPropagation(); handleDeleteFoto(f.id); }} className="h-8 w-8 shadow-sm self-end sm:self-auto">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          {i === 0 && (
                            <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1 shadow-md">
                              <Star className="w-3 h-3 fill-white" /> Principal
                            </div>
                          )}
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {fotos.length > 1 && (
                    <>
                      <CarouselPrevious className="left-2" />
                      <CarouselNext className="right-2" />
                    </>
                  )}
                </Carousel>
              </CardContent>
            </Card>
          )}
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Datos {maquina.categoria === "inventario" ? "Generales" : "Técnicos"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Marca {maquina.categoria === "maquinaria" ? "/ Modelo" : ""}</p>
              <p className="font-medium">{maquina.marca || "-"} {maquina.categoria === "maquinaria" ? maquina.modelo || "-" : ""}</p>
            </div>
            {maquina.categoria === "maquinaria" && (
              <>
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
                {maquina.vencimiento_seguro && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimiento Seguro</p>
                    <p className="font-medium">{format(new Date(maquina.vencimiento_seguro + 'T12:00:00'), "dd/MM/yyyy")}</p>
                  </div>
                )}
                {maquina.vencimiento_vtv && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimiento VTV</p>
                    <p className="font-medium">{format(new Date(maquina.vencimiento_vtv + 'T12:00:00'), "dd/MM/yyyy")}</p>
                  </div>
                )}
              </>
            )}
            {maquina.categoria === "inventario" && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Modelo</p>
                  <p className="font-medium">{maquina.modelo || "-"}</p>
                </div>
              </>
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

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Documentos de la maquinaria
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setOpenDocs(true)}>
              <Plus className="w-4 h-4 mr-1" /> Añadir
            </Button>
          </CardHeader>
          <CardContent>
            {documentos && documentos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                {documentos.map((d: any) => (
                  <div key={d.id} className="border rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline">{d.tipo}</Badge>
                        {d.estado === "vencido" ? (
                          <Badge variant="destructive">Vencido</Badge>
                        ) : d.estado === "proximo_vencimiento" ? (
                          <Badge className="bg-yellow-500 text-white">Próximo a vencer</Badge>
                        ) : (
                          <Badge className="bg-green-600">Vigente</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{d.descripcion || "Sin descripción"}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Vencimiento:</span>{" "}
                        <span className="font-semibold">{format(new Date(d.fecha_vencimiento + 'T12:00:00'), "dd/MM/yyyy", { locale: es })}</span>
                      </div>
                      {d.archivo_url && (
                        <a href={d.archivo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                          <ExternalLink className="w-3 h-3" /> Ver archivo
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No hay documentos registrados.</p>
            )}
          </CardContent>
        </Card>
        <Card className="mt-6 border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 bg-slate-50/70 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                <Satellite className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  Historial de Telemetría Satelital
                </CardTitle>
                <p className="text-xs text-muted-foreground">Registro automático de eventos de encendido, apagado y horómetro</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {historialUso && historialUso.length > 0 && (
                <>
                  {historialUso[0].evento === "encendido" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      MOTOR ENCENDIDO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 border border-slate-300">
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      MOTOR APAGADO
                    </span>
                  )}

                  <Badge variant="outline" className="text-xs font-medium bg-white">
                    {historialUso.length} eventos
                  </Badge>

                  {/* Toggle Vista */}
                  <div className="flex rounded-md border bg-white overflow-hidden p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistorialView("tabla")}
                      className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${historialView === "tabla" ? "bg-primary text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
                      title="Vista en tabla"
                    >
                      <LayoutList className="h-3.5 w-3.5" /> Tabla
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistorialView("timeline")}
                      className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${historialView === "timeline" ? "bg-primary text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
                      title="Vista en línea de tiempo"
                    >
                      <List className="h-3.5 w-3.5" /> Línea
                    </button>
                  </div>
                </>
              )}

              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 w-8 p-0 text-slate-500 hover:text-primary"
                onClick={() => refetchHistorial()}
                title="Actualizar historial satelital"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {historialUso && historialUso.length > 0 ? (
              historialView === "tabla" ? (
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  <Table>
                    <TableHeader className="bg-slate-50/90 sticky top-0 z-10 backdrop-blur-xs border-b">
                      <TableRow>
                        <TableHead className="w-[120px] font-semibold text-xs">Estado</TableHead>
                        <TableHead className="font-semibold text-xs">Fecha y Hora</TableHead>
                        <TableHead className="font-semibold text-xs">Horómetro</TableHead>
                        <TableHead className="font-semibold text-xs">Ubicación GPS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historialUso.map((evento: any, idx: number) => {
                        const isEnc = evento.evento === "encendido";
                        const prevEvento = historialUso[idx + 1];
                        let diffHoras = null;
                        if (prevEvento && evento.horometro && prevEvento.horometro) {
                          const diff = parseFloat(evento.horometro) - parseFloat(prevEvento.horometro);
                          if (diff > 0) diffHoras = diff.toFixed(1);
                        }

                        return (
                          <TableRow key={evento.id} className="hover:bg-slate-50/80 transition-colors">
                            <TableCell className="py-2.5">
                              {isEnc ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Power className="h-3 w-3 text-emerald-600" /> Encendido
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <PowerOff className="h-3 w-3 text-slate-400" /> Apagado
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-700 font-medium whitespace-nowrap">
                              {format(new Date(evento.fecha_hora), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs font-mono font-semibold text-slate-800">
                              {evento.horometro} h
                              {diffHoras && (
                                <span className="ml-1.5 text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                  +{diffHoras} h
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-600 truncate max-w-[220px]">
                              {evento.ubicacion_lat && evento.ubicacion_lng ? (
                                <a 
                                  href={`https://maps.google.com/?q=${evento.ubicacion_lat},${evento.ubicacion_lng}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate"
                                  title={`${evento.ubicacion_texto || "Ver en mapa"} (${evento.ubicacion_lat}, ${evento.ubicacion_lng})`}
                                >
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{evento.ubicacion_texto || `${Number(evento.ubicacion_lat).toFixed(4)}, ${Number(evento.ubicacion_lng).toFixed(4)}`}</span>
                                </a>
                              ) : (
                                <span className="text-slate-400">Sin coordenadas</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                // Vista Timeline Compacta con scroll
                <div className="max-h-[380px] overflow-y-auto p-4">
                  <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {historialUso.map((evento: any) => {
                      const isEnc = evento.evento === "encendido";
                      return (
                        <div key={evento.id} className="relative flex items-start gap-3 text-xs group">
                          <div className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${isEnc ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-slate-400 ring-2 ring-slate-100"}`} />
                          <div className="flex-1 bg-slate-50/70 border border-slate-200/80 rounded-lg p-2.5 flex items-center justify-between hover:bg-white hover:border-slate-300 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded ${isEnc ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                                {evento.evento}
                              </span>
                              <span className="font-mono text-slate-700 font-semibold">{evento.horometro} h</span>
                              {evento.ubicacion_texto && (
                                <span className="text-slate-500 hidden sm:inline truncate max-w-[180px]">· {evento.ubicacion_texto}</span>
                              )}
                            </div>
                            <time className="text-[11px] text-slate-500 whitespace-nowrap ml-2">
                              {format(new Date(evento.fecha_hora), "dd/MM/yyyy HH:mm", { locale: es })}
                            </time>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Satellite className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p>No hay registros satelitales para esta máquina.</p>
                <p className="text-xs text-slate-400 mt-1">Los eventos se registrarán automáticamente cuando el motor se encienda o apague.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-500" /> Gestión de Alquileres
            </CardTitle>
            <Button 
              size="sm" 
              variant={alquilerActivo ? "default" : "outline"} 
              className={alquilerActivo ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
              onClick={() => setOpenAlquiler(true)}
            >
              {alquilerActivo ? "Finalizar Alquiler" : "Nuevo Alquiler"}
            </Button>
          </CardHeader>
          <CardContent>
            {alquileres && alquileres.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm mt-2 text-left">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="py-2 px-3 font-medium">Cliente/Proyecto</th>
                      <th className="py-2 px-3 font-medium">Inicio</th>
                      <th className="py-2 px-3 font-medium">Fin</th>
                      <th className="py-2 px-3 font-medium">Horas Trabajadas</th>
                      <th className="py-2 px-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alquileres.map((a: any) => (
                      <tr key={a.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium">{a.cliente}</td>
                        <td className="py-3 px-3 text-slate-600">
                          {format(new Date(a.fecha_inicio + 'T12:00:00'), "dd/MM/yyyy", { locale: es })}<br/>
                          <span className="text-xs text-slate-400">({a.horometro_inicio} h)</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {a.fecha_fin ? (
                            <>
                              {format(new Date(a.fecha_fin + 'T12:00:00'), "dd/MM/yyyy", { locale: es })}<br/>
                              <span className="text-xs text-slate-400">({a.horometro_fin} h)</span>
                            </>
                          ) : "—"}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">
                          {a.horas_trabajadas ? `${a.horas_trabajadas} h` : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {a.estado === "en_curso" ? (
                            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">En Curso</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-slate-100">Finalizado</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No hay registros de alquiler para esta maquinaria.</p>
            )}
          </CardContent>
        </Card>
        
        </div>


        <div className="space-y-4">
          {maquina.categoria === "maquinaria" && (
            <>
            <Card>
              <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Mantenimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mantenimientos?.data && mantenimientos.data.length > 0 ? (() => {
                const ultimo = mantenimientos.data[mantenimientos.data.length - 1];
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
          {mantenimientos?.data && mantenimientos.data.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  Historial de Mantenimientos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mantenimientos.data.map((m: any) => (
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
          </>
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
      <AñadirDocumentoDialog open={openDocs} onOpenChange={setOpenDocs} defaultEntidadTipo="maquina" defaultEntidadId={maquinaId.toString()} />
      <RegistrarAlquilerDialog open={openAlquiler} onOpenChange={setOpenAlquiler} maquina={maquina} alquilerActivo={alquilerActivo} />
    </div>
  );
}
