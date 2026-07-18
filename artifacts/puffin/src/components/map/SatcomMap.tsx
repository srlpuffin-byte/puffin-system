import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapPoint {
  maquina_id: number;
  nombre: string;
  tipo: string;
  estado_satcom: string;
  lat: number | null;
  lng: number | null;
  velocidad_kmh: number | null;
  encendido: boolean;
}

interface SatcomMapProps {
  points: MapPoint[];
  height?: string;
}

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  offline: "#ef4444",
  unknown: "#94a3b8",
};

function createMarkerIcon(encendido: boolean, status: string) {
  const color = encendido ? "#22c55e" : STATUS_COLORS[status] || "#94a3b8";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.059 27.941 0 18 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="18" cy="18" r="8" fill="white" opacity="0.9"/>
      <circle cx="18" cy="18" r="5" fill="${color}"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 48],
    iconAnchor: [18, 48],
    popupAnchor: [0, -48],
  });
}

export function SatcomMap({ points, height = "420px" }: SatcomMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [-32.5, -64.5],
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const validPoints = points.filter(p => p.lat !== null && p.lng !== null);

    validPoints.forEach(p => {
      const icon = createMarkerIcon(p.encendido, p.estado_satcom);
      const marker = L.marker([p.lat!, p.lng!], { icon })
        .bindPopup(`
          <div style="font-family:system-ui;min-width:180px">
            <strong style="font-size:14px">${p.nombre}</strong><br/>
            <span style="color:#64748b;font-size:12px">${p.tipo}</span>
            <hr style="margin:6px 0;border-color:#e2e8f0"/>
            <div style="display:flex;gap:8px;flex-direction:column;font-size:12px">
              <span>🟢 Estado: <b>${p.encendido ? "Encendido" : "Apagado"}</b></span>
              <span>🛰 GPS: <b>${p.estado_satcom === "online" ? "En línea" : p.estado_satcom === "offline" ? "Sin señal" : "Desconocido"}</b></span>
              ${p.velocidad_kmh !== null ? `<span>⚡ Velocidad: <b>${p.velocidad_kmh} km/h</b></span>` : ""}
              <span style="color:#94a3b8">📍 ${p.lat?.toFixed(5)}, ${p.lng?.toFixed(5)}</span>
            </div>
          </div>
        `)
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Fit map to markers if any
    if (validPoints.length > 0) {
      const group = L.featureGroup(markersRef.current);
      mapRef.current.fitBounds(group.getBounds().pad(0.3));
    }
  }, [points]);

  return (
    <div className="relative overflow-hidden border shadow-sm" style={{ height }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {points.filter(p => p.lat !== null).length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm pointer-events-none">
          <span className="text-4xl mb-3">🛰</span>
          <p className="text-muted-foreground text-sm font-medium">Vinculá al menos una máquina con GPS para ver el mapa</p>
        </div>
      )}
    </div>
  );
}
