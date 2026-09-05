import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { 
  LatLng, 
  LineSegment, 
  Waypoint, 
  calcularDistanciaMetros, 
  calcularRumboGrados, 
  obtenerNombreRumbo,
  calcularSnapInteligente,
  autoCompletarCuartoVertice,
  SnapResult,
  calcularBordesPerimetro,
  auditarRectitudLote,
  enderezarPoligonoCuadrado,
  suavizarBordesCurvos,
  calcularEjesLote,
  esPuntoEnPoligono,
  calcularDesvioPasada
} from "@/lib/gis/surface-planner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Layers, 
  Crosshair, 
  Trash2, 
  MapPin, 
  Compass, 
  Maximize2, 
  Minimize2, 
  CheckCircle2, 
  Navigation, 
  AlertTriangle, 
  Ruler, 
  Search, 
  Route, 
  Magnet, 
  Square,
  Sparkles,
  Tractor,
  Sliders,
  Check,
  RotateCcw,
  X,
  Smartphone
} from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    L: any;
    _leafletCSSLoaded?: boolean;
  }
}

function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) {
      resolve();
      return;
    }
    if (!window._leafletCSSLoaded) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      window._leafletCSSLoaded = true;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export type MapInteractionMode = 
  | "none" 
  | "draw_polygon" 
  | "draw_ab" 
  | "add_waypoint" 
  | "draw_manual_line" 
  | "measure";

export interface MaquinaGpsPunto {
  maquina_id: number | null;
  device_id: number | null;
  nombre: string;
  tipo: string;
  estado_satcom: string;
  lat: number | null;
  lng: number | null;
  velocidad_kmh: number | null;
  ultima_velocidad_reportada?: number | null;
  encendido: boolean;
  is_unlinked?: boolean;
  imagen_url?: string | null;
  proyecto_lugar?: string | null;
  fix_time?: string | null;
  last_update?: string | null;
}

export function formatearTiempoReporte(isoString?: string | null): string {
  if (!isoString) return "Sin reporte";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs)) return "Reciente";
  if (diffMs < 0) return "En vivo";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `hace ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras}h`;
  const diffDias = Math.floor(diffHoras / 24);
  const d = new Date(isoString);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `hace ${diffDias}d (${dia}/${mes})`;
}

interface TrazadorMapaProps {
  polygon: LatLng[];
  onPolygonChange: (poly: LatLng[]) => void;
  lineas: LineSegment[];
  callesManuales?: LineSegment[];
  onCallesManualesChange?: (calles: LineSegment[]) => void;
  onDeleteCalleManual?: (id: string) => void;
  onGenerarPasadasDesdeRecta?: (line: LineSegment) => void;
  waypoints?: Waypoint[];
  onWaypointsChange?: (wps: Waypoint[]) => void;
  rumboGrados: number;
  onRumboChange?: (rumbo: number) => void;
  interactionMode: MapInteractionMode;
  setInteractionMode: (mode: MapInteractionMode) => void;
  selectedLineId?: string | null;
  onSelectLine?: (id: string | null) => void;
  height?: string;
  initialCenter?: LatLng;
  anchoCalle?: number;
  onAnchoCalleChange?: (ancho: number) => void;
  maquinas?: MaquinaGpsPunto[];
  mostrarMaquinas?: boolean;
  onToggleMostrarMaquinas?: () => void;
  trackHistorico?: LatLng[];
  maquinaEnFoco?: (LatLng & { timestamp?: number }) | null;
  activeTab?: string;
  // Nuevas props para Guiado de Cabina & Secuencia de Labor
  pasadaActivaId?: string | null;
  proximaPasadaId?: string | null;
  pasadasCompletadasIds?: string[];
  ordenSecuencia?: "descendente" | "ascendente";
  onSiguientePasada?: () => void;
  onAnteriorPasada?: () => void;
  onCompletarPasada?: (id: string) => void;
  onToggleOrdenSecuencia?: () => void;
  onCentrarEnPasada?: (line: LineSegment) => void;
}

