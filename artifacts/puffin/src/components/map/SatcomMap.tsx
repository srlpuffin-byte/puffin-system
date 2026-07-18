import React, { useEffect, useRef } from "react";

interface MapPoint {
  maquina_id: number | null;
  device_id: number | null;
  nombre: string;
  tipo: string;
  estado_satcom: string;
  lat: number | null;
  lng: number | null;
  velocidad_kmh: number | null;
  encendido: boolean;
  is_unlinked?: boolean;
  imagen_url?: string | null;
}

interface SatcomMapProps {
  points: MapPoint[];
  height?: string;
  activePointId?: string | null;
}

declare global {
  interface Window {
    L: any;
    _leafletCSSLoaded?: boolean;
  }
}

function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }

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

function createMarkerIcon(L: any, encendido: boolean, status: string) {
  const color = encendido ? "#22c55e" : status === "offline" ? "#ef4444" : "#94a3b8";
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

export function SatcomMap({ points, height = "420px", activePointId }: SatcomMapProps) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const initializedRef = useRef(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    loadLeaflet().then(() => {
      const L = window.L;
      if (!containerRef.current || mapRef.current) return;

      mapRef.current = L.map(containerRef.current, {
        center: [-32.5, -64.5],
        zoom: 6,
        zoomControl: true,
      });

      // Google Maps Hybrid (Satélite + Calles)
      L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
        attribution: '© Google',
        maxZoom: 20,
      }).addTo(mapRef.current);

      // Fix para líneas blancas/huecos entre tiles en algunos navegadores
      const style = document.createElement('style');
      style.innerHTML = `
        .leaflet-tile-container img {
          width: 257px !important;
          height: 257px !important;
        }
      `;
      document.head.appendChild(style);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []);

  // Update markers whenever points change
  useEffect(() => {
    const L = window.L;
    if (!mapRef.current || !L) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const validPoints = points.filter(p => p.lat !== null && p.lng !== null);

    validPoints.forEach(p => {
      const icon = createMarkerIcon(L, p.encendido, p.estado_satcom);
      const marker = L.marker([p.lat!, p.lng!], { icon })
        .bindPopup(`
          <div style="font-family:system-ui;min-width:180px;max-width:220px">
            ${p.imagen_url ? `<img src="${p.imagen_url}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px" alt="${p.nombre}" />` : ''}
            <strong style="font-size:14px">${p.nombre}</strong><br/>
            <span style="color:#64748b;font-size:12px">${p.tipo}</span>
            <hr style="margin:6px 0;border-color:#e2e8f0"/>
            <div style="display:flex;gap:6px;flex-direction:column;font-size:12px">
              <span>${p.encendido ? "🟢" : "🔴"} <b>${p.encendido ? "Encendido" : "Apagado"}</b></span>
              <span>🛰 GPS: <b>${p.estado_satcom === "online" ? "En línea" : p.estado_satcom === "offline" ? "Sin señal" : "Desconocido"}</b></span>
              ${p.velocidad_kmh !== null ? `<span>⚡ <b>${p.velocidad_kmh} km/h</b></span>` : ""}
              <span style="color:#94a3b8;font-size:11px">📍 ${p.lat?.toFixed(5)}, ${p.lng?.toFixed(5)}</span>
            </div>
          </div>
        `)
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });

    if (validPoints.length > 0) {
      if (activePointId) {
        const activePoint = validPoints.find(p => (p.is_unlinked ? `dev-${p.device_id}` : `maq-${p.maquina_id}`) === activePointId);
        if (activePoint && activePoint.lat !== null && activePoint.lng !== null) {
          mapRef.current.flyTo([activePoint.lat, activePoint.lng], 15, { animate: true, duration: 1 });
        } else {
          const group = L.featureGroup(markersRef.current);
          mapRef.current.fitBounds(group.getBounds().pad(0.3));
        }
      } else {
        const group = L.featureGroup(markersRef.current);
        mapRef.current.fitBounds(group.getBounds().pad(0.3));
      }
    }
  }, [points, activePointId]);

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
