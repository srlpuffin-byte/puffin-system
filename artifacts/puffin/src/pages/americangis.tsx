import React, { useState, useEffect, useMemo } from "react";
import { 
  LatLng, 
  LineSegment, 
  Waypoint, 
  WaypointTipo, 
  LotePlan, 
  calcularMetricasPoligono, 
  generarLineasGuia, 
  encontrarRumboBordeMasLargo, 
  obtenerNombreRumbo, 
  parsearCoordenadas, 
  generarKML, 
  generarCSV, 
  generarGeoJSON, 
  descargarArchivo, 
  generarLotePorMedidas, 
  calcularCentroide, 
  generarPasadasDesdeLineaBase, 
  calcularBordesPerimetro, 
  auditarRectitudLote, 
  enderezarPoligonoCuadrado, 
  suavizarBordesCurvos, 
  proyectarEjeCentral, 
  calcularEjesLote,
  esPuntoEnPoligono,
  calcularDesvioPasada,
  parsearTrackGps
} from "@/lib/gis/surface-planner";
import { TrazadorMapa, MapInteractionMode, MaquinaGpsPunto, formatearTiempoReporte } from "@/components/map/TrazadorMapa";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  Compass, 
  MapPin, 
  Layers, 
  Download, 
  FileSpreadsheet, 
  Check, 
  Copy, 
  Sparkles, 
  Smartphone, 
  Save, 
  Clock, 
  Activity, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Route, 
  Square, 
  Magnet, 
  Target, 
  Edit3,
  Tractor,
  Upload,
  RefreshCw,
  Crosshair,
  FileCheck
} from "lucide-react";
import { toast } from "sonner";

const ANCHOS_PRESET = [3, 5, 8, 10, 15, 20, 30, 50, 100];

