import React, { useEffect, useRef, useState, useCallback } from "react";
import { 
  LatLng, 
  LineSegment, 
  Waypoint, 
  calcularDistanciaMetros, 
  calcularRumboGrados, 
  obtenerNombreRumbo,
  calcularSnapInteligente,
  autoCompletarCuartoVertice,
  SnapResult
} from "@/lib/gis/surface-planner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Sparkles
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
  const baseLayersRef = useRef<{ [key: string]: any }>({});
  
  const [activeLayer, setActiveLayer] = useState<"hybrid" | "satellite" | "streets">("hybrid");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<LatLng | null>(null);
  const [currentSnap, setCurrentSnap] = useState<SnapResult | null>(null);
  const [snappingActivo, setSnappingActivo] = useState(true);
  const [abPoints, setAbPoints] = useState<LatLng[]>([]);
  const [manualLinePoints, setManualLinePoints] = useState<LatLng[]>([]);
  const [measurePoints, setMeasurePoints] = useState<LatLng[]>([]);
  const [measureResult, setMeasureResult] = useState<{ dist: number; bearing: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

      // Movimiento del cursor con Autoayuda / Snapping Inteligente
      map.on("mousemove", (e: any) => {
        const rawPt: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        setCursorCoords(rawPt);
      });

      mapRef.current = map;

      if (polygon.length >= 3) {
        const bounds = L.latLngBounds(polygon.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
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
  }, [polygon, interactionMode, onPolygonChange]);

  // Renderizar Pasadas Automáticas
  useEffect(() => {
    if (!linesLayerGroupRef.current || !window.L) return;
    const L = window.L;
    const group = linesLayerGroupRef.current;
    group.clearLayers();

    lineas.forEach((line) => {
      const isSelected = selectedLineId === line.id;
      const latLngs = [
        [line.start.lat, line.start.lng],
        [line.end.lat, line.end.lng],
      ];

      const outline = L.polyline(latLngs, {
        color: "#000000",
        weight: isSelected ? 7 : 5,
        opacity: 0.7,
      });

      const polyline = L.polyline(latLngs, {
        color: isSelected ? "#06b6d4" : "#f59e0b",
        weight: isSelected ? 4 : 3,
        opacity: 1,
      });

      const markerA = L.circleMarker([line.start.lat, line.start.lng], {
        radius: isSelected ? 5 : 3.5,
        fillColor: "#22c55e",
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 1,
      });

      const markerB = L.circleMarker([line.end.lat, line.end.lng], {
        radius: isSelected ? 5 : 3.5,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 1,
      });

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; min-width: 200px; padding: 4px;">
          <div style="font-weight: bold; font-size: 14px; color: #1e293b; border-bottom: 2px solid #f59e0b; padding-bottom: 4px; margin-bottom: 6px;">
            🚜 ${line.nombre}
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
  }, [lineas, selectedLineId, onSelectLine]);

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
      const markerA = L.marker([pA.lat, pA.lng], {
        icon: L.divIcon({
          html: `<div style="background:#22c55e;color:white;font-weight:bold;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.8)">A</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
      markerA.bindTooltip("Punto A fijado. Clic en Punto B para rumbo", { permanent: true, direction: "top" });
      abMarkersRef.current.push(markerA);
    }
  }, [interactionMode, abPoints]);

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
    <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : ""}`} style={{ height: isFullscreen ? "100vh" : height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Buscador de Coordenadas Flotante */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 max-w-[340px] w-full">
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

      {/* Barra de Herramientas Principal Flotante */}
      <div className="absolute top-14 left-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-lg text-white max-w-[95%]">
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

      {/* HUD Geodésico Inferior */}
      <div className="absolute bottom-2 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-md px-3 py-1.5 text-[11px] font-mono text-slate-300 flex items-center gap-3 shadow-lg pointer-events-none">
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
        <span className="hidden sm:inline border-l border-slate-700 pl-2 text-amber-400">
          Rumbo: {rumboGrados}° ({obtenerNombreRumbo(rumboGrados)})
        </span>
      </div>
    </div>
  );
}