export function TrazadorMapa({
  polygon,
  onPolygonChange,
  lineas,
  callesManuales = [],
  onCallesManualesChange,
  onDeleteCalleManual,
  onGenerarPasadasDesdeRecta,
  waypoints = [],
  onWaypointsChange,
  rumboGrados,
  onRumboChange,
  interactionMode,
  setInteractionMode,
  selectedLineId,
  onSelectLine,
  height = "640px",
  initialCenter = { lat: -32.8908, lng: -64.3496 },
  anchoCalle = 5,
  onAnchoCalleChange,
  maquinas = [],
  mostrarMaquinas = true,
  onToggleMostrarMaquinas,
  trackHistorico = [],
  maquinaEnFoco = null,
  activeTab = "mapa",
  pasadaActivaId = null,
  proximaPasadaId = null,
  pasadasCompletadasIds = [],
  ordenSecuencia = "descendente",
  onSiguientePasada,
  onAnteriorPasada,
  onCompletarPasada,
  onToggleOrdenSecuencia,
  onCentrarEnPasada,
}: TrazadorMapaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const polygonLayerRef = useRef<any>(null);
  const vertexMarkersRef = useRef<any[]>([]);
  const midpointMarkersRef = useRef<any[]>([]);
  const linesLayerGroupRef = useRef<any>(null);
  const manualLinesGroupRef = useRef<any>(null);
  const waypointsGroupRef = useRef<any>(null);
  const measureLayerRef = useRef<any>(null);
  const rubberbandLayerRef = useRef<any>(null);
  const snapIndicatorRef = useRef<any>(null);
  const abMarkersRef = useRef<any[]>([]);
  const edgeLabelsGroupRef = useRef<any>(null);
  const cornerBadgesGroupRef = useRef<any>(null);
  const maquinasGroupRef = useRef<any>(null);
  const trackGroupRef = useRef<any>(null);
  const baseLayersRef = useRef<{ [key: string]: any }>({});
  
  const [activeLayer, setActiveLayer] = useState<"hybrid" | "satellite" | "streets">("hybrid");
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<LatLng | null>(null);
  const [currentSnap, setCurrentSnap] = useState<SnapResult | null>(null);
  const [snappingActivo, setSnappingActivo] = useState(true);
  const [abPoints, setAbPoints] = useState<LatLng[]>([]);
  const [manualLinePoints, setManualLinePoints] = useState<LatLng[]>([]);
  const [measurePoints, setMeasurePoints] = useState<LatLng[]>([]);
  const [measureResult, setMeasureResult] = useState<{ dist: number; bearing: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [mobileRumboModal, setMobileRumboModal] = useState(false);
  const [mobilePasoModal, setMobilePasoModal] = useState(false);
  const [mobileMenuModal, setMobileMenuModal] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const handleCentrarEnPasadaActiva = (line?: LineSegment | null) => {
    const target = line || lineas.find(l => l.id === pasadaActivaId) || lineas[0];
    if (target && mapRef.current && window.L) {
      mapRef.current.invalidateSize();
      const bounds = window.L.latLngBounds([
        [target.start.lat, target.start.lng],
        [target.end.lat, target.end.lng]
      ]);
      mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
      toast.info(`Centrando en ${target.nombre}`);
    }
  };

  const handleCentrarEnMaquina = (target?: LatLng | MaquinaGpsPunto | null) => {
    if (!mapRef.current || !window.L) return;
    const map = mapRef.current;
    map.invalidateSize();

    let pt: LatLng | null = null;
    let nombre = "Máquina Xpert Satcom";

    if (target && "lat" in target && "lng" in target && target.lat !== null && target.lng !== null) {
      pt = { lat: Number(target.lat), lng: Number(target.lng) };
      if ("nombre" in target && (target as any).nombre) {
        nombre = (target as any).nombre;
      }
    } else {
      const validas = maquinas.filter((m) => m.lat !== null && m.lng !== null);
      const onlineOne = validas.find((m) => m.estado_satcom === "online");
      const chosen = onlineOne || validas[0];
      if (chosen && chosen.lat !== null && chosen.lng !== null) {
        pt = { lat: Number(chosen.lat), lng: Number(chosen.lng) };
        nombre = chosen.nombre;
      }
    }

    if (!pt || isNaN(pt.lat) || isNaN(pt.lng)) {
      toast.info("No hay coordenadas GPS de maquinaria disponibles para enfocar.");
      return;
    }

    if (!mostrarMaquinas && onToggleMostrarMaquinas) {
      onToggleMostrarMaquinas();
    }

    map.flyTo([pt.lat, pt.lng], 16, { animate: true, duration: 0.8 });

    setTimeout(() => {
      if (maquinasGroupRef.current) {
        maquinasGroupRef.current.eachLayer((layer: any) => {
          const lpos = layer.getLatLng?.();
          if (lpos && Math.abs(lpos.lat - pt!.lat) < 0.0001 && Math.abs(lpos.lng - pt!.lng) < 0.0001) {
            layer.openPopup?.();
          }
        });
      }
    }, 400);

    toast.success(`Centrando mapa en ${nombre}`);
  };

  const auditoria = useMemo(() => auditarRectitudLote(polygon), [polygon]);
  const ejes = useMemo(() => calcularEjesLote(polygon), [polygon]);

  // Inicializar Leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    loadLeaflet().then(() => {
      const L = window.L;
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      const hybrid = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
        maxZoom: 21,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      });
      const satellite = L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        maxZoom: 21,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      });
      const streets = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      });

      hybrid.addTo(map);
      baseLayersRef.current = { hybrid, satellite, streets };

      L.control.zoom({ position: "bottomright" }).addTo(map);

      linesLayerGroupRef.current = L.layerGroup().addTo(map);
      manualLinesGroupRef.current = L.layerGroup().addTo(map);
      waypointsGroupRef.current = L.layerGroup().addTo(map);
      measureLayerRef.current = L.layerGroup().addTo(map);
      rubberbandLayerRef.current = L.layerGroup().addTo(map);
      edgeLabelsGroupRef.current = L.layerGroup().addTo(map);
      cornerBadgesGroupRef.current = L.layerGroup().addTo(map);
      maquinasGroupRef.current = L.layerGroup().addTo(map);
      trackGroupRef.current = L.layerGroup().addTo(map);

      // Movimiento del cursor con Autoayuda / Snapping Inteligente
      map.on("mousemove", (e: any) => {
        const rawPt: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        setCursorCoords(rawPt);
      });

      // Inyectar estilos para que los pins personalizados no tengan borde blanco de Leaflet
      if (!document.getElementById("custom-map-styles")) {
        const style = document.createElement("style");
        style.id = "custom-map-styles";
        style.innerHTML = `
          .custom-machine-pin, .custom-wp-icon, .custom-corner-badge {
            background: transparent !important;
            border: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      mapRef.current = map;
      setMapReady(true);

      if (polygon.length >= 3) {
        const bounds = L.latLngBounds(polygon.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Guía Elástica y Snapping Inteligente en tiempo real mientras se dibuja el lote
  useEffect(() => {
    if (!mapRef.current || !window.L || !rubberbandLayerRef.current) return;
    const L = window.L;
    const map = mapRef.current;
    const rbGroup = rubberbandLayerRef.current;
    rbGroup.clearLayers();

    if (!cursorCoords || interactionMode !== "draw_polygon" || polygon.length === 0) {
      setCurrentSnap(null);
      return;
    }

    const lastPt = polygon[polygon.length - 1];
    const snap = calcularSnapInteligente(cursorCoords, polygon, snappingActivo);
    setCurrentSnap(snap);

    const targetPt = snap.isSnapped ? snap.snappedPt : cursorCoords;
    const dist = Math.round(calcularDistanciaMetros(lastPt, targetPt));
    const brng = Math.round(calcularRumboGrados(lastPt, targetPt));

    // Línea guía elástica
    const guideLine = L.polyline(
      [
        [lastPt.lat, lastPt.lng],
        [targetPt.lat, targetPt.lng],
      ],
      {
        color: snap.isSnapped ? (snap.tipo === "escuadra_90" ? "#06b6d4" : "#22c55e") : "#f59e0b",
        weight: snap.isSnapped ? 3.5 : 2,
        dashArray: "6, 6",
      }
    );

    // Indicador visual de snap
    let snapHtml = `📏 ${dist}m | 🧭 ${brng}°`;
    if (snap.isSnapped) {
      snapHtml += `<br/><b style="color:${snap.tipo === "escuadra_90" ? "#38bdf8" : "#4ade80"}">${snap.label}</b>`;
    }

    const midLat = (lastPt.lat + targetPt.lat) / 2;
    const midLng = (lastPt.lng + targetPt.lng) / 2;

    const tooltip = L.tooltip({
      permanent: true,
      direction: "top",
      className: "bg-slate-900/95 text-white border border-slate-700 text-xs px-2 py-1 rounded shadow-xl font-mono",
    })
      .setLatLng([midLat, midLng])
      .setContent(snapHtml);

    rbGroup.addLayer(guideLine);
    rbGroup.addLayer(tooltip);

    if (snap.isSnapped) {
      const snapMarker = L.circleMarker([targetPt.lat, targetPt.lng], {
        radius: 7,
        fillColor: snap.tipo === "escuadra_90" ? "#06b6d4" : "#22c55e",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.9,
      });
      rbGroup.addLayer(snapMarker);
    }
  }, [cursorCoords, interactionMode, polygon, snappingActivo]);

  // Cambiar capa
  const handleLayerChange = (layer: "hybrid" | "satellite" | "streets") => {
    if (!mapRef.current) return;
    const current = baseLayersRef.current[activeLayer];
    const next = baseLayersRef.current[layer];
    if (current) mapRef.current.removeLayer(current);
    if (next) mapRef.current.addLayer(next);
    setActiveLayer(layer);
  };

  // Buscar ubicación
  const handleBuscar = () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    const L = window.L;
    const match = searchQuery.match(/^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        mapRef.current.flyTo([lat, lng], 16, { animate: true });
        L.popup()
          .setLatLng([lat, lng])
          .setContent(`<div class="text-xs font-mono"><b>Coordenadas:</b><br/>${lat.toFixed(6)}, ${lng.toFixed(6)}</div>`)
          .openOn(mapRef.current);
        return;
      }
    }

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          mapRef.current.flyTo([lat, lon], 14, { animate: true });
        }
      })
      .catch(() => {});
  };

  // Auto-completar el 4to vértice para un lote perfectamente rectangular
  const handleAutoCompletarRectangulo = () => {
    if (polygon.length !== 3) return;
    const cuarto = autoCompletarCuartoVertice(polygon[0], polygon[1], polygon[2]);
    onPolygonChange([...polygon, cuarto]);
    setInteractionMode("none");
    toast.success("¡4to vértice completado! Lote cerrado en geometría exacta.");
  };

  // Manejo de clics en el mapa con autoayuda / snapping
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const handleMapClick = (e: any) => {
      let clickPt: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };

      if (interactionMode === "draw_polygon") {
        // Usar punto con snap si la autoayuda está activa
        if (snappingActivo && polygon.length > 0) {
          const snap = calcularSnapInteligente(clickPt, polygon, true);
          if (snap.isSnapped) {
            clickPt = snap.snappedPt;
            // Si el snap fue al inicio, cerramos el lote
            if (snap.tipo === "vertice" && snap.snappedPt.lat === polygon[0].lat && snap.snappedPt.lng === polygon[0].lng) {
              setInteractionMode("none");
              toast.success("Lote delimitado y cerrado correctamente");
              return;
            }
          }
        }

        const newPoly = [...polygon, clickPt];
        onPolygonChange(newPoly);
      } else if (interactionMode === "draw_ab") {
        if (abPoints.length === 0) {
          setAbPoints([clickPt]);
        } else if (abPoints.length === 1) {
          const ptA = abPoints[0];
          const ptB = clickPt;
          setAbPoints([ptA, ptB]);
          const brng = calcularRumboGrados(ptA, ptB);
          if (onRumboChange) onRumboChange(Math.round(brng * 10) / 10);
          setInteractionMode("none");
          setAbPoints([]);
        }
      } else if (interactionMode === "add_waypoint") {
        if (onWaypointsChange) {
          const nuevoWp: Waypoint = {
            id: `wp-${Date.now()}`,
            nombre: `Punto ${waypoints.length + 1}`,
            tipo: "mojon",
            lat: clickPt.lat,
            lng: clickPt.lng,
          };
          onWaypointsChange([...waypoints, nuevoWp]);
          toast.success("Punto agregado en el terreno");
        }
        setInteractionMode("none");
      } else if (interactionMode === "draw_manual_line") {
        if (manualLinePoints.length === 0) {
          setManualLinePoints([clickPt]);
        } else {
          const start = manualLinePoints[0];
          const end = clickPt;
          const lengthMeters = Math.round(calcularDistanciaMetros(start, end) * 10) / 10;
          const bearing = Math.round(calcularRumboGrados(start, end) * 10) / 10;
          const nuevaCalle: LineSegment = {
            id: `manual-${Date.now()}`,
            index: (callesManuales?.length || 0) + 1,
            nombre: `Calle Maestra ${String((callesManuales?.length || 0) + 1).padStart(2, "0")}`,
            start,
            end,
            lengthMeters,
            bearing,
            headingName: obtenerNombreRumbo(bearing),
            tipo: "calle_manual",
          };
          if (onCallesManualesChange) {
            onCallesManualesChange([...callesManuales, nuevaCalle]);
            toast.success("Calle manual trazada");
          }
          setManualLinePoints([]);
          setInteractionMode("none");
        }
      } else if (interactionMode === "measure") {
        if (measurePoints.length === 0) {
          setMeasurePoints([clickPt]);
          setMeasureResult(null);
        } else {
          const p1 = measurePoints[0];
          const p2 = clickPt;
          const dist = calcularDistanciaMetros(p1, p2);
          const bearing = calcularRumboGrados(p1, p2);
          setMeasurePoints([p1, p2]);
          setMeasureResult({ dist, bearing });
        }
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [
    interactionMode, 
    polygon, 
    abPoints, 
    manualLinePoints, 
    measurePoints, 
    waypoints, 
    callesManuales, 
    snappingActivo,
    onPolygonChange, 
    onRumboChange, 
    onWaypointsChange, 
    onCallesManualesChange, 
    setInteractionMode
  ]);

  // Actualizar visualización del Polígono, Vértices y Puntos Medios
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;

    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }

    vertexMarkersRef.current.forEach((m) => map.removeLayer(m));
    vertexMarkersRef.current = [];

    midpointMarkersRef.current.forEach((m) => map.removeLayer(m));
    midpointMarkersRef.current = [];

    if (edgeLabelsGroupRef.current) {
      edgeLabelsGroupRef.current.clearLayers();
    }
    if (cornerBadgesGroupRef.current) {
      cornerBadgesGroupRef.current.clearLayers();
    }

    if (polygon.length === 0) return;

    const latLngs = polygon.map((p) => [p.lat, p.lng]);
    if (polygon.length >= 3) {
      polygonLayerRef.current = L.polygon(latLngs, {
        color: "#22c55e",
        weight: 3.5,
        opacity: 0.95,
        fillColor: "#22c55e",
        fillOpacity: 0.16,
        dashArray: interactionMode === "draw_polygon" ? "6, 6" : undefined,
      }).addTo(map);
    } else if (polygon.length === 2) {
      polygonLayerRef.current = L.polyline(latLngs, {
        color: "#22c55e",
        weight: 3,
        dashArray: "6, 6",
      }).addTo(map);
    }

    polygon.forEach((p, idx) => {
      const isStart = idx === 0;
      const markerHtml = `
        <div style="
          width: 24px; 
          height: 24px; 
          background-color: ${isStart ? "#16a34a" : "#ffffff"}; 
          border: 3px solid ${isStart ? "#ffffff" : "#16a34a"}; 
          border-radius: 50%; 
          box-shadow: 0 0 10px rgba(0,0,0,0.7);
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 11px; 
          font-weight: 800; 
          color: ${isStart ? "#ffffff" : "#16a34a"};
          cursor: grab;
        ">
          ${idx + 1}
        </div>
      `;

      const icon = L.divIcon({
        className: "custom-vertex-icon",
        html: markerHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([p.lat, p.lng], {
        icon,
        draggable: interactionMode !== "draw_polygon",
      }).addTo(map);

      marker.on("dragend", (e: any) => {
        const newPos = e.target.getLatLng();
        const updated = [...polygon];
        updated[idx] = { lat: newPos.lat, lng: newPos.lng };
        onPolygonChange(updated);
      });

      if (interactionMode !== "draw_polygon") {
        const popupContent = document.createElement("div");
        popupContent.style.fontSize = "12px";
        popupContent.style.padding = "4px";
        popupContent.innerHTML = `
          <div style="font-weight:bold;margin-bottom:4px;color:#1e293b;">Vértice ${idx + 1}</div>
          <div style="font-family:monospace;margin-bottom:6px;">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
          <button id="del-vertex-${idx}" style="background:#ef4444;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;width:100%;">
            🗑️ Eliminar Vértice
          </button>
        `;

        marker.bindPopup(popupContent);
        marker.on("popupopen", () => {
          const btn = document.getElementById(`del-vertex-${idx}`);
          if (btn) {
            btn.onclick = () => {
              const updated = polygon.filter((_, i) => i !== idx);
              onPolygonChange(updated);
              map.closePopup();
            };
          }
        });
      }

      vertexMarkersRef.current.push(marker);

      // Puntos medios para insertar vértices nuevos
      if (polygon.length >= 3 && interactionMode !== "draw_polygon") {
        const nextIdx = (idx + 1) % polygon.length;
        const nextP = polygon[nextIdx];
        const midLat = (p.lat + nextP.lat) / 2;
        const midLng = (p.lng + nextP.lng) / 2;
        const distBorde = Math.round(calcularDistanciaMetros(p, nextP));

        const midIcon = L.divIcon({
          className: "custom-midpoint-icon",
          html: `<div style="width:12px;height:12px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5);cursor:pointer;" title="Arrastrar para insertar vértice (${distBorde}m)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const midMarker = L.marker([midLat, midLng], {
          icon: midIcon,
          draggable: true,
        }).addTo(map);

        midMarker.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          const updated = [...polygon];
          updated.splice(idx + 1, 0, { lat: pos.lat, lng: pos.lng });
          onPolygonChange(updated);
        });

        midpointMarkersRef.current.push(midMarker);
      }
    });

    // Renderizar Etiquetas Permanentes de Distancia y Rumbo en cada Lado del Perímetro
    if (polygon.length >= 2) {
      const bordes = calcularBordesPerimetro(polygon);
      bordes.forEach((borde) => {
        // Punto medio del lado
        const midLat = (borde.from.lat + borde.to.lat) / 2;
        const midLng = (borde.from.lng + borde.to.lng) / 2;
        const distText = borde.distanciaMetros >= 100 
          ? `${Math.round(borde.distanciaMetros).toLocaleString("es-AR")} m` 
          : `${borde.distanciaMetros.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;

        const labelHtml = `
          <div style="
            background: rgba(15, 23, 42, 0.94);
            border: 1.5px solid #22c55e;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.75), 0 0 10px rgba(34, 197, 94, 0.35);
            color: #ffffff;
            padding: 3px 8px;
            border-radius: 6px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
            pointer-events: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transform: translate(-50%, -50%);
          ">
            <span style="color: #4ade80; font-size: 10px; font-weight: 900;">L${borde.index}:</span>
            <span style="color: #ffffff; font-weight: 900; font-size: 12px;">${distText}</span>
            <span style="color: #94a3b8; font-size: 10px; font-weight: 600;">(${Math.round(borde.rumboGrados)}° ${borde.headingName})</span>
          </div>
        `;

        const labelIcon = L.divIcon({
          className: "custom-edge-dist-label",
          html: labelHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const edgeMarker = L.marker([midLat, midLng], {
          icon: labelIcon,
          interactive: false,
        });

        edgeLabelsGroupRef.current?.addLayer(edgeMarker);

        // Ángulo de esquina si está delimitado (polygon.length >= 3)
        if (borde.anguloEsquinaGrados !== undefined && polygon.length >= 3) {
          const isEscuadra = borde.esEscuadra === true;
          const cornerHtml = `
            <div style="
              background: ${isEscuadra ? "rgba(6, 182, 212, 0.95)" : "rgba(245, 158, 11, 0.95)"};
              color: #0f172a;
              border: 1.5px solid #ffffff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.6);
              padding: 1.5px 6px;
              border-radius: 4px;
              font-family: ui-monospace, monospace;
              font-size: 10.5px;
              font-weight: 900;
              white-space: nowrap;
              pointer-events: none;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              transform: translate(-50%, -180%);
            ">
              <span>📐 ${borde.anguloEsquinaGrados.toFixed(1)}°</span>
              ${isEscuadra ? '<span style="font-weight:900;">✓</span>' : ""}
            </div>
          `;

          const cornerIcon = L.divIcon({
            className: "custom-corner-badge",
            html: cornerHtml,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const cornerMarker = L.marker([borde.from.lat, borde.from.lng], {
            icon: cornerIcon,
            interactive: false,
          });

          cornerBadgesGroupRef.current?.addLayer(cornerMarker);
        }
      });
    }
  }, [polygon, interactionMode, onPolygonChange]);

  // Renderizar Pasadas Automáticas con Guiado de Cabina
  useEffect(() => {
    if (!linesLayerGroupRef.current || !window.L) return;
    const L = window.L;
    const group = linesLayerGroupRef.current;
    group.clearLayers();

    lineas.forEach((line) => {
      const isActiva = pasadaActivaId ? pasadaActivaId === line.id : selectedLineId === line.id;
      const isProxima = proximaPasadaId === line.id;
      const isCompletada = pasadasCompletadasIds?.includes(line.id);

      const latLngs = [
        [line.start.lat, line.start.lng],
        [line.end.lat, line.end.lng],
      ];

      let outlineWeight = 5;
      let strokeColor = "#f59e0b"; // Naranja ámbar estándar
      let strokeWeight = 3.5;
      let opacity = 0.9;
      let dashArray: string | undefined = undefined;

      if (isActiva) {
        strokeColor = "#00ff66"; // Verde neón activo
        strokeWeight = 6.5;
        outlineWeight = 11;
        opacity = 1;
      } else if (isProxima) {
        strokeColor = "#38bdf8"; // Cian próxima
        strokeWeight = 4.5;
        outlineWeight = 7.5;
        opacity = 1;
      } else if (isCompletada) {
        strokeColor = "#15803d"; // Verde tenue completada
        strokeWeight = 2.5;
        outlineWeight = 4;
        dashArray = "6, 6";
        opacity = 0.7;
      }

      const outline = L.polyline(latLngs, {
        color: "#000000",
        weight: outlineWeight,
        opacity: 0.8,
      });

      const polyline = L.polyline(latLngs, {
        color: strokeColor,
        weight: strokeWeight,
        opacity,
        dashArray,
      });

      const markerA = L.circleMarker([line.start.lat, line.start.lng], {
        radius: isActiva ? 6 : 3.5,
        fillColor: "#22c55e",
        color: "#ffffff",
        weight: isActiva ? 2.5 : 1.5,
        fillOpacity: 1,
      });

      const markerB = L.circleMarker([line.end.lat, line.end.lng], {
        radius: isActiva ? 6 : 3.5,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: isActiva ? 2.5 : 1.5,
        fillOpacity: 1,
      });

      // Cartel flotante en el centro de la pasada activa o próxima
      const midLat = (line.start.lat + line.end.lat) / 2;
      const midLng = (line.start.lng + line.end.lng) / 2;

      if (isActiva) {
        const activeHtml = `
          <div style="
            background: #0f172a;
            border: 2px solid #22c55e;
            color: #ffffff;
            box-shadow: 0 0 16px #22c55e, 0 4px 12px rgba(0,0,0,0.8);
            border-radius: 6px;
            padding: 2.5px 8px;
            font-size: 11px;
            font-weight: 900;
            font-family: ui-monospace, monospace;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transform: translate(-50%, -50%);
            pointer-events: none;
          ">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;"></span>
            <span style="color:#4ade80;">🎯 ${line.nombre}</span>
            <span style="color:#94a3b8;font-size:9.5px;">${line.lengthMeters}m · ${line.bearing}° ${line.headingName}</span>
          </div>
        `;
        const activeIcon = L.divIcon({
          className: "custom-active-line-badge",
          html: activeHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const badgeMarker = L.marker([midLat, midLng], { icon: activeIcon, interactive: false, zIndexOffset: 2500 });
        group.addLayer(badgeMarker);
      } else if (isProxima) {
        const proxHtml = `
          <div style="
            background: #0f172a;
            border: 1.5px solid #38bdf8;
            color: #ffffff;
            box-shadow: 0 0 10px rgba(56,189,248,0.7);
            border-radius: 5px;
            padding: 1.5px 6px;
            font-size: 10px;
            font-weight: 800;
            font-family: ui-monospace, monospace;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transform: translate(-50%, -50%);
            pointer-events: none;
          ">
            <span style="color:#38bdf8;">➡️ Próxima: ${line.nombre}</span>
          </div>
        `;
        const proxIcon = L.divIcon({
          className: "custom-prox-line-badge",
          html: proxHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const proxMarker = L.marker([midLat, midLng], { icon: proxIcon, interactive: false, zIndexOffset: 1500 });
        group.addLayer(proxMarker);
      } else if (isCompletada) {
        const compHtml = `
          <div style="
            background: rgba(21, 128, 61, 0.9);
            color: #ffffff;
            border-radius: 4px;
            padding: 1px 5px;
            font-size: 9px;
            font-weight: 800;
            font-family: ui-monospace, monospace;
            white-space: nowrap;
            transform: translate(-50%, -50%);
            pointer-events: none;
          ">
            <span>✓ ${line.nombre}</span>
          </div>
        `;
        const compIcon = L.divIcon({
          className: "custom-comp-line-badge",
          html: compHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const compMarker = L.marker([midLat, midLng], { icon: compIcon, interactive: false, zIndexOffset: 1000 });
        group.addLayer(compMarker);
      }

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; min-width: 220px; padding: 4px;">
          <div style="font-weight: bold; font-size: 14px; color: #1e293b; border-bottom: 2px solid ${isActiva ? '#22c55e' : '#f59e0b'}; padding-bottom: 4px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span>🚜 ${line.nombre}</span>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isActiva ? '#dcfce7; color: #166534;' : isCompletada ? '#f1f5f9; color: #475569;' : '#fef3c7; color: #92400e;'}">
              ${isActiva ? '🎯 Pasada Actual' : isCompletada ? '✓ Completada' : 'Pendiente'}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;">
            <div><span style="color: #64748b;">Longitud:</span> <b>${line.lengthMeters.toLocaleString("es-AR")} m</b></div>
            <div><span style="color: #64748b;">Rumbo:</span> <b>${line.bearing}° (${line.headingName})</b></div>
          </div>
          <div style="font-size: 11px; background: #f1f5f9; padding: 6px; border-radius: 4px; margin-bottom: 6px;">
            <div><b>Inicio (A):</b> ${line.start.lat.toFixed(6)}, ${line.start.lng.toFixed(6)}</div>
            <div><b>Fin (B):</b> ${line.end.lat.toFixed(6)}, ${line.end.lng.toFixed(6)}</div>
          </div>
        </div>
      `;

      polyline.bindPopup(popupContent);
      polyline.on("click", () => {
        if (onSelectLine) onSelectLine(line.id);
      });

      group.addLayer(outline);
      group.addLayer(polyline);
      group.addLayer(markerA);
      group.addLayer(markerB);
    });
  }, [lineas, selectedLineId, pasadaActivaId, proximaPasadaId, pasadasCompletadasIds, onSelectLine]);

  // Renderizar Calles Manuales con acciones de borrado y generación de pasadas paralelas
  useEffect(() => {
    if (!manualLinesGroupRef.current || !window.L || !mapRef.current) return;
    const L = window.L;
    const map = mapRef.current;
    const group = manualLinesGroupRef.current;
    group.clearLayers();

    callesManuales.forEach((line) => {
      const latLngs = [
        [line.start.lat, line.start.lng],
        [line.end.lat, line.end.lng],
      ];

      const polyline = L.polyline(latLngs, {
        color: "#d946ef",
        weight: 5.5,
        opacity: 0.95,
      });

      const popupDiv = document.createElement("div");
      popupDiv.style.fontSize = "12px";
      popupDiv.style.minWidth = "220px";
      popupDiv.style.padding = "4px";
      popupDiv.innerHTML = `
        <div style="font-weight:bold;font-size:14px;color:#d946ef;margin-bottom:4px;">🛣️ ${line.nombre}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-family:sans-serif;">
          <span>Longitud: <b>${line.lengthMeters} m</b></span>
          <span>Rumbo: <b>${line.bearing}° (${line.headingName})</b></span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <button id="gen-grid-${line.id}" style="background:#f59e0b;color:#0f172a;border:none;padding:6px 8px;border-radius:4px;font-weight:bold;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
            🚀 Tirar líneas rectas cada 5m desde esta calle
          </button>
          <button id="del-man-${line.id}" style="background:#ef4444;color:white;border:none;padding:5px 8px;border-radius:4px;font-weight:bold;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
            🗑️ Eliminar esta Calle
          </button>
        </div>
      `;

      polyline.bindPopup(popupDiv);
      polyline.on("popupopen", () => {
        const btnDel = document.getElementById(`del-man-${line.id}`);
        if (btnDel) {
          btnDel.onclick = () => {
            if (onDeleteCalleManual) onDeleteCalleManual(line.id);
            map.closePopup();
          };
        }
        const btnGen = document.getElementById(`gen-grid-${line.id}`);
        if (btnGen) {
          btnGen.onclick = () => {
            if (onGenerarPasadasDesdeRecta) onGenerarPasadasDesdeRecta(line);
            map.closePopup();
          };
        }
      });

      group.addLayer(polyline);
    });
  }, [callesManuales, onDeleteCalleManual, onGenerarPasadasDesdeRecta]);

  // Renderizar Waypoints con Radios de Seguridad
  useEffect(() => {
    if (!waypointsGroupRef.current || !window.L) return;
    const L = window.L;
    const group = waypointsGroupRef.current;
    group.clearLayers();

    waypoints.forEach((wp) => {
      let iconColor = "#3b82f6";
      let iconEmoji = "📍";
      if (wp.tipo === "obstaculo") {
        iconColor = "#ef4444";
        iconEmoji = "⚠️";
      } else if (wp.tipo === "acceso") {
        iconColor = "#10b981";
        iconEmoji = "🚪";
      } else if (wp.tipo === "combustible") {
        iconColor = "#f97316";
        iconEmoji = "⛽";
      } else if (wp.tipo === "agua") {
        iconColor = "#06b6d4";
        iconEmoji = "💧";
      }

      if (wp.radioSeguridadMeters && wp.radioSeguridadMeters > 0) {
        const circle = L.circle([wp.lat, wp.lng], {
          radius: wp.radioSeguridadMeters,
          color: iconColor,
          fillColor: iconColor,
          fillOpacity: 0.2,
          weight: 2,
          dashArray: "4, 4",
        });
        group.addLayer(circle);
      }

      const icon = L.divIcon({
        className: "custom-wp-icon",
        html: `
          <div style="
            background:${iconColor};
            color:white;
            width:30px;
            height:30px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            border:2px solid white;
            box-shadow:0 0 10px rgba(0,0,0,0.8);
            font-size:14px;
            cursor:pointer;
          ">
            ${iconEmoji}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([wp.lat, wp.lng], { icon });
      marker.bindPopup(`
        <div style="font-size:12px;min-width:160px;padding:4px;">
          <b style="color:${iconColor};font-size:13px;">${iconEmoji} ${wp.nombre}</b><br/>
          <span style="text-transform:uppercase;font-size:10px;color:#64748b;">${wp.tipo}</span><br/>
          <span style="font-family:monospace;">${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)}</span>
          ${wp.radioSeguridadMeters ? `<br/><b>Radio:</b> ${wp.radioSeguridadMeters}m` : ""}
          ${wp.notas ? `<br/><i>${wp.notas}</i>` : ""}
        </div>
      `);

      group.addLayer(marker);
    });
  }, [waypoints]);

  // Herramienta de Medición
  useEffect(() => {
    if (!measureLayerRef.current || !window.L) return;
    const L = window.L;
    const group = measureLayerRef.current;
    group.clearLayers();

    if (measurePoints.length === 2 && measureResult) {
      const line = L.polyline(
        [
          [measurePoints[0].lat, measurePoints[0].lng],
          [measurePoints[1].lat, measurePoints[1].lng],
        ],
        { color: "#38bdf8", weight: 3, dashArray: "5, 5" }
      );

      const midLat = (measurePoints[0].lat + measurePoints[1].lat) / 2;
      const midLng = (measurePoints[0].lng + measurePoints[1].lng) / 2;

      const tooltip = L.tooltip({ permanent: true, direction: "center", className: "bg-slate-900 text-cyan-400 font-mono font-bold text-xs px-2 py-1 rounded shadow" })
        .setLatLng([midLat, midLng])
        .setContent(`📏 ${Math.round(measureResult.dist)} m | 🧭 ${Math.round(measureResult.bearing)}°`);

      group.addLayer(line);
      group.addLayer(tooltip);
    }
  }, [measurePoints, measureResult]);

  // Marcadores temporales A-B
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;

    abMarkersRef.current.forEach((m) => map.removeLayer(m));
    abMarkersRef.current = [];

    if (interactionMode === "draw_ab" && abPoints.length === 1) {
      const pA = abPoints[0];
      const marker = L.circleMarker([pA.lat, pA.lng], {
        radius: 7,
        fillColor: "#22c55e",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);
      abMarkersRef.current.push(marker);
    }
  }, [interactionMode, abPoints]);

  // Enfocar mapa en máquina seleccionada con reintentos para asegurar renderizado en cambio de tabs
  useEffect(() => {
    if (!mapRef.current || !maquinaEnFoco || !window.L) return undefined;
    const map = mapRef.current;

    const ejecutarEnfoque = () => {
      if (!map) return;
      map.invalidateSize();
      const lat = Number(maquinaEnFoco.lat);
      const lng = Number(maquinaEnFoco.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      map.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });

      // Abrir el popup del marcador si está creado
      if (maquinasGroupRef.current) {
        maquinasGroupRef.current.eachLayer((layer: any) => {
          const lpos = layer.getLatLng?.();
          if (lpos && Math.abs(lpos.lat - lat) < 0.0001 && Math.abs(lpos.lng - lng) < 0.0001) {
            layer.openPopup?.();
          }
        });
      }
    };

    // Reintentos automáticos para sincronizar con transiciones de pestañas
    ejecutarEnfoque();
    const t1 = setTimeout(ejecutarEnfoque, 120);
    const t2 = setTimeout(ejecutarEnfoque, 350);
    const t3 = setTimeout(ejecutarEnfoque, 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [maquinaEnFoco]);

  // Invalidar tamaño cuando la pestaña activa pasa a ser 'mapa'
  useEffect(() => {
    if (activeTab === "mapa" && mapRef.current) {
      const map = mapRef.current;
      map.invalidateSize();
      const t = setTimeout(() => {
        map.invalidateSize();
      }, 150);
      return () => {
        clearTimeout(t);
      };
    }
    return undefined;
  }, [activeTab]);

  // Renderizar Máquinas con Telemetría GPS Xpert Satcom
  useEffect(() => {
    if (!mapReady || !mapRef.current || !maquinasGroupRef.current || !window.L) return;
    const L = window.L;
    const group = maquinasGroupRef.current;
    group.clearLayers();

    if (!mostrarMaquinas || !maquinas || maquinas.length === 0) return;

    maquinas.forEach((m) => {
      if (m.lat === null || m.lng === null) return;
      const pt: LatLng = { lat: m.lat, lng: m.lng };
      const tieneLote = polygon.length >= 3;
      const dentroDelLote = tieneLote ? esPuntoEnPoligono(pt, polygon) : false;
      const auditoria = lineas.length > 0 ? calcularDesvioPasada(pt, lineas) : { lineaCercana: null, desvioMeters: 0, estaAlineado: true, calidad: "excelente" as const };

      const isOnline = m.estado_satcom === "online";
      const isOffline = m.estado_satcom === "offline" || !isOnline;
      const statusColor = isOffline ? "#64748b" : (m.encendido ? "#22c55e" : "#f59e0b");
      const tiempoReporte = formatearTiempoReporte(m.fix_time || m.last_update);
      const velDisplay = m.velocidad_kmh !== null ? m.velocidad_kmh : 0;

      const iconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 150px; margin-left: -75px; margin-top: -55px; pointer-events: auto; cursor: pointer;">
          <!-- Etiqueta superior: Nombre y estado de conexión -->
          <div style="
            background: rgba(15, 23, 42, 0.95);
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
            border: 1.5px solid ${statusColor};
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0,0,0,0.7);
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor};"></span>
            <span>🚜 ${m.nombre}</span>
            <span style="font-size: 9px; font-weight: 600; opacity: 0.8; color: ${isOffline ? '#94a3b8' : '#86efac'};">(${tiempoReporte})</span>
          </div>

          <!-- Ícono central de tractor con Pin -->
          <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
            <div style="
              width: 36px;
              height: 36px;
              background: #0f172a;
              border: 3px solid ${statusColor};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 15px ${statusColor}, inset 0 0 8px rgba(0,0,0,0.8);
              font-size: 18px;
            ">
              🚜
            </div>
            <div style="
              position: absolute;
              bottom: -6px;
              left: 50%;
              transform: translateX(-50%);
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 7px solid ${statusColor};
            "></div>
          </div>

          <!-- Badge inferior: Velocidad y Estado Operativo -->
          <div style="
            margin-top: 6px;
            background: ${isOffline ? "rgba(51, 65, 85, 0.95)" : (tieneLote ? (dentroDelLote ? (auditoria.estaAlineado ? "rgba(21, 128, 61, 0.95)" : "rgba(180, 83, 9, 0.95)") : "rgba(185, 28, 28, 0.95)") : (m.encendido ? "rgba(21, 128, 61, 0.95)" : "rgba(30, 41, 59, 0.95)"))};
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            font-family: monospace;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.6);
            border: 1px solid rgba(255,255,255,0.2);
          ">
            ${isOffline 
              ? `🔴 Offline · ${m.ultima_velocidad_reportada ? `Últ. ${m.ultima_velocidad_reportada} km/h` : "Sin señal"}`
              : `${velDisplay.toFixed(0)} km/h${tieneLote ? ` · ${dentroDelLote ? (auditoria.lineaCercana ? `±${auditoria.desvioMeters}m` : "En Eje") : "Fuera Lote"}` : (m.encendido ? " · En Marcha" : " · Detenido")}`
            }
          </div>
        </div>
      `;

      const divIcon = L.divIcon({
        className: "custom-machine-pin",
        html: iconHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([m.lat, m.lng], { icon: divIcon, zIndexOffset: 1000 });

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; min-width: 250px; padding: 4px; color: #1e293b;">
          <div style="font-weight: 900; font-size: 14px; border-bottom: 2px solid ${statusColor}; padding-bottom: 4px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span>🚜 ${m.nombre}</span>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isOffline ? '#f1f5f9; color: #475569;' : (m.encendido ? '#dcfce7; color: #166534;' : '#fef3c7; color: #92400e;')}">
              ${isOffline ? '🔴 Fuera de Línea' : (m.encendido ? '🟢 En Marcha' : '🟡 Detenido')}
            </span>
          </div>
          <div style="display: grid; gap: 5px; font-size: 11px;">
            <div><b>Tipo:</b> ${m.tipo || "Maquinaria"}</div>
            <div><b>Conexión Satelital:</b> ${isOnline ? '🟢 En Línea (Transmitiendo en vivo)' : '🔴 Desconectado / Sin señal'}</div>
            <div><b>Último Reporte GPS:</b> <span style="font-weight: bold; color: ${isOffline ? '#dc2626' : '#166534'};">${tiempoReporte}</span></div>
            <div><b>Velocidad Actual:</b> <b>${velDisplay.toFixed(1)} km/h</b>${isOffline && m.ultima_velocidad_reportada ? ` <span style="color:#64748b;">(Último registro antes de desconectar: ${m.ultima_velocidad_reportada} km/h)</span>` : ''}</div>
            <div><b>Coordenadas:</b> ${m.lat.toFixed(6)}, ${m.lng.toFixed(6)}</div>
            ${m.proyecto_lugar ? `<div><b>Proyecto asignado:</b> ${m.proyecto_lugar}</div>` : ''}

            ${isOffline ? `
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 6px; color: #991b1b; font-size: 10.5px; line-height: 1.35; margin-top: 4px;">
                ⚠️ <b>Por qué no se mueve el icono:</b> Este rastreador GPS está apagado o fuera de cobertura. La posición y velocidad de <b>${m.ultima_velocidad_reportada || 0} km/h</b> corresponden al último instante en que transmitió datos (${tiempoReporte}). Hasta que la máquina no se encienda y envíe un nuevo paquete GPS, el marcador se mantiene estático en su última ubicación.
              </div>
            ` : `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 5px 7px; color: #166534; font-size: 10.5px; margin-top: 4px;">
                🔄 <b>Actualización en vivo:</b> El mapa consulta nuevas coordenadas cada 15 segundos.
              </div>
            `}

            <div style="border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 4px;">
              <b>Auditoría en Lote:</b>
              <div style="margin-top: 2px;">
                ${tieneLote ? (
                  dentroDelLote ? `
                    <span style="color: #166534; font-weight: bold;">📍 Dentro del perímetro delimitado</span><br/>
                    ${auditoria.lineaCercana ? `
                      <b>Pasada más cercana:</b> ${auditoria.lineaCercana.nombre}<br/>
                      <b>Desvío del eje:</b> <span style="color: ${auditoria.calidad === 'excelente' ? '#166534' : auditoria.calidad === 'buena' ? '#ca8a04' : '#dc2626'}; font-weight: bold;">
                        ${auditoria.desvioMeters} m (${auditoria.calidad === 'excelente' ? '✓ Excelente / Centrado' : auditoria.calidad === 'buena' ? 'Aceptable' : '⚠️ Desalineado'})
                      </span>
                    ` : ''}
                  ` : `
                    <span style="color: #dc2626; font-weight: bold;">⚠️ Fuera del lote delimitado</span>
                  `
                ) : `
                  <span style="color: #64748b;">(Delimite el terreno para auditar pasadas y desvíos)</span>
                `}
              </div>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      group.addLayer(marker);
    });
  }, [mapReady, maquinas, mostrarMaquinas, polygon, lineas]);

  // Renderizar Track Histórico de la Máquina (recorrido real)
  useEffect(() => {
    if (!trackGroupRef.current || !window.L) return;
    const L = window.L;
    const group = trackGroupRef.current;
    group.clearLayers();

    if (!trackHistorico || trackHistorico.length < 2) return;

    const latLngs = trackHistorico.map((p) => [p.lat, p.lng]);
    const trackLine = L.polyline(latLngs, {
      color: "#06b6d4",
      weight: 3.5,
      opacity: 0.9,
      dashArray: "3, 6",
    });

    trackLine.bindPopup(`
      <div style="font-family: sans-serif; font-size: 11px;">
        <b>Traza Real Registrada:</b> ${trackHistorico.length} puntos de GPS.
      </div>
    `);

    group.addLayer(trackLine);
  }, [trackHistorico]);

  const handleLocalizarGPS = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no está disponible.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userPos: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapRef.current) {
          mapRef.current.flyTo([userPos.lat, userPos.lng], 16, { animate: true });
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAjustarVista = useCallback(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    if (polygon.length >= 2) {
      const bounds = L.latLngBounds(polygon.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [polygon]);

  return (
    <div 
      className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl transition-all ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-none h-screen" : "h-[calc(100dvh-130px)] min-h-[500px] md:h-[640px]"
      }`} 
      style={{ height: isFullscreen ? "100dvh" : undefined }}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* 1. BARRA SUPERIOR PARA CELULAR (Compacta, ultra-limpia, no tapa el mapa) */}
      <div className="flex md:hidden absolute top-2 left-2 right-2 z-[1000] flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg text-white">
          {/* Selector de Capas */}
          <div className="flex items-center bg-slate-800 rounded p-0.5 text-[10px]">
            <button
              onClick={() => handleLayerChange("hybrid")}
              className={`px-1.5 py-0.5 font-bold rounded ${activeLayer === "hybrid" ? "bg-amber-500 text-slate-950" : "text-slate-300"}`}
            >
              Híb
            </button>
            <button
              onClick={() => handleLayerChange("satellite")}
              className={`px-1.5 py-0.5 font-bold rounded ${activeLayer === "satellite" ? "bg-amber-500 text-slate-950" : "text-slate-300"}`}
            >
              Sat
            </button>
          </div>

          {/* Chip de Rumbo Móvil */}
          <button
            onClick={() => setMobileRumboModal(true)}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-[11px] font-bold text-amber-400 border border-slate-700"
          >
            <Compass className="h-3 w-3" />
            <span>{rumboGrados}°</span>
          </button>

          {/* Chip de Separación Móvil */}
          <button
            onClick={() => setMobilePasoModal(true)}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-[11px] font-bold text-white border border-slate-700"
          >
            <span className="text-amber-400 font-mono text-[10px]">Paso:</span>
            <span>{anchoCalle}m</span>
          </button>

          {/* Chip de Secuencia Invertir (ej. 20➔1) */}
          {onToggleOrdenSecuencia && (
            <button
              onClick={onToggleOrdenSecuencia}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-[11px] font-bold text-cyan-300 border border-slate-700"
              title="Cambiar orden de pasadas"
            >
              <span>🔄 {ordenSecuencia === "descendente" ? "20➔1" : "1➔20"}</span>
            </button>
          )}

          {/* Chip para Enfocar Máquina Satcom en Celular */}
          {maquinas && maquinas.some(m => m.lat !== null && m.lng !== null) && (
            <button
              onClick={() => handleCentrarEnMaquina()}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border transition-colors shadow ${
                mostrarMaquinas ? "bg-emerald-600 text-white border-emerald-500 animate-pulse" : "bg-slate-800 text-emerald-400 border-slate-700"
              }`}
              title="Centrar mapa en la máquina Xpert Satcom"
            >
              <Tractor className="h-3 w-3" />
              <span>Máq</span>
            </button>
          )}

          {/* Herramientas Rápidas Modal */}
          <button
            onClick={() => setMobileMenuModal(true)}
            className="bg-slate-800 hover:bg-slate-700 p-1 rounded text-slate-200 border border-slate-700"
            title="Herramientas de Lote"
          >
            <Sliders className="h-3.5 w-3.5 text-amber-400" />
          </button>

          {/* Pantalla Completa Cabina */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-slate-800 hover:bg-slate-700 p-1 rounded text-slate-200 border border-slate-700"
            title="Pantalla Completa Cabina"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-amber-400" /> : <Maximize2 className="h-3.5 w-3.5 text-amber-400" />}
          </button>
        </div>
      </div>

      {/* Buscador de Coordenadas Flotante (Desktop) */}
      <div className="hidden md:flex absolute top-3 left-3 z-[1000] items-center gap-2 max-w-[340px] w-full">
        <div className="relative w-full flex items-center shadow-lg">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
            placeholder="Ir a Coordenadas o Localidad..."
            className="bg-slate-900/90 border-slate-700 text-xs text-white placeholder:text-slate-400 h-8 pr-7 backdrop-blur-md font-mono"
          />
          <button
            onClick={handleBuscar}
            className="absolute right-1 text-slate-400 hover:text-white p-1"
            title="Buscar"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Barra de Herramientas Principal Flotante (Desktop) */}
      <div className="hidden md:flex absolute top-14 left-3 z-[1000] flex-wrap items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-lg text-white max-w-[95%]">
        {/* Selector de Capas */}
        <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[11px]">
          <button
            onClick={() => handleLayerChange("hybrid")}
            className={`px-2 py-0.5 font-semibold rounded ${activeLayer === "hybrid" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
          >
            Híbrido
          </button>
          <button
            onClick={() => handleLayerChange("satellite")}
            className={`px-2 py-0.5 font-semibold rounded ${activeLayer === "satellite" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
          >
            Satélite
          </button>
        </div>

        <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

        {/* Delimitar Terreno */}
        {interactionMode === "draw_polygon" ? (
          <Button
            size="sm"
            onClick={() => setInteractionMode("none")}
            className="bg-green-600 hover:bg-green-500 text-white font-bold text-xs h-7 gap-1 shadow"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Cerrar Lote
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setInteractionMode("draw_polygon")}
            className="bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-xs h-7 gap-1 text-slate-200"
            title="Haga clics en el mapa para delimitar el terreno"
          >
            <MapPin className="h-3.5 w-3.5 text-green-400" />
            {polygon.length === 0 ? "Delimitar Terreno" : "Editar Vértices"}
          </Button>
        )}

        {/* Autoayuda: Completar 4to Vértice si hay 3 puntos */}
        {polygon.length === 3 && (
          <Button
            size="sm"
            onClick={handleAutoCompletarRectangulo}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-7 gap-1 shadow animate-pulse"
            title="Calcula automáticamente el 4to punto para cerrar un rectángulo perfecto"
          >
            <Square className="h-3.5 w-3.5" /> Cerrar Escuadra (4to Vértice)
          </Button>
        )}

        {/* Autoayuda: Cuadrar a 90° exacto si hay 4 puntos */}
        {polygon.length === 4 && (
          <Button
            size="sm"
            onClick={() => {
              const enderezado = enderezarPoligonoCuadrado(polygon);
              onPolygonChange(enderezado);
              toast.success("¡Lote enderezado a escuadra perfecta de 90°!");
            }}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-7 gap-1 shadow"
            title="Ajusta matemáticamente las 4 esquinas a 90° exactos y lados opuestos paralelos"
          >
            <Square className="h-3.5 w-3.5" /> Cuadrar a 90°
          </Button>
        )}

        {/* Inteligencia: Suavizar Curvas del Perímetro */}
        {polygon.length >= 3 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const suavizado = suavizarBordesCurvos(polygon, 1);
              onPolygonChange(suavizado);
              toast.success("Bordes suavizados con curvas geodésicas");
            }}
            className="bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-xs h-7 gap-1 text-cyan-300"
            title="Inteligencia de contorno: Convierte aristas toscas en curvas continuas para alambrados curvos o cañadas"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Suavizar Curvas
          </Button>
        )}

        {/* Tirar Rectas Paralelas al Campo (A lo Largo / A lo Ancho / E-O / N-S) */}
        {polygon.length >= 3 && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onRumboChange) onRumboChange(ejes.rumboLargo);
                toast.success(`Pasadas alineadas A LO LARGO del lote (${Math.round(ejes.rumboLargo)}° - 100% Paralelas a alambrado)`);
              }}
              className={`text-xs h-7 gap-1 ${rumboGrados === ejes.rumboLargo ? "bg-amber-500 text-slate-950 font-black shadow" : "bg-slate-800/90 border-slate-600 text-slate-200 hover:bg-slate-700"}`}
              title="Alinear pasadas 100% paralelas al lado más largo del campo (no van cruzadas)"
            >
              📏 A lo Largo ({Math.round(ejes.rumboLargo)}°)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onRumboChange) onRumboChange(ejes.rumboAncho);
                toast.success(`Pasadas alineadas A LO ANCHO del lote (${Math.round(ejes.rumboAncho)}° - Transversal a 90°)`);
              }}
              className={`text-xs h-7 gap-1 ${rumboGrados === ejes.rumboAncho ? "bg-amber-500 text-slate-950 font-black shadow" : "bg-slate-800/90 border-slate-600 text-slate-200 hover:bg-slate-700"}`}
              title="Alinear pasadas transversales a 90° de cabecera a cabecera"
            >
              📐 A lo Ancho ({Math.round(ejes.rumboAncho)}°)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onRumboChange) onRumboChange(90);
                toast.success("Pasadas orientadas Horizontal (Este-Oeste / 90°)");
              }}
              className={`text-xs h-7 gap-1 ${rumboGrados === 90 ? "bg-amber-500 text-slate-950 font-bold" : "bg-slate-800/90 border-slate-600 text-slate-200 hover:bg-slate-700"}`}
              title="Tirar rectas horizontales geográficas (Este-Oeste / 90°)"
            >
              ➡️ Horizontal
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onRumboChange) onRumboChange(0);
                toast.success("Pasadas orientadas Vertical (Norte-Sur / 0°)");
              }}
              className={`text-xs h-7 gap-1 ${rumboGrados === 0 ? "bg-amber-500 text-slate-950 font-bold" : "bg-slate-800/90 border-slate-600 text-slate-200 hover:bg-slate-700"}`}
              title="Tirar rectas verticales geográficas (Norte-Sur / 0°)"
            >
              ⬆️ Vertical
            </Button>
          </>
        )}

        {/* Selector de Separación / Distancia entre Calles directamente en el Mapa */}
        <div className="flex items-center bg-slate-800/95 border border-slate-700 rounded px-2 py-0.5 text-xs text-white gap-1.5 shadow">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Paso:</span>
          {[3, 5, 8, 10, 15, 20, 50, 100].map((d) => (
            <button
              key={d}
              onClick={() => onAnchoCalleChange?.(d)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${
                anchoCalle === d 
                  ? "bg-amber-500 text-slate-950 shadow" 
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              {d}m
            </button>
          ))}
          <div className="flex items-center gap-0.5 ml-0.5">
            <input
              type="number"
              min="0.5"
              max="2000"
              step="1"
              value={anchoCalle}
              onChange={(e) => onAnchoCalleChange?.(Math.max(0.5, parseFloat(e.target.value) || 1))}
              className="w-14 h-6 text-xs bg-slate-950 border border-slate-700 text-center font-mono font-bold text-amber-400 rounded"
            />
            <span className="text-[10px] text-muted-foreground font-mono">m</span>
          </div>
        </div>

        {/* Botón para ver y enfocar máquinas Xpert Satcom en tiempo real */}
        {maquinas && maquinas.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCentrarEnMaquina()}
            className={`text-xs h-7 gap-1 ${mostrarMaquinas ? "bg-emerald-500 text-slate-950 font-black shadow" : "bg-slate-800/90 border-slate-600 text-slate-200 hover:bg-slate-700"}`}
            title="Clic para enfocar y ver la máquina Xpert Satcom en el mapa"
          >
            <Tractor className="h-3.5 w-3.5" />
            🚜 Satcom ({maquinas.filter(m => m.lat !== null).length})
          </Button>
        )}

        {/* Botón para limpiar calles externas si hay alguna */}
        {callesManuales.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              if (onCallesManualesChange) onCallesManualesChange([]);
              toast.success("Calles externas eliminadas");
            }}
            className="text-xs h-7 bg-red-600 hover:bg-red-500 text-white font-bold px-2 gap-1 shadow"
            title="Borrar calles que quedaron fuera del perímetro"
          >
            <Trash2 className="h-3.5 w-3.5" /> Limpiar Calles Fuera del Lote ({callesManuales.length})
          </Button>
        )}

        {/* Toggle Autoayuda / Snapping Inteligente */}
        <Button
          size="sm"
          variant={snappingActivo ? "default" : "outline"}
          onClick={() => {
            setSnappingActivo(!snappingActivo);
            toast.info(snappingActivo ? "Autoayuda desactivada" : "Autoayuda (Escuadra y Snap Magnético) activada");
          }}
          className={`text-xs h-7 gap-1 ${snappingActivo ? "bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow" : "bg-slate-800 border-slate-700 text-slate-400"}`}
          title="Autoayuda: Escuadra 90° automática y atracción magnética a vértices"
        >
          <Magnet className="h-3.5 w-3.5" />
          {snappingActivo ? "Autoayuda: ON" : "Autoayuda: OFF"}
        </Button>

        {/* Fijar Rumbo A-B */}
        <Button
          size="sm"
          variant={interactionMode === "draw_ab" ? "default" : "outline"}
          onClick={() => {
            setInteractionMode(interactionMode === "draw_ab" ? "none" : "draw_ab");
            setAbPoints([]);
          }}
          className={`text-xs h-7 gap-1 ${interactionMode === "draw_ab" ? "bg-amber-500 text-slate-950 font-bold animate-pulse" : "bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-slate-200"}`}
        >
          <Compass className="h-3.5 w-3.5 text-amber-400" />
          {interactionMode === "draw_ab" ? "Fijando A-B..." : "Rumbo A-B"}
        </Button>

        {/* Añadir Waypoint */}
        <Button
          size="sm"
          variant={interactionMode === "add_waypoint" ? "default" : "outline"}
          onClick={() => setInteractionMode(interactionMode === "add_waypoint" ? "none" : "add_waypoint")}
          className={`text-xs h-7 gap-1 ${interactionMode === "add_waypoint" ? "bg-blue-500 text-white font-bold animate-pulse" : "bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-slate-200"}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-blue-400" />
          {interactionMode === "add_waypoint" ? "Clic en Terreno..." : "+ Waypoint"}
        </Button>

        {/* Calle Maestra Manual */}
        <Button
          size="sm"
          variant={interactionMode === "draw_manual_line" ? "default" : "outline"}
          onClick={() => {
            setInteractionMode(interactionMode === "draw_manual_line" ? "none" : "draw_manual_line");
            setManualLinePoints([]);
          }}
          className={`text-xs h-7 gap-1 ${interactionMode === "draw_manual_line" ? "bg-fuchsia-500 text-white font-bold animate-pulse" : "bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-slate-200"}`}
        >
          <Route className="h-3.5 w-3.5 text-fuchsia-400" />
          {interactionMode === "draw_manual_line" ? "Trazando Eje..." : "+ Calle Manual"}
        </Button>

        {/* Regla de Medición */}
        <Button
          size="sm"
          variant={interactionMode === "measure" ? "default" : "outline"}
          onClick={() => {
            setInteractionMode(interactionMode === "measure" ? "none" : "measure");
            setMeasurePoints([]);
            setMeasureResult(null);
          }}
          className={`text-xs h-7 gap-1 ${interactionMode === "measure" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-slate-800/90 border-slate-600 hover:bg-slate-700 text-slate-200"}`}
        >
          <Ruler className="h-3.5 w-3.5 text-cyan-400" />
          {interactionMode === "measure" ? "Midiendo..." : "Medir"}
        </Button>

        {/* Borrar Calles Manuales si hay alguna */}
        {callesManuales.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`¿Desea borrar las ${callesManuales.length} calles manuales?`)) {
                if (onCallesManualesChange) onCallesManualesChange([]);
                toast.success("Calles manuales borradas");
              }
            }}
            className="text-xs h-7 text-fuchsia-400 hover:text-fuchsia-300 hover:bg-fuchsia-950/40 px-2 gap-1"
            title="Borrar calles manuales"
          >
            <Trash2 className="h-3.5 w-3.5" /> Borrar Calle ({callesManuales.length})
          </Button>
        )}

        {polygon.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm("¿Desea reiniciar y borrar el perímetro del lote?")) {
                onPolygonChange([]);
                setInteractionMode("none");
              }
            }}
            className="text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-950/40 px-1.5"
            title="Borrar polígono"
          >
            <Trash2 className="h-3.5 w-3.5" /> Borrar Lote
          </Button>
        )}
      </div>

      {/* Botones de Control Flotantes a la Derecha */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          onClick={handleAjustarVista}
          className="bg-slate-900/90 hover:bg-slate-800 text-white p-2 rounded-lg border border-slate-700 shadow-lg backdrop-blur-md transition-all"
          title="Centrar en el Lote"
        >
          <Crosshair className="h-4 w-4 text-amber-400" />
        </button>

        <button
          onClick={handleLocalizarGPS}
          disabled={isLocating}
          className="bg-slate-900/90 hover:bg-slate-800 text-white p-2 rounded-lg border border-slate-700 shadow-lg backdrop-blur-md transition-all"
          title="Centrar en Mi Ubicación GPS"
        >
          <Navigation className={`h-4 w-4 ${isLocating ? "animate-spin text-blue-400" : "text-blue-400"}`} />
        </button>

        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="bg-slate-900/90 hover:bg-slate-800 text-white p-2 rounded-lg border border-slate-700 shadow-lg backdrop-blur-md transition-all"
          title={isFullscreen ? "Salir de pantalla completa" : "Pantalla Completa"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* HUD de Asistencia Activa / Notificación Superior */}
      {interactionMode === "draw_polygon" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 border border-cyan-500/80 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400 animate-spin" />
          <span>
            {currentSnap?.isSnapped
              ? currentSnap.label
              : "Autoayuda activa: La guía bloquea a 90° (escuadra) y atrae magnéticamente al cerrar."}
          </span>
        </div>
      )}

      {interactionMode === "draw_ab" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] bg-amber-950/90 border border-amber-500/60 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-pulse">
          <Compass className="h-4 w-4 text-amber-300" />
          {abPoints.length === 0 ? "Haga clic en el Punto A de inicio" : "Haga clic en el Punto B para fijar la recta"}
        </div>
      )}

      {interactionMode === "add_waypoint" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] bg-blue-950/90 border border-blue-500/60 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-300" />
          Haga clic en el terreno donde desea colocar el mojón u obstáculo.
        </div>
      )}

      {interactionMode === "draw_manual_line" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] bg-fuchsia-950/90 border border-fuchsia-500/60 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
          <Route className="h-4 w-4 text-fuchsia-300" />
          {manualLinePoints.length === 0 ? "Haga clic en el inicio de la calle manual" : "Haga clic en el fin de la calle"}
        </div>
      )}

      {interactionMode === "measure" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] bg-cyan-950/90 border border-cyan-500/60 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
          <Ruler className="h-4 w-4 text-cyan-300" />
          {measurePoints.length === 0 ? "Haga clic en el primer punto a medir" : "Haga clic en el segundo punto"}
        </div>
      )}

      {/* HUD de Seguridad y Auditoría de Rectitud en Pantalla */}
      {polygon.length >= 3 && (
        <div className="absolute bottom-11 left-3 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg p-2.5 text-xs text-white shadow-2xl flex items-center gap-3 max-w-[95%]">
          <div
            className={`h-3 w-3 rounded-full shrink-0 ${
              auditoria.esCuadradoRecto
                ? "bg-green-500 shadow-[0_0_8px_#22c55e]"
                : auditoria.scoreRectitud >= 80
                ? "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
                : "bg-red-500"
            }`}
          />
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-1.5 text-xs">
              {auditoria.esCuadradoRecto ? (
                <span className="text-green-400 font-black">
                  ✅ Terreno 100% Derecho (Escuadras 90° Verificadas)
                </span>
              ) : (
                <span className="text-amber-400 font-bold">
                  Auditoría de Rectitud: {auditoria.scoreRectitud}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300">
              {auditoria.mensajeSeguridad}
            </div>
          </div>
          {polygon.length === 4 && !auditoria.esCuadradoRecto && (
            <Button
              size="sm"
              onClick={() => {
                const enderezado = enderezarPoligonoCuadrado(polygon);
                onPolygonChange(enderezado);
                toast.success("¡Lote enderezado a escuadra perfecta de 90°!");
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-7 px-2.5 shadow shrink-0 gap-1"
              title="Ajusta las 4 esquinas exactamente a 90°"
            >
              <Square className="h-3 w-3" /> Enderezar a 90°
            </Button>
          )}
        </div>
      )}

      {/* HUD de Cabina & Banderillero Digital Flotante (Optimizado para Celular en Parabrisas) */}
      {lineas && lineas.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 md:bottom-3 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-[1000] bg-slate-950/95 backdrop-blur-md border-2 border-emerald-500/80 rounded-xl p-2.5 sm:p-3 shadow-2xl text-white">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider shadow">
                🎯 PASADA ACTUAL
              </span>
              <span className="font-mono font-black text-sm sm:text-base text-emerald-400 truncate">
                {lineas.find(l => l.id === pasadaActivaId)?.nombre || lineas[0]?.nombre}
              </span>
              {(() => {
                const activa = lineas.find(l => l.id === pasadaActivaId) || lineas[0];
                return activa ? (
                  <span className="text-[11px] text-slate-300 font-mono">
                    ({activa.lengthMeters}m · {activa.bearing}° {activa.headingName})
                  </span>
                ) : null;
              })()}
            </div>

            {(() => {
              const proxima = lineas.find(l => l.id === proximaPasadaId);
              return proxima ? (
                <div className="text-[11px] text-cyan-300 font-mono hidden sm:flex items-center gap-1 shrink-0">
                  <span className="text-slate-400">➡️ Sig:</span>
                  <b className="text-cyan-300">{proxima.nombre}</b>
                </div>
              ) : null;
            })()}
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onAnteriorPasada}
              className="h-9 px-3 text-xs font-bold border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 shrink-0"
              title="Pasada anterior en la secuencia"
            >
              ⬅️ Ant.
            </Button>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const activa = lineas.find(l => l.id === pasadaActivaId) || lineas[0];
                  if (activa) handleCentrarEnPasadaActiva(activa);
                }}
                className="h-9 px-2 text-xs font-bold border-slate-700 bg-slate-900 text-amber-400 hover:bg-slate-800"
                title="Centrar mapa en la pasada actual"
              >
                🎯 Pasada
              </Button>

              {maquinas && maquinas.some(m => m.lat !== null && m.lng !== null) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCentrarEnMaquina()}
                  className="h-9 px-2 text-xs font-bold border-emerald-500/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 flex items-center gap-1"
                  title="Centrar mapa en la máquina / tractor GPS"
                >
                  <Tractor className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Máquina</span>
                </Button>
              )}

              {onToggleOrdenSecuencia && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onToggleOrdenSecuencia}
                  className="h-9 px-2 text-[11px] font-bold border-slate-700 bg-slate-900 text-cyan-300 hover:bg-slate-800 hidden sm:flex items-center gap-1"
                  title="Invertir secuencia de recorrido"
                >
                  🔄 {ordenSecuencia === "descendente" ? "20 ➔ 1" : "1 ➔ 20"}
                </Button>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => {
                const activa = lineas.find(l => l.id === pasadaActivaId) || lineas[0];
                if (activa && onCompletarPasada) onCompletarPasada(activa.id);
              }}
              className="h-9 px-3 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg gap-1.5 shrink-0"
              title="Marcar pasada completada y avanzar a la siguiente"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>✓ Lista ➔ Sig.</span>
            </Button>
          </div>
        </div>
      )}

      {/* Modal Móvil: Selector de Rumbo */}
      <Dialog open={mobileRumboModal} onOpenChange={setMobileRumboModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-amber-400">
              <Compass className="h-4 w-4" /> Orientación de Pasadas (Rumbo)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Elija el sentido en el que la maquinaria recorrerá el lote:
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            {polygon.length >= 3 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    onRumboChange?.(ejes.rumboLargo);
                    setMobileRumboModal(false);
                    toast.success(`Alineado A LO LARGO (${Math.round(ejes.rumboLargo)}°)`);
                  }}
                  className="justify-start h-10 border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-2 text-xs"
                >
                  📏 A lo Largo del Lote ({Math.round(ejes.rumboLargo)}° - Alambrado)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    onRumboChange?.(ejes.rumboAncho);
                    setMobileRumboModal(false);
                    toast.success(`Alineado A LO ANCHO (${Math.round(ejes.rumboAncho)}°)`);
                  }}
                  className="justify-start h-10 border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-2 text-xs"
                >
                  📐 A lo Ancho Transversal ({Math.round(ejes.rumboAncho)}°)
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                onRumboChange?.(90);
                setMobileRumboModal(false);
                toast.success("Orientado Horizontal (90° Este-Oeste)");
              }}
              className="justify-start h-10 border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-2 text-xs"
            >
              ➡️ Horizontal (Este-Oeste / 90°)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onRumboChange?.(0);
                setMobileRumboModal(false);
                toast.success("Orientado Vertical (0° Norte-Sur)");
              }}
              className="justify-start h-10 border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-2 text-xs"
            >
              ⬆️ Vertical (Norte-Sur / 0°)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Móvil: Selector de Paso */}
      <Dialog open={mobilePasoModal} onOpenChange={setMobilePasoModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-amber-400">
              <Ruler className="h-4 w-4" /> Separación entre Calles
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Distancia en metros entre los ejes de las pasadas:
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 py-2">
            {[3, 5, 8, 10, 15, 20, 50, 100].map((d) => (
              <Button
                key={d}
                variant={anchoCalle === d ? "default" : "outline"}
                onClick={() => {
                  onAnchoCalleChange?.(d);
                  setMobilePasoModal(false);
                }}
                className={`h-10 text-xs font-bold ${anchoCalle === d ? "bg-amber-500 text-slate-950 font-black shadow" : "border-slate-700 bg-slate-800 text-white"}`}
              >
                {d}m
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Móvil: Menú de Herramientas de Campo */}
      <Dialog open={mobileMenuModal} onOpenChange={setMobileMenuModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-white">
              <Sliders className="h-4 w-4 text-amber-400" /> Herramientas de Campo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Opciones de trazado, topografía y corrección:
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            {maquinas && maquinas.some(m => m.lat !== null && m.lng !== null) && (
              <Button
                variant="outline"
                onClick={() => {
                  handleCentrarEnMaquina();
                  setMobileMenuModal(false);
                }}
                className="justify-start h-10 border-emerald-600/50 bg-emerald-950/40 text-emerald-300 gap-2 text-xs"
              >
                <Tractor className="h-4 w-4 text-emerald-400" />
                🚜 Enfocar Máquina Xpert Satcom en Vivo
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setInteractionMode(interactionMode === "draw_polygon" ? "none" : "draw_polygon");
                setMobileMenuModal(false);
              }}
              className="justify-start h-10 border-slate-700 bg-slate-800 text-white gap-2 text-xs"
            >
              <MapPin className="h-4 w-4 text-green-400" />
              {polygon.length === 0 ? "Delimitar Terreno" : "Editar Vértices del Lote"}
            </Button>
            {polygon.length === 4 && (
              <Button
                variant="outline"
                onClick={() => {
                  const enderezado = enderezarPoligonoCuadrado(polygon);
                  onPolygonChange(enderezado);
                  setMobileMenuModal(false);
                  toast.success("¡Lote enderezado a escuadra perfecta de 90°!");
                }}
                className="justify-start h-10 border-slate-700 bg-slate-800 text-cyan-300 gap-2 text-xs"
              >
                <Square className="h-4 w-4 text-cyan-400" />
                Cuadrar y Enderezar a 90°
              </Button>
            )}
            {polygon.length >= 3 && (
              <Button
                variant="outline"
                onClick={() => {
                  const suavizado = suavizarBordesCurvos(polygon, 1);
                  onPolygonChange(suavizado);
                  setMobileMenuModal(false);
                  toast.success("Curvas geodésicas aplicadas");
                }}
                className="justify-start h-10 border-slate-700 bg-slate-800 text-cyan-300 gap-2 text-xs"
              >
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Suavizar Curvas del Alambrado
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setInteractionMode(interactionMode === "measure" ? "none" : "measure");
                setMeasurePoints([]);
                setMeasureResult(null);
                setMobileMenuModal(false);
              }}
              className="justify-start h-10 border-slate-700 bg-slate-800 text-white gap-2 text-xs"
            >
              <Ruler className="h-4 w-4 text-cyan-400" />
              Medir Distancia en el Terreno
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setInteractionMode(interactionMode === "add_waypoint" ? "none" : "add_waypoint");
                setMobileMenuModal(false);
              }}
              className="justify-start h-10 border-slate-700 bg-slate-800 text-white gap-2 text-xs"
            >
              <AlertTriangle className="h-4 w-4 text-blue-400" />
              + Agregar Mojón u Obstáculo
            </Button>
            {callesManuales.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => {
                  onCallesManualesChange?.([]);
                  setMobileMenuModal(false);
                  toast.success("Calles externas eliminadas");
                }}
                className="justify-start h-10 gap-2 text-xs"
              >
                <Trash2 className="h-4 w-4" />
                Limpiar Calles Externas ({callesManuales.length})
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* HUD Geodésico Inferior (Oculto en móvil si está el HUD de Cabina para no superponer) */}
      <div className={`absolute ${lineas && lineas.length > 0 ? "bottom-20 md:bottom-2" : "bottom-2"} left-3 z-[900] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-md px-3 py-1.5 text-[11px] font-mono text-slate-300 hidden sm:flex items-center gap-3 shadow-lg pointer-events-none`}>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          WGS84
        </span>
        {cursorCoords && (
          <span>
            Lat: <b className="text-white">{cursorCoords.lat.toFixed(6)}</b> | Lng:{" "}
            <b className="text-white">{cursorCoords.lng.toFixed(6)}</b>
          </span>
        )}
        <span className="border-l border-slate-700 pl-2 text-amber-400">
          Rumbo: {rumboGrados}° ({obtenerNombreRumbo(rumboGrados)})
        </span>
      </div>
    </div>
  );
}