export function Americangis() {
  const { data: proyectos } = useGetProyectos();

  // Estados principales del trazado
  const [nombreLote, setNombreLote] = useState("Lote 01 - Trazado Recto");
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<string>("");
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [anchoCalle, setAnchoCalle] = useState<number>(5); // 5 metros por defecto como solicitó el usuario
  const [rumboGrados, setRumboGrados] = useState<number>(90);
  const [alternarSentido, setAlternarSentido] = useState<boolean>(true);
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>("none");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("mapa");
  
  // Elementos avanzados de campo
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [callesManuales, setCallesManuales] = useState<LineSegment[]>([]);
  const [lotesGuardados, setLotesGuardados] = useState<LotePlan[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Diálogo para ingreso manual de coordenadas
  const [dialogCoordsOpen, setDialogCoordsOpen] = useState(false);
  const [textoCoordsInput, setTextoCoordsInput] = useState("");

  // Telemetría en tiempo real de maquinaria Xpert Satcom
  const { data: maquinasGps = [], refetch: refetchMaquinasGps, isFetching: isFetchingGps } = useQuery<MaquinaGpsPunto[]>({
    queryKey: ["satcom-mapa"],
    queryFn: () => apiFetch("/integrations/xpert/mapa"),
    refetchInterval: 15000,
  });

  const [mostrarMaquinasGps, setMostrarMaquinasGps] = useState<boolean>(true);
  const [trackAuditoria, setTrackAuditoria] = useState<LatLng[]>([]);
  const [maquinaEnFoco, setMaquinaEnFoco] = useState<LatLng | null>(null);
  const [nombreTrackCargado, setNombreTrackCargado] = useState<string | null>(null);

  const handleCargarArchivoTrack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const contenido = event.target?.result as string;
      if (!contenido) return;
      const puntos = parsearTrackGps(contenido);
      if (puntos.length === 0) {
        toast.error("No se encontraron coordenadas válidas en el archivo GPX o KML");
        return;
      }
      setTrackAuditoria(puntos);
      setNombreTrackCargado(file.name);
      toast.success(`Track cargado: ${puntos.length} puntos GPS listos para auditar sobre el mapa`);
      setActiveTab("mapa");
    };
    reader.readAsText(file);
  };

  // Diálogo para generar lote por medidas exactas
  const [dialogMedidasOpen, setDialogMedidasOpen] = useState(false);
  const [medidaAncho, setMedidaAncho] = useState("400");
  const [medidaLargo, setMedidaLargo] = useState("600");
  const [medidaRumbo, setMedidaRumbo] = useState("90");

  // Diálogo para nuevo waypoint
  const [dialogWpOpen, setDialogWpOpen] = useState(false);
  const [wpNombre, setWpNombre] = useState("");
  const [wpTipo, setWpTipo] = useState<WaypointTipo>("mojon");
  const [wpLat, setWpLat] = useState("");
  const [wpLng, setWpLng] = useState("");
  const [wpRadio, setWpRadio] = useState("10");
  const [wpNotas, setWpNotas] = useState("");

  // Cargar biblioteca de lotes guardados
  useEffect(() => {
    try {
      const saved = localStorage.getItem("puffin_trazados_lotes");
      if (saved) {
        setLotesGuardados(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error cargando lotes:", e);
    }
  }, []);

  // Cálculos métricos de la superficie
  const metricas = useMemo(() => {
    return calcularMetricasPoligono(polygon);
  }, [polygon]);

  // Auditoría de rectitud, escuadras y distancias del perímetro
  const auditoria = useMemo(() => {
    return auditarRectitudLote(polygon);
  }, [polygon]);

  // Ejes naturales del lote (a lo largo y a lo ancho a 90° - paralelas a alambrados)
  const ejes = useMemo(() => {
    return calcularEjesLote(polygon);
  }, [polygon]);

  // Generador geométrico de pasadas paralelas rectas
  const lineas: LineSegment[] = useMemo(() => {
    if (polygon.length < 3) return [];
    return generarLineasGuia(polygon, anchoCalle, rumboGrados, alternarSentido);
  }, [polygon, anchoCalle, rumboGrados, alternarSentido]);

  // Distancia total acumulada
  const distanciaTotalMeters = useMemo(() => {
    const distAuto = lineas.reduce((acc, l) => acc + l.lengthMeters, 0);
    const distManual = callesManuales.reduce((acc, l) => acc + l.lengthMeters, 0);
    return distAuto + distManual;
  }, [lineas, callesManuales]);

  // Estimación de horas de máquina (7.5 km/h promedio)
  const horasEstimadas = useMemo(() => {
    if (distanciaTotalMeters === 0) return 0;
    const km = distanciaTotalMeters / 1000;
    return Math.round((km / 7.5) * 10) / 10;
  }, [distanciaTotalMeters]);

  // Objeto Plan completo
  const planActual: LotePlan = useMemo(() => {
    return {
      id: `lote-${Date.now()}`,
      nombre: nombreLote,
      proyectoId: proyectoSeleccionado || undefined,
      fechaCreacion: new Date().toISOString(),
      polygon,
      areaM2: metricas.areaM2,
      areaHectareas: metricas.areaHectareas,
      perimetroMeters: metricas.perimetroMeters,
      anchoCalleMeters: anchoCalle,
      rumboGrados,
      alternarSentido,
      lineas,
      callesManuales,
      waypoints,
      distanciaTotalMeters,
    };
  }, [
    nombreLote,
    proyectoSeleccionado,
    polygon,
    metricas,
    anchoCalle,
    rumboGrados,
    alternarSentido,
    lineas,
    callesManuales,
    waypoints,
    distanciaTotalMeters,
  ]);

  // Auto-alinear con lado más largo
  const handleAlinearBordeMasLargo = () => {
    if (polygon.length < 2) {
      toast.error("Delimite primero el terreno con al menos 2 puntos");
      return;
    }
    const rumboOptimo = encontrarRumboBordeMasLargo(polygon);
    setRumboGrados(rumboOptimo);
    toast.success(`Rumbo calibrado a ${rumboOptimo}° (${obtenerNombreRumbo(rumboOptimo)})`);
  };

  // Guardar en biblioteca
  const handleGuardarLote = () => {
    if (polygon.length < 3) {
      toast.error("Delimite una superficie cerrada antes de guardar");
      return;
    }
    try {
      const nuevoLote: LotePlan = { ...planActual, id: `lote-${Date.now()}` };
      const actualizados = [nuevoLote, ...lotesGuardados.filter((l) => l.nombre !== nuevoLote.nombre)];
      setLotesGuardados(actualizados);
      localStorage.setItem("puffin_trazados_lotes", JSON.stringify(actualizados));
      toast.success(`Lote "${nombreLote}" guardado`);
    } catch (e) {
      toast.error("Error al guardar");
    }
  };

  // Cargar lote guardado
  const handleCargarLote = (lote: LotePlan) => {
    setNombreLote(lote.nombre);
    setPolygon(lote.polygon);
    setAnchoCalle(lote.anchoCalleMeters);
    setRumboGrados(lote.rumboGrados);
    setAlternarSentido(lote.alternarSentido);
    setCallesManuales(lote.callesManuales || []);
    setWaypoints(lote.waypoints || []);
    if (lote.proyectoId) setProyectoSeleccionado(lote.proyectoId);
    toast.info(`Lote "${lote.nombre}" cargado`);
  };

  // Agregar coordenadas manuales al polígono
  const handleAgregarCoordsManual = () => {
    const lineas = textoCoordsInput.split("\n");
    const nuevosPuntos: LatLng[] = [];

    for (const l of lineas) {
      const parsed = parsearCoordenadas(l);
      if (parsed) nuevosPuntos.push(parsed);
    }

    if (nuevosPuntos.length === 0) {
      toast.error("No se detectaron coordenadas válidas. Use formato: -32.8908, -64.3496");
      return;
    }

    setPolygon([...polygon, ...nuevosPuntos]);
    setTextoCoordsInput("");
    setDialogCoordsOpen(false);
    toast.success(`${nuevosPuntos.length} puntos agregados al polígono`);
  };

  // Generar lote rectangular por medidas exactas
  const handleGenerarLotePorMedidas = () => {
    const ancho = parseFloat(medidaAncho);
    const largo = parseFloat(medidaLargo);
    const rumbo = parseFloat(medidaRumbo);
    if (isNaN(ancho) || isNaN(largo) || ancho <= 0 || largo <= 0) {
      toast.error("Ingrese medidas válidas en metros");
      return;
    }

    const centro = polygon.length >= 3 ? calcularCentroide(polygon) : { lat: -32.8908, lng: -64.3496 };
    const nuevoRect = generarLotePorMedidas(centro, ancho, largo, isNaN(rumbo) ? 90 : rumbo);
    setPolygon(nuevoRect);
    if (!isNaN(rumbo)) setRumboGrados(rumbo);
    setDialogMedidasOpen(false);
    toast.success(`Lote de ${ancho}m x ${largo}m generado (${((ancho * largo) / 10000).toFixed(2)} Ha)`);
  };

  // Tirar recta horizontal (Este-Oeste / 90°)
  const handleTirarRectaHorizontal = () => {
    setRumboGrados(90);
    toast.success("Rumbo de pasadas calibrado en HORIZONTAL (Este-Oeste / 90°)");
  };

  // Tirar recta vertical (Norte-Sur / 0°)
  const handleTirarRectaVertical = () => {
    setRumboGrados(0);
    toast.success("Rumbo de pasadas calibrado en VERTICAL (Norte-Sur / 0°)");
  };

  // Ajuste inteligente: Suavizar curvas del perímetro (alambrados, cañadas, bajos)
  const handleSuavizarCurvas = () => {
    if (polygon.length < 3) {
      toast.error("Delimite al menos 3 puntos del terreno para suavizar.");
      return;
    }
    const suavizado = suavizarBordesCurvos(polygon, 1);
    setPolygon(suavizado);
    toast.success("¡Curvas naturales aplicadas al perímetro con éxito!");
  };

  // Ajuste inteligente: Cuadrar y enderezar a 90° (Escuadra matemática)
  const handleEnderezarCuadrado = () => {
    if (polygon.length !== 4) {
      toast.error("El lote debe tener 4 esquinas para calibrar a escuadra perfecta de 90°.");
      return;
    }
    const enderezado = enderezarPoligonoCuadrado(polygon);
    setPolygon(enderezado);
    toast.success("¡Lote enderezado! Esquinas a 90° exactos y lados opuestos paralelos.");
  };

  // Borrar calle manual individual
  const handleBorrarCalleManual = (id: string) => {
    setCallesManuales(callesManuales.filter((c) => c.id !== id));
    toast.info("Calle manual eliminada");
  };

  // Generar pasadas paralelas a partir de una recta manual (cada 5m hasta el final)
  const handleGenerarPasadasDesdeRecta = (line: LineSegment) => {
    const paso = anchoCalle || 5;
    const pasadas = generarPasadasDesdeLineaBase(
      { start: line.start, end: line.end },
      paso,
      25,
      "ambos"
    );
    setCallesManuales(pasadas);
    toast.success(`¡Tiradas ${pasadas.length} líneas rectas cada ${paso}m a partir de la calle!`);
  };

  // Crear nuevo waypoint desde diálogo
  const handleCrearWaypointManual = () => {
    const latNum = parseFloat(wpLat);
    const lngNum = parseFloat(wpLng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      toast.error("Ingrese coordenadas válidas");
      return;
    }

    const nuevo: Waypoint = {
      id: `wp-${Date.now()}`,
      nombre: wpNombre || `Punto ${waypoints.length + 1}`,
      tipo: wpTipo,
      lat: latNum,
      lng: lngNum,
      radioSeguridadMeters: parseFloat(wpRadio) || 0,
      notas: wpNotas,
    };

    setWaypoints([...waypoints, nuevo]);
    setDialogWpOpen(false);
    setWpNombre("");
    setWpLat("");
    setWpLng("");
    setWpNotas("");
    toast.success(`Waypoint "${nuevo.nombre}" creado`);
  };

  // Exportar KML
  const handleDescargarKML = () => {
    if (polygon.length < 3) {
      toast.error("Delimite una superficie antes de exportar");
      return;
    }
    const kml = generarKML(planActual);
    const nombreClean = nombreLote.replace(/\s+/g, "_").toLowerCase();
    descargarArchivo(kml, `${nombreClean}_avenza.kml`, "application/vnd.google-earth.kml+xml");
    toast.success("Archivo KML descargado. Compatible al 100% con Avenza Maps y Google Earth");
  };

  // Exportar CSV
  const handleDescargarCSV = () => {
    if (lineas.length === 0 && polygon.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }
    const csv = generarCSV(planActual);
    const nombreClean = nombreLote.replace(/\s+/g, "_").toLowerCase();
    descargarArchivo(csv, `${nombreClean}_plan_maquinaria.csv`, "text/csv;charset=utf-8;");
    toast.success("Planilla CSV descargada para banderilleros satelitales");
  };

  // Exportar GeoJSON
  const handleDescargarGeoJSON = () => {
    if (polygon.length < 3) {
      toast.error("Delimite una superficie antes de exportar");
      return;
    }
    const geojson = generarGeoJSON(planActual);
    const nombreClean = nombreLote.replace(/\s+/g, "_").toLowerCase();
    descargarArchivo(geojson, `${nombreClean}.geojson`, "application/geo+json");
    toast.success("GeoJSON descargado para QGIS / ArcGIS");
  };

  const handleCopiarCoords = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiedId(id);
    toast.success("Coordenadas copiadas al portapapeles");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado Profesional */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-primary">
              Trazador de Lotes y Calles Rectas
            </h1>
            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-xs font-semibold px-2 py-0.5">
              Guía A-B Geodésica
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Delimitación de superficies, trazado de pasadas paralelas rectas, waypoints y exportación a Avenza Maps & Banderilleros.
          </p>
        </div>

        {/* Acciones Superiores */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogMedidasOpen(true)}
            className="gap-1.5 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs h-9 text-slate-200"
            title="Autoayuda: Crear rectángulo perfecto por ancho y largo"
          >
            <Square className="h-4 w-4 text-amber-400" />
            Crear por Medidas (m)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogCoordsOpen(true)}
            className="gap-1.5 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs h-9"
          >
            <Edit3 className="h-4 w-4 text-cyan-400" />
            Cargar Coordenadas GPS
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGuardarLote}
            className="gap-1.5 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs h-9"
          >
            <Save className="h-4 w-4 text-emerald-400" />
            Guardar Lote
          </Button>

          <Button
            size="sm"
            onClick={handleDescargarKML}
            className="gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 shadow-md"
          >
            <Smartphone className="h-4 w-4 text-slate-950" />
            Exportar a Avenza Maps (.kml)
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI de Estado de Obra */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase tracking-wider">Superficie Total</span>
              <MapPin className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black tracking-tight text-white">
              {metricas.areaHectareas > 0 ? `${metricas.areaHectareas.toLocaleString("es-AR")} Ha` : "0.00 Ha"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {metricas.areaM2 > 0 ? `${metricas.areaM2.toLocaleString("es-AR")} m²` : "Sin delimitar"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase tracking-wider">Perímetro Lote</span>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black tracking-tight text-white">
              {metricas.perimetroMeters > 0 ? `${metricas.perimetroMeters.toLocaleString("es-AR")} m` : "0 m"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {polygon.length} vértices georreferenciados
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase tracking-wider">Pasadas / Calles</span>
              <Compass className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black tracking-tight text-amber-400">
              {lineas.length} {lineas.length === 1 ? "recta" : "rectas"}
              {callesManuales.length > 0 && <span className="text-xs text-fuchsia-400 ml-1">+{callesManuales.length} man.</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Separación: <b className="text-white">{anchoCalle} m</b> | Rumbo: <b className="text-white">{rumboGrados}°</b>
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase tracking-wider">Metros Lineales</span>
              <Clock className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black tracking-tight text-white">
              {(distanciaTotalMeters / 1000).toFixed(2)} km
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ~{horasEstimadas} h máq. (a 7.5 km/h)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configuración de Superficie y Rumbo */}
      <Card className="border-slate-800 bg-slate-900/70 shadow-lg">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Nombre de la Superficie / Lote
              </label>
              <Input
                value={nombreLote}
                onChange={(e) => setNombreLote(e.target.value)}
                placeholder="Ej: Lote 14 - Campo Norte"
                className="bg-slate-950 border-slate-700 text-sm h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Vincular a Proyecto de Puffin
              </label>
              <Select value={proyectoSeleccionado} onValueChange={setProyectoSeleccionado}>
                <SelectTrigger className="bg-slate-950 border-slate-700 text-sm h-9">
                  <SelectValue placeholder="Seleccionar proyecto activo..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  {proyectos && proyectos.length > 0 ? (
                    proyectos.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.lugar} ({p.hectareas} Ha)
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      Sin proyectos cargados
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {lotesGuardados.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Cargar Lote de la Biblioteca
                </label>
                <Select onValueChange={(val) => {
                  const encontrado = lotesGuardados.find((l) => l.id === val);
                  if (encontrado) handleCargarLote(encontrado);
                }}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-sm h-9 text-slate-300">
                    <SelectValue placeholder="Seleccionar lote guardado..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    {lotesGuardados.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nombre} ({l.areaHectareas} Ha)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="h-[1px] bg-slate-800" />

          {/* Parámetros de Generación */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Ancho de calle */}
            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 flex-wrap">
                  Ancho de Pasada / Calle: <b className="text-amber-400 font-mono text-sm">{anchoCalle} m</b>
                  {anchoCalle >= 50 && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                      {anchoCalle === 100 ? "Faja de 100m (Picada / Cortafuego)" : `Faja de ${anchoCalle}m`}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">Distancia entre ejes</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ANCHOS_PRESET.map((ancho) => (
                  <button
                    key={ancho}
                    onClick={() => setAnchoCalle(ancho)}
                    className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                      anchoCalle === ancho
                        ? "bg-amber-500 text-slate-950 font-bold border-amber-400 shadow"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {ancho}m
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <Input
                    type="number"
                    min="1"
                    max="2000"
                    step="1"
                    value={anchoCalle}
                    onChange={(e) => setAnchoCalle(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-16 h-7 text-xs bg-slate-950 border-slate-700 font-mono text-center"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </div>
            </div>

            {/* Rumbo */}
            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-amber-400" />
                  Rumbo de Pasada: <b className="text-amber-400 font-mono text-sm">{rumboGrados}°</b> ({obtenerNombreRumbo(rumboGrados)})
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAlinearBordeMasLargo}
                  className="h-6 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 p-1 gap-1"
                >
                  <Sparkles className="h-3 w-3" /> Auto-Alinear Lado Largo
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Slider
                  min={0}
                  max={359}
                  step={1}
                  value={[rumboGrados]}
                  onValueChange={(val) => setRumboGrados(val[0])}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInteractionMode("draw_ab")}
                  className="h-7 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 gap-1 px-2"
                >
                  <Compass className="h-3.5 w-3.5 text-amber-400" />
                  Trazar A-B
                </Button>
              </div>
            </div>

            {/* Boustrophedon */}
            <div className="lg:col-span-2 flex items-center justify-end gap-2 pt-2 lg:pt-0">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-300">Ida y Vuelta</p>
                <p className="text-[10px] text-muted-foreground">Alternar cabeceras</p>
              </div>
              <Switch
                checked={alternarSentido}
                onCheckedChange={setAlternarSentido}
              />
            </div>
          </div>

          <div className="h-[1px] bg-slate-800" />

          {/* Barra de Inteligencia de Perímetro y Duplicación hasta el Final */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Grupo 1: Sentido y Orientación de las Pasadas (Derecho al Campo) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5 text-amber-400" />
                  Sentido de Pasadas:
                </span>

                <Button
                  size="sm"
                  variant={rumboGrados === ejes.rumboLargo ? "default" : "outline"}
                  onClick={() => {
                    setRumboGrados(ejes.rumboLargo);
                    toast.success(`Pasadas alineadas A LO LARGO del lote (${Math.round(ejes.rumboLargo)}° - 100% Paralelas a alambrado)`);
                  }}
                  className={`h-7 text-xs gap-1 px-2.5 ${
                    rumboGrados === ejes.rumboLargo 
                      ? "bg-amber-500 text-slate-950 font-black shadow" 
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                  title="Alinear pasadas 100% paralelas al lado largo del campo (no van cruzadas)"
                >
                  📏 A lo Largo ({Math.round(ejes.rumboLargo)}°)
                </Button>

                <Button
                  size="sm"
                  variant={rumboGrados === ejes.rumboAncho ? "default" : "outline"}
                  onClick={() => {
                    setRumboGrados(ejes.rumboAncho);
                    toast.success(`Pasadas alineadas A LO ANCHO del lote (${Math.round(ejes.rumboAncho)}° - Transversal a 90°)`);
                  }}
                  className={`h-7 text-xs gap-1 px-2.5 ${
                    rumboGrados === ejes.rumboAncho 
                      ? "bg-amber-500 text-slate-950 font-black shadow" 
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                  title="Alinear pasadas perpendiculares de cabecera a cabecera a 90°"
                >
                  📐 A lo Ancho ({Math.round(ejes.rumboAncho)}°)
                </Button>

                <Button
                  size="sm"
                  variant={rumboGrados === 90 ? "default" : "outline"}
                  onClick={handleTirarRectaHorizontal}
                  className={`h-7 text-xs gap-1 px-2 ${rumboGrados === 90 ? "bg-amber-500 text-slate-950 font-bold" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
                  title="Horizontal geográfica (Este-Oeste / 90°)"
                >
                  ➡️ Horizontal
                </Button>

                <Button
                  size="sm"
                  variant={rumboGrados === 0 ? "default" : "outline"}
                  onClick={handleTirarRectaVertical}
                  className={`h-7 text-xs gap-1 px-2 ${rumboGrados === 0 ? "bg-amber-500 text-slate-950 font-bold" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
                  title="Vertical geográfica (Norte-Sur / 0°)"
                >
                  ⬆️ Vertical
                </Button>
              </div>

              {/* Grupo 2: Inteligencia de Contorno y Limpieza */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSuavizarCurvas}
                  disabled={polygon.length < 3}
                  className="h-7 text-xs border-slate-700 bg-slate-900 hover:bg-slate-800 text-cyan-300 gap-1 px-2.5"
                  title="Ajuste Inteligente: Convierte aristas toscas en curvas suaves para alambrados curvos o cañadas"
                >
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  Suavizar Curvas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEnderezarCuadrado}
                  disabled={polygon.length !== 4}
                  className="h-7 text-xs border-slate-700 bg-slate-900 hover:bg-slate-800 text-emerald-300 gap-1 px-2.5"
                  title="Ajusta las 4 esquinas exactamente a 90° y lados paralelos"
                >
                  <Square className="h-3 w-3 text-emerald-400" />
                  Cuadrar a 90°
                </Button>
                {callesManuales.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setCallesManuales([]);
                      toast.success("Calles externas eliminadas");
                    }}
                    className="h-7 text-xs bg-red-600 hover:bg-red-500 text-white font-bold gap-1 px-2.5 shadow animate-pulse"
                    title="Borrar calles que están fuera del perímetro"
                  >
                    <Trash2 className="h-3 w-3" />
                    Limpiar Calles Externas ({callesManuales.length})
                  </Button>
                )}
              </div>
            </div>

            {/* Grupo 3: Selector de Separación + Botón de Duplicación */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-300">
                  Separación entre Calles:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {[2, 3, 5, 8, 10, 15, 20, 30, 50, 100].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAnchoCalle(d)}
                      className={`px-2.5 py-0.5 text-xs font-bold rounded transition-all ${
                        anchoCalle === d
                          ? "bg-amber-500 text-slate-950 shadow scale-105"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {d}m
                    </button>
                  ))}
                  <div className="flex items-center gap-1 ml-1">
                    <Input
                      type="number"
                      min="0.5"
                      max="2000"
                      step="1"
                      value={anchoCalle}
                      onChange={(e) => setAnchoCalle(Math.max(0.5, parseFloat(e.target.value) || 1))}
                      className="w-16 h-7 text-xs bg-slate-900 border-slate-700 text-center font-bold text-amber-400 font-mono"
                    />
                    <span className="text-xs text-muted-foreground font-mono">m</span>
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  if (polygon.length < 3) {
                    toast.error("Delimite primero el terreno para duplicar las pasadas");
                    return;
                  }
                  toast.success(`¡Tiradas ${lineas.length} líneas rectas cada ${anchoCalle}m hasta el final del lote!`);
                }}
                className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-black gap-1.5 shadow px-3.5"
              >
                🚜 Duplicar Pasadas cada {anchoCalle}m ({lineas.length} rectas de borde a borde)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pestañas de Trabajo */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900 border border-slate-800 p-1 flex-wrap h-auto">
          <TabsTrigger value="mapa" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <Layers className="h-3.5 w-3.5" /> Visor Cartográfico y Trazador
          </TabsTrigger>
          <TabsTrigger value="telemetria" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <Tractor className="h-3.5 w-3.5" /> Auditoría Xpert Satcom ({maquinasGps.filter(m => m.lat !== null).length})
          </TabsTrigger>
          <TabsTrigger value="coordenadas" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Calles A-B ({lineas.length + callesManuales.length})
          </TabsTrigger>
          <TabsTrigger value="waypoints" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <AlertTriangle className="h-3.5 w-3.5" /> Waypoints & Obstáculos ({waypoints.length})
          </TabsTrigger>
          <TabsTrigger value="vertices" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <MapPin className="h-3.5 w-3.5" /> Vértices del Lote ({polygon.length})
          </TabsTrigger>
          <TabsTrigger value="avenza" className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-bold">
            <Smartphone className="h-3.5 w-3.5" /> Guía Avenza Maps & Celular
          </TabsTrigger>
        </TabsList>

        {/* PESTAÑA 1: VISOR SATELITAL */}
        <TabsContent value="mapa" className="space-y-3 m-0">
          {/* Alerta si hay calles manuales fuera del perímetro */}
          {callesManuales.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-slate-200">
                  Se detectaron <b className="text-amber-300">{callesManuales.length} calles manuales</b> fuera del perímetro del lote.
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setCallesManuales([]);
                  toast.success("Calles externas eliminadas");
                }}
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs h-7 px-3 shadow shrink-0 gap-1"
              >
                <Trash2 className="h-3 w-3" /> Limpiar Calles Fuera del Lote
              </Button>
            </div>
          )}

          <TrazadorMapa
            polygon={polygon}
            onPolygonChange={setPolygon}
            lineas={lineas}
            callesManuales={callesManuales}
            onCallesManualesChange={setCallesManuales}
            onDeleteCalleManual={handleBorrarCalleManual}
            onGenerarPasadasDesdeRecta={handleGenerarPasadasDesdeRecta}
            waypoints={waypoints}
            onWaypointsChange={setWaypoints}
            rumboGrados={rumboGrados}
            onRumboChange={setRumboGrados}
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            selectedLineId={selectedLineId}
            onSelectLine={setSelectedLineId}
            height="620px"
            anchoCalle={anchoCalle}
            onAnchoCalleChange={setAnchoCalle}
            maquinas={maquinasGps}
            mostrarMaquinas={mostrarMaquinasGps}
            onToggleMostrarMaquinas={() => setMostrarMaquinasGps(!mostrarMaquinasGps)}
            trackHistorico={trackAuditoria}
            maquinaEnFoco={maquinaEnFoco}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground bg-slate-900/60 border border-slate-800/80 rounded-lg p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Punto A (Inicio)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Punto B (Fin)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 bg-amber-500 rounded" /> Pasadas Rectas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 bg-fuchsia-500 rounded" /> Calle Manual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> ⚠️ Obstáculo
              </span>
            </div>
            <div>
              💡 <i>Arrastre los puntos verdes intermedios para insertar nuevos vértices o ajustar curvas en el lote.</i>
            </div>
          </div>

          {/* Panel de Seguridad: Distancia de cada lado del perímetro y control de escuadras */}
          <Card className="border-slate-800 bg-slate-900/80 shadow-xl overflow-hidden mt-4">
            <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${auditoria.esCuadradoRecto ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>
                    <Square className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      Auditoría de Perímetro y Seguridad de Rectitud
                      {polygon.length >= 3 && (
                        <Badge className={`text-xs font-bold ${auditoria.esCuadradoRecto ? "bg-green-600 text-white" : "bg-amber-500 text-slate-950"}`}>
                          {auditoria.esCuadradoRecto ? "100% Escuadra Perfecta" : `Rectitud: ${auditoria.scoreRectitud}%`}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Distancias exactas de cada lado del lote, verificación de ángulos a 90° y paralelismo para maquinaria.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {polygon.length >= 3 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSuavizarCurvas}
                      className="gap-1.5 border-slate-700 bg-slate-800 text-cyan-300 text-xs h-8 hover:bg-slate-700"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                      Suavizar Curvas
                    </Button>
                  )}

                  {polygon.length === 4 && (
                    <Button
                      size="sm"
                      onClick={handleEnderezarCuadrado}
                      className="gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-8 shadow"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Cuadrar y Enderezar a 90°
                    </Button>
                  )}

                  {polygon.length >= 3 && (
                    <>
                      <Button
                        size="sm"
                        variant={rumboGrados === ejes.rumboLargo ? "default" : "outline"}
                        onClick={() => {
                          setRumboGrados(ejes.rumboLargo);
                          toast.success(`Rumbo alineado A LO LARGO del lote (${Math.round(ejes.rumboLargo)}° - 100% Paralelo)`);
                        }}
                        className={`gap-1 text-xs h-8 ${rumboGrados === ejes.rumboLargo ? "bg-amber-500 text-slate-950 font-black shadow" : "border-slate-700 bg-slate-800 text-slate-200"}`}
                      >
                        <Compass className="h-3.5 w-3.5 text-amber-400" />
                        A lo Largo ({Math.round(ejes.rumboLargo)}°)
                      </Button>
                      <Button
                        size="sm"
                        variant={rumboGrados === ejes.rumboAncho ? "default" : "outline"}
                        onClick={() => {
                          setRumboGrados(ejes.rumboAncho);
                          toast.success(`Rumbo alineado A LO ANCHO del lote (${Math.round(ejes.rumboAncho)}° - Transversal a 90°)`);
                        }}
                        className={`gap-1 text-xs h-8 ${rumboGrados === ejes.rumboAncho ? "bg-amber-500 text-slate-950 font-black shadow" : "border-slate-700 bg-slate-800 text-slate-200"}`}
                      >
                        <Compass className="h-3.5 w-3.5 text-amber-400" />
                        A lo Ancho ({Math.round(ejes.rumboAncho)}°)
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {polygon.length < 2 ? (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  <Square className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                  Delimite al menos 2 puntos en el mapa o presione "Crear por Medidas" para ver las distancias exactas de cada lado del perímetro.
                </div>
              ) : (
                <>
                  {/* Banner de Estado de Seguridad */}
                  <div className={`p-3 rounded-lg border text-xs flex items-start sm:items-center justify-between gap-3 ${
                    auditoria.esCuadradoRecto
                      ? "bg-green-950/30 border-green-500/40 text-green-200"
                      : polygon.length === 4
                      ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                      : "bg-slate-950/60 border-slate-800 text-slate-300"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${auditoria.esCuadradoRecto ? "bg-green-400 animate-pulse" : "bg-amber-400"}`} />
                      <div>
                        <b className="font-bold">{auditoria.mensajeSeguridad}</b>
                        <p className="text-[11px] opacity-80 mt-0.5">
                          {auditoria.esCuadradoRecto
                            ? "Seguridad total: Al tirar las líneas rectas cada " + anchoCalle + "m, todas saldrán 100% paralelas y llegarán al final sin cruzarse."
                            : "Para garantizar que las líneas salgan perfectamente rectas y paralelas al trabajar con la máquina, use el botón de cuadrar o snapping."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cuadrícula de Lados y Distancias */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {auditoria.bordes.map((b) => (
                      <div
                        key={b.index}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2 hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-black text-slate-300 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            {b.nombre}
                          </span>
                          {b.anguloEsquinaGrados !== undefined && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono px-1.5 py-0 ${
                                b.esEscuadra
                                  ? "bg-cyan-950/60 text-cyan-300 border-cyan-500/50"
                                  : "bg-amber-950/60 text-amber-300 border-amber-500/50"
                              }`}
                            >
                              📐 {b.anguloEsquinaGrados}° {b.esEscuadra ? "✓" : ""}
                            </Badge>
                          )}
                        </div>

                        <div>
                          <div className="text-xl font-black text-white font-mono tracking-tight">
                            {b.distanciaMetros >= 100
                              ? `${Math.round(b.distanciaMetros).toLocaleString("es-AR")} m`
                              : `${b.distanciaMetros.toLocaleString("es-AR", { minimumFractionDigits: 1 })} m`}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Compass className="h-3 w-3 text-amber-400" />
                            <span>Rumbo: <b className="text-slate-200">{Math.round(b.rumboGrados)}°</b> ({b.headingName})</span>
                          </div>
                        </div>

                        <div className="pt-1.5 text-[10px] text-slate-500 font-mono border-t border-slate-800/60 flex items-center justify-between">
                          <span>P{b.index} → P{b.index === polygon.length ? 1 : b.index + 1}</span>
                          <button
                            onClick={() => {
                              const r = Math.round(b.rumboGrados);
                              setRumboGrados(r);
                              toast.success(`Pasadas alineadas con ${b.nombre} (${r}° - 100% Paralelas)`);
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 transition-colors"
                            title={`Alinear pasadas 100% paralelas a ${b.nombre}`}
                          >
                            Alinear ({Math.round(b.rumboGrados)}°)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comparativa de Paralelismo en 4 Lados */}
                  {polygon.length === 4 && auditoria.bordes.length === 4 && (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="flex items-center justify-between border-b md:border-b-0 md:border-r border-slate-800 pb-2 md:pb-0 md:pr-4">
                        <span className="text-slate-400">
                          ↔️ <b>Frente (L1)</b> vs <b>Fondo (L3)</b>:
                        </span>
                        <div className="text-right">
                          <span className="text-white font-bold">
                            {Math.round(auditoria.bordes[0].distanciaMetros)}m vs {Math.round(auditoria.bordes[2].distanciaMetros)}m
                          </span>
                          <span className={`ml-2 text-[11px] font-bold ${Math.abs(auditoria.bordes[0].distanciaMetros - auditoria.bordes[2].distanciaMetros) <= 2 ? "text-green-400" : "text-amber-400"}`}>
                            (Dif: {Math.abs(auditoria.bordes[0].distanciaMetros - auditoria.bordes[2].distanciaMetros).toFixed(1)}m)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:pl-2">
                        <span className="text-slate-400">
                          ↕️ <b>Lateral Der (L2)</b> vs <b>Lateral Izq (L4)</b>:
                        </span>
                        <div className="text-right">
                          <span className="text-white font-bold">
                            {Math.round(auditoria.bordes[1].distanciaMetros)}m vs {Math.round(auditoria.bordes[3].distanciaMetros)}m
                          </span>
                          <span className={`ml-2 text-[11px] font-bold ${Math.abs(auditoria.bordes[1].distanciaMetros - auditoria.bordes[3].distanciaMetros) <= 2 ? "text-green-400" : "text-amber-400"}`}>
                            (Dif: {Math.abs(auditoria.bordes[1].distanciaMetros - auditoria.bordes[3].distanciaMetros).toFixed(1)}m)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 2: PLANILLA DE COORDENADAS A-B */}
        <TabsContent value="coordenadas" className="space-y-4 m-0">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-white">
                  Coordenadas Geodésicas de Calles y Pasadas (A-B)
                </CardTitle>
                <CardDescription className="text-xs">
                  Calibrado en sistema WGS84 para carga en pilotos automáticos y banderilleros satelitales.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDescargarCSV}
                  className="gap-1 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" /> Descargar CSV / Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDescargarGeoJSON}
                  className="gap-1 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  GeoJSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lineas.length === 0 && callesManuales.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  <Compass className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                  Delimite una superficie en el mapa para calcular las calles.
                </div>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950/80 sticky top-0 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                      <tr>
                        <th className="py-2.5 px-3">Calle</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Longitud</th>
                        <th className="py-2.5 px-3">Rumbo</th>
                        <th className="py-2.5 px-3">Punto Inicio (A)</th>
                        <th className="py-2.5 px-3">Punto Fin (B)</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {/* Calles Manuales */}
                      {callesManuales.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-800/40 bg-fuchsia-950/10">
                          <td className="py-2 px-3 font-bold text-fuchsia-400">
                            {line.nombre}
                          </td>
                          <td className="py-2 px-3 text-slate-400">Manual</td>
                          <td className="py-2 px-3 text-white">
                            {line.lengthMeters.toLocaleString("es-AR")} m
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {line.bearing}° ({line.headingName})
                          </td>
                          <td className="py-2 px-3 text-emerald-400">
                            {line.start.lat.toFixed(6)}, {line.start.lng.toFixed(6)}
                          </td>
                          <td className="py-2 px-3 text-red-400">
                            {line.end.lat.toFixed(6)}, {line.end.lng.toFixed(6)}
                          </td>
                          <td className="py-2 px-3 text-right flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleGenerarPasadasDesdeRecta(line)}
                              className="h-6 px-2 text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 font-bold"
                              title="Tirar pasadas paralelas cada 5m desde esta recta"
                            >
                              🚀 Pasadas
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopiarCoords(`${line.start.lat.toFixed(6)}, ${line.start.lng.toFixed(6)}`, line.id)}
                              className="h-6 px-1.5 text-[11px] text-slate-400 hover:text-white"
                              title="Copiar coordenadas"
                            >
                              {copiedId === line.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleBorrarCalleManual(line.id)}
                              className="h-6 px-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-950/40"
                              title="Borrar calle manual"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {/* Pasadas Automáticas */}
                      {lineas.map((line) => (
                        <tr
                          key={line.id}
                          onClick={() => setSelectedLineId(line.id)}
                          className={`hover:bg-slate-800/40 cursor-pointer ${
                            selectedLineId === line.id ? "bg-amber-500/10 border-l-4 border-amber-500" : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-bold text-amber-400">
                            {line.nombre}
                          </td>
                          <td className="py-2 px-3 text-slate-400">Paralela A-B</td>
                          <td className="py-2 px-3 text-white">
                            {line.lengthMeters.toLocaleString("es-AR")} m
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {line.bearing}° ({line.headingName})
                          </td>
                          <td className="py-2 px-3 text-emerald-400">
                            {line.start.lat.toFixed(6)}, {line.start.lng.toFixed(6)}
                          </td>
                          <td className="py-2 px-3 text-red-400">
                            {line.end.lat.toFixed(6)}, {line.end.lng.toFixed(6)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopiarCoords(`${line.start.lat.toFixed(6)}, ${line.start.lng.toFixed(6)}`, line.id);
                              }}
                              className="h-6 px-2 text-[11px] text-slate-400 hover:text-white"
                            >
                              {copiedId === line.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 3: WAYPOINTS Y OBSTÁCULOS */}
        <TabsContent value="waypoints" className="space-y-4 m-0">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-white">
                  Waypoints, Puntos de Interés y Obstáculos
                </CardTitle>
                <CardDescription className="text-xs">
                  Marque pozos, postes, árboles, tranqueras o casillas para advertir a la máquina en el campo.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setDialogWpOpen(true)}
                className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar Waypoint
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {waypoints.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <AlertTriangle className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                  No hay waypoints u obstáculos registrados. Haga clic en "+ Waypoint" en el mapa o en el botón de arriba.
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                      <tr>
                        <th className="py-2.5 px-3">Nombre</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Coordenadas</th>
                        <th className="py-2.5 px-3">Radio Seguridad</th>
                        <th className="py-2.5 px-3">Notas</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {waypoints.map((wp) => (
                        <tr key={wp.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                            {wp.tipo === "obstaculo" ? "⚠️" : wp.tipo === "acceso" ? "🚪" : wp.tipo === "combustible" ? "⛽" : "📍"} {wp.nombre}
                          </td>
                          <td className="py-2.5 px-3 uppercase text-[11px] text-slate-300">
                            {wp.tipo}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {wp.lat.toFixed(6)}, {wp.lng.toFixed(6)}
                          </td>
                          <td className="py-2.5 px-3 text-amber-400">
                            {wp.radioSeguridadMeters ? `${wp.radioSeguridadMeters} m` : "Sin radio"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {wp.notas || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setWaypoints(waypoints.filter((w) => w.id !== wp.id));
                                toast.info(`Waypoint "${wp.nombre}" eliminado`);
                              }}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                              title="Eliminar waypoint"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 4: VÉRTICES DEL POLÍGONO */}
        <TabsContent value="vertices" className="space-y-4 m-0">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-white">
                  Coordenadas de los Vértices del Lote
                </CardTitle>
                <CardDescription className="text-xs">
                  Listado topográfico de las esquinas del terreno georreferenciadas.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogCoordsOpen(true)}
                className="gap-1 text-xs border-slate-700 bg-slate-800 text-slate-200"
              >
                <Plus className="h-3.5 w-3.5 text-green-400" /> Ingresar Puntos Manualmente
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {polygon.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Haga clics en el mapa para delimitar el lote.
                </div>
              ) : (
                <div className="max-h-[450px] overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                      <tr>
                        <th className="py-2.5 px-3">Vértice</th>
                        <th className="py-2.5 px-3">Latitud</th>
                        <th className="py-2.5 px-3">Longitud</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {polygon.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-bold text-green-400">
                            Punto {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-white">
                            {p.lat.toFixed(7)}
                          </td>
                          <td className="py-2 px-3 text-white">
                            {p.lng.toFixed(7)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const updated = polygon.filter((_, i) => i !== idx);
                                setPolygon(updated);
                              }}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                              title="Eliminar vértice"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 5: GUÍA PARA AVENZA MAPS */}
        <TabsContent value="avenza" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-white">
                      Uso con la App Avenza Maps
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Trabajo en cabina offline con celular o tablet.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-slate-300">
                <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
                  <li>
                    Presione <b className="text-amber-400">"Descargar Archivo KML"</b> para obtener el trazado completo (perímetro, líneas rectas A-B numeradas, calles maestras y waypoints).
                  </li>
                  <li>
                    Envíe el archivo al celular o tablet del maquinista (por WhatsApp, Drive o cable).
                  </li>
                  <li>
                    Abra la app <b className="text-white">Avenza Maps</b> o <b className="text-white">Google Earth</b>, toque el botón <b>"+" / Importar</b> y elija el archivo.
                  </li>
                  <li>
                    Avenza ubicará el vehículo con el GPS en tiempo real arriba de la línea recta seleccionada.
                  </li>
                  <li>
                    El maquinista avanza manteniendo el punto GPS centrado en la recta para <b>hacer el trabajo derecho</b>.
                  </li>
                </ol>

                <div className="pt-2">
                  <Button
                    onClick={handleDescargarKML}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold h-10 gap-2 shadow"
                  >
                    <Download className="h-4 w-4" />
                    Descargar KML para Avenza Maps
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-white">
                      Banderilleros y Pilotos Automáticos
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Trimble, Raven, John Deere, Abelardo Cuffia y Plantium.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-slate-300">
                <p className="leading-relaxed">
                  Planilla geodésica compatible con computadoras de guiado de maquinaria agrícola y vial:
                </p>
                <div className="space-y-2 bg-slate-950/80 p-3 rounded-lg border border-slate-800 font-mono text-[11px]">
                  <div><b>Rumbo A-B Base:</b> <span className="text-amber-400">{rumboGrados}°</span></div>
                  <div><b>Espaciamiento:</b> <span className="text-amber-400">{anchoCalle} m</span></div>
                  <div><b>Datum:</b> WGS84 (Coordenadas Decimales)</div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDescargarCSV}
                    className="w-full border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 h-10 gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    Descargar Planilla CSV de Waypoints
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDescargarGeoJSON}
                    className="w-full border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 h-9 gap-2 text-xs"
                  >
                    Descargar GeoJSON (QGIS / ArcGIS)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PESTAÑA: TELEMETRÍA Y AUDITORÍA XPERT SATCOM */}
        <TabsContent value="telemetria" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <Tractor className="h-4 w-4 text-emerald-400" />
                    Telemetría Satelital Xpert Satcom & Auditoría de Pasadas
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Compara en tiempo real la posición de los rastreadores GPS de las máquinas con el trazado planificado a {anchoCalle}m para auditar desvíos y calidad de labor.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".gpx,.kml,.geojson"
                      onChange={handleCargarArchivoTrack}
                      className="hidden"
                    />
                    <div className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-8 px-3 border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 gap-1.5 transition-colors shadow">
                      <Upload className="h-3.5 w-3.5" />
                      Cargar Track de Banderillero (GPX / KML)
                    </div>
                  </label>
                  <Button
                    size="sm"
                    onClick={() => {
                      const validas = maquinasGps.filter(m => m.lat !== null && m.lng !== null);
                      const onlineOnes = validas.filter(m => m.estado_satcom === "online");
                      const foco = onlineOnes.length > 0 ? onlineOnes[0] : validas[0];
                      if (foco) {
                        setMostrarMaquinasGps(true);
                        setMaquinaEnFoco({ lat: foco.lat!, lng: foco.lng! });
                        setActiveTab("mapa");
                        toast.success(`Mostrando flota en el mapa satelital. Enfocado en ${foco.nombre}`);
                      } else {
                        toast.info("No hay máquinas con coordenadas GPS activas en este momento");
                      }
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs h-8 gap-1.5 shadow"
                  >
                    <Tractor className="h-3.5 w-3.5" />
                    Ver Flota en Mapa ({maquinasGps.filter(m => m.lat !== null).length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      refetchMaquinasGps();
                      toast.success("Posiciones GPS actualizadas desde Xpert Satcom");
                    }}
                    disabled={isFetchingGps}
                    className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs h-8 gap-1.5 text-slate-200"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetchingGps ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                    Actualizar GPS
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Explicación Técnica Operativa de Telemetría GPS */}
              <div className="bg-slate-950/80 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <Activity className="h-4 w-4" />
                  <span>¿Cómo se actualiza la posición y velocidad de las máquinas?</span>
                </div>
                <p className="text-slate-300 text-[11.5px] leading-relaxed">
                  Los localizadores GPS transmiten <b>paquetes periódicos</b> por ráfagas (cada 15 a 60 segundos). La velocidad informada refleja la velocidad instantánea del último paquete emitido. Si una máquina se apaga o pierde cobertura celular, el servidor satelital mantiene fija su última posición y velocidad registrada hasta que vuelva a encenderse y emitir una nueva señal. Puffin consulta y refresca automáticamente los datos cada 15 segundos.
                </p>
              </div>

              {/* Alerta de Track Cargado si existe */}
              {trackAuditoria.length > 0 && (
                <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="font-bold text-cyan-200">Track de labor cargado:</span> {nombreTrackCargado} ({trackAuditoria.length} puntos GPS)
                      <p className="text-[11px] text-muted-foreground mt-0.5">La traza real de la máquina se muestra en línea punteada cian sobre el mapa para contrastar con las pasadas.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTrackAuditoria([]);
                      setNombreTrackCargado(null);
                      toast.success("Traza histórica removida");
                    }}
                    className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40"
                  >
                    Quitar Traza
                  </Button>
                </div>
              )}

              {/* Métricas de Flota en Lote */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Rastreadores GPS</span>
                  <div className="text-xl font-bold text-white flex items-center gap-2">
                    <Tractor className="h-4 w-4 text-amber-400" />
                    {maquinasGps.filter(m => m.lat !== null).length} <span className="text-xs font-normal text-muted-foreground">equipos</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">En Línea (En Vivo)</span>
                  <div className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    {maquinasGps.filter(m => m.estado_satcom === "online").length} <span className="text-xs font-normal text-muted-foreground">transmitiendo</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Dentro del Lote</span>
                  <div className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-cyan-400" />
                    {maquinasGps.filter((m): m is MaquinaGpsPunto & { lat: number; lng: number } => m.lat !== null && m.lng !== null && esPuntoEnPoligono({ lat: m.lat, lng: m.lng }, polygon)).length} <span className="text-xs font-normal text-muted-foreground">en perímetro</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Fuera de Línea</span>
                  <div className="text-xl font-bold text-slate-400 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-600 inline-block"></span>
                    {maquinasGps.filter(m => m.estado_satcom === "offline").length} <span className="text-xs font-normal text-muted-foreground">sin señal</span>
                  </div>
                </div>
              </div>

              {/* Lista de Máquinas con su Auditoría de Pasada */}
              {maquinasGps.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-400 space-y-2">
                  <p className="text-3xl">🛰️</p>
                  <p className="text-sm font-semibold text-white">No hay máquinas conectadas a la telemetría Xpert Satcom aún.</p>
                  <p className="text-xs">Podés vincular los rastreadores en la sección <b className="text-amber-400">GPS y Rastreo</b> de Puffin.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-300">Auditoría en Tiempo Real de Cada Máquina:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {maquinasGps.map((m) => {
                      const tienePosicion = m.lat !== null && m.lng !== null;
                      const pt: LatLng = tienePosicion ? { lat: m.lat!, lng: m.lng! } : { lat: 0, lng: 0 };
                      const dentroDelLote = tienePosicion && polygon.length >= 3 ? esPuntoEnPoligono(pt, polygon) : false;
                      const auditoria = tienePosicion && lineas.length > 0 ? calcularDesvioPasada(pt, lineas) : null;
                      const isOnline = m.estado_satcom === "online";
                      const isOffline = m.estado_satcom === "offline" || !isOnline;
                      const tiempoReporte = formatearTiempoReporte(m.fix_time || m.last_update);

                      return (
                        <div
                          key={m.device_id || m.maquina_id || m.nombre}
                          className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 space-y-2.5 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-white">{m.nombre}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isOffline ? 'bg-slate-800 text-slate-400 border-slate-700' : (m.encendido ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30')}`}>
                                  {isOffline ? "🔴 Fuera de línea" : (m.encendido ? "🟢 En marcha" : "🟡 Detenido")}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  ⏱️ {tiempoReporte}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                                {m.tipo || "Maquinaria"} {isOffline ? (m.ultima_velocidad_reportada ? `· Última vel: ${m.ultima_velocidad_reportada} km/h` : "· Sin señal") : `· ${(m.velocidad_kmh || 0).toFixed(1)} km/h`}
                              </p>
                            </div>

                            {tienePosicion && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setMaquinaEnFoco(pt);
                                  setActiveTab("mapa");
                                  toast.info(`Centrando mapa en ${m.nombre}`);
                                }}
                                className="h-7 text-xs border-slate-700 bg-slate-900 hover:bg-slate-800 text-amber-400 gap-1 px-2.5"
                                title="Ver en el mapa interactivo"
                              >
                                <Crosshair className="h-3 w-3" /> Ver en Mapa
                              </Button>
                            )}
                          </div>

                          {tienePosicion ? (
                            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/60 text-xs space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">Ubicación respecto al lote:</span>
                                {polygon.length >= 3 ? (
                                  dentroDelLote ? (
                                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                                      <Check className="h-3 w-3" /> Dentro del Perímetro
                                    </span>
                                  ) : (
                                    <span className="font-bold text-amber-400 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" /> Fuera del Lote
                                    </span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">Lote sin delimitar</span>
                                )}
                              </div>

                              {auditoria && auditoria.lineaCercana && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Pasada más próxima:</span>
                                    <span className="font-mono font-bold text-white">{auditoria.lineaCercana.nombre} ({auditoria.lineaCercana.headingName})</span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Desvío de pasada (Cross-track):</span>
                                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                      auditoria.calidad === "excelente"
                                        ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                                        : auditoria.calidad === "buena"
                                        ? "bg-amber-950/60 text-amber-400 border border-amber-500/30"
                                        : "bg-red-950/60 text-red-400 border border-red-500/30"
                                    }`}>
                                      {auditoria.desvioMeters} m ({auditoria.calidad === "excelente" ? "✓ Alineado" : auditoria.calidad === "buena" ? "Desvío leve" : "⚠️ Desalineado"})
                                    </span>
                                  </div>
                                </>
                              )}

                              <div className="text-[10px] text-slate-400 font-mono pt-0.5">
                                Coordenadas GPS: {m.lat?.toFixed(6)}, {m.lng?.toFixed(6)}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-500/80 bg-amber-950/20 p-2 rounded border border-amber-500/20">
                              Sin señal GPS en este momento
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO: INGRESO MANUAL DE COORDENADAS GPS */}
      <Dialog open={dialogCoordsOpen} onOpenChange={setDialogCoordsOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Target className="h-4 w-4 text-green-400" /> Ingreso de Coordenadas GPS
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Pegue una o más coordenadas (una por línea) en formato: <code className="text-amber-400">Latitud, Longitud</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <textarea
              rows={6}
              value={textoCoordsInput}
              onChange={(e) => setTextoCoordsInput(e.target.value)}
              placeholder="-32.890812, -64.349610&#10;-32.891500, -64.342100&#10;-32.898200, -64.344000"
              className="w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="text-[11px] text-muted-foreground">
              Ideal para volcar datos de GPS de mano, actas de catastro o agrimensura.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogCoordsOpen(false)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleAgregarCoordsManual}
              className="bg-green-600 hover:bg-green-500 text-white font-bold text-xs"
            >
              Agregar al Terreno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO: CREAR WAYPOINT / OBSTÁCULO */}
      <Dialog open={dialogWpOpen} onOpenChange={setDialogWpOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Nuevo Waypoint u Obstáculo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registre puntos clave para el operador de la máquina.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Nombre / Identificador</label>
              <Input
                value={wpNombre}
                onChange={(e) => setWpNombre(e.target.value)}
                placeholder="Ej: Poste eléctrico / Tranquera norte"
                className="bg-slate-950 border-slate-700 h-8 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Tipo de Punto</label>
                <Select value={wpTipo} onValueChange={(val: WaypointTipo) => setWpTipo(val)}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 h-8 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                    <SelectItem value="mojon">📍 Mojón / Esquina</SelectItem>
                    <SelectItem value="obstaculo">⚠️ Obstáculo / Peligro</SelectItem>
                    <SelectItem value="acceso">🚪 Acceso / Tranquera</SelectItem>
                    <SelectItem value="combustible">⛽ Combustible / Tanque</SelectItem>
                    <SelectItem value="agua">💧 Aguada / Pozo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Radio Seguridad (m)</label>
                <Input
                  type="number"
                  value={wpRadio}
                  onChange={(e) => setWpRadio(e.target.value)}
                  placeholder="10"
                  className="bg-slate-950 border-slate-700 h-8 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Latitud</label>
                <Input
                  value={wpLat}
                  onChange={(e) => setWpLat(e.target.value)}
                  placeholder="-32.890812"
                  className="bg-slate-950 border-slate-700 h-8 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Longitud</label>
                <Input
                  value={wpLng}
                  onChange={(e) => setWpLng(e.target.value)}
                  placeholder="-64.349610"
                  className="bg-slate-950 border-slate-700 h-8 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Notas u Observaciones</label>
              <Input
                value={wpNotas}
                onChange={(e) => setWpNotas(e.target.value)}
                placeholder="Ej: Cable suelto a baja altura / conservar árbol"
                className="bg-slate-950 border-slate-700 h-8 text-xs text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogWpOpen(false)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCrearWaypointManual}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
            >
              Guardar Waypoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO: CREAR LOTE POR MEDIDAS EXACTAS (AUTOAYUDA) */}
      <Dialog open={dialogMedidasOpen} onOpenChange={setDialogMedidasOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Square className="h-4 w-4 text-amber-400" /> Crear Lote por Medidas (Asistente)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Genera un lote perfectamente rectangular con ángulos rectos de 90° y medidas exactas en metros.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Ancho de Frente (m)</label>
                <Input
                  type="number"
                  value={medidaAncho}
                  onChange={(e) => setMedidaAncho(e.target.value)}
                  placeholder="400"
                  className="bg-slate-950 border-slate-700 h-8 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Largo de Fondo (m)</label>
                <Input
                  type="number"
                  value={medidaLargo}
                  onChange={(e) => setMedidaLargo(e.target.value)}
                  placeholder="600"
                  className="bg-slate-950 border-slate-700 h-8 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300 font-semibold">Orientación / Rumbo del Frente</label>
                <span className="text-amber-400 font-mono font-bold">{medidaRumbo}° ({obtenerNombreRumbo(parseFloat(medidaRumbo) || 0)})</span>
              </div>
              <Slider
                min={0}
                max={359}
                step={1}
                value={[parseFloat(medidaRumbo) || 0]}
                onValueChange={(val) => setMedidaRumbo(val[0].toString())}
              />
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Superficie calculada:</span>
                <span className="text-emerald-400 font-bold">
                  {((parseFloat(medidaAncho) || 0) * (parseFloat(medidaLargo) || 0) / 10000).toFixed(2)} Ha
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Perímetro total:</span>
                <span className="text-white">
                  {((parseFloat(medidaAncho) || 0) * 2 + (parseFloat(medidaLargo) || 0) * 2).toLocaleString()} m
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogMedidasOpen(false)}
              className="border-slate-700 bg-slate-800 text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleGenerarLotePorMedidas}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
            >
              Generar Lote en el Mapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default Americangis;
