/**
 * Motor Geodésico y de Planificación de Superficies de Alta Precisión
 * Diseñado para delimitación topográfica de parcelas, trazado de calles rectas (Líneas A-B),
 * gestión de waypoints / obstáculos de campo y exportación profesional
 * compatible con Avenza Maps, Google Earth y Banderilleros Satelitales (Trimble, John Deere, Raven, etc.).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MetricPoint {
  x: number;
  y: number;
}

export interface LineSegment {
  id: string;
  index: number;
  nombre: string;
  start: LatLng;
  end: LatLng;
  lengthMeters: number;
  bearing: number; // 0-360 grados
  headingName: string;
  tipo?: "pasada_auto" | "calle_manual" | "cabecera";
}

export type WaypointTipo = "mojon" | "obstaculo" | "acceso" | "combustible" | "agua";

export interface Waypoint {
  id: string;
  nombre: string;
  tipo: WaypointTipo;
  lat: number;
  lng: number;
  radioSeguridadMeters?: number; // Radio de exclusión para máquinas
  notas?: string;
}

export interface LotePlan {
  id: string;
  nombre: string;
  cliente?: string;
  proyectoId?: string;
  fechaCreacion: string;
  polygon: LatLng[];
  areaM2: number;
  areaHectareas: number;
  perimetroMeters: number;
  // Parámetros de las líneas de pasada
  anchoCalleMeters: number;
  rumboGrados: number; // Ángulo de las pasadas
  alternarSentido: boolean; // Ida y vuelta (Boustrophedon)
  lineas: LineSegment[];
  callesManuales: LineSegment[];
  waypoints: Waypoint[];
  distanciaTotalMeters: number;
}

const EARTH_RADIUS = 6371000; // Radio medio de la Tierra en metros (WGS84)

/**
 * Distancia geodésica exacta en metros entre dos puntos usando la fórmula de Haversine
 */
export function calcularDistanciaMetros(p1: LatLng, p2: LatLng): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Rumbo inicial (Azimut) en grados (0° a 360°) desde p1 hacia p2
 */
export function calcularRumboGrados(p1: LatLng, p2: LatLng): number {
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Nombre del rumbo cardinal (ej: N, NE, ENE, S, SSO, etc.)
 */
export function obtenerNombreRumbo(grados: number): string {
  const direcciones = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"
  ];
  const idx = Math.round(((grados % 360) / 22.5)) % 16;
  return direcciones[idx];
}

/**
 * Calcula el centroide geográfico de un conjunto de coordenadas
 */
export function calcularCentroide(puntos: LatLng[]): LatLng {
  if (puntos.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const p of puntos) {
    sumLat += p.lat;
    sumLng += p.lng;
  }
  return {
    lat: sumLat / puntos.length,
    lng: sumLng / puntos.length,
  };
}

/**
 * Proyección local equirrectangular centrada en el origen del lote.
 * Precisión subcentimétrica para escalas de campo (0 - 50 km).
 */
export function proyectarLocal(pt: LatLng, origin: LatLng): MetricPoint {
  const latRad = (origin.lat * Math.PI) / 180;
  const x = ((pt.lng - origin.lng) * Math.PI / 180) * EARTH_RADIUS * Math.cos(latRad);
  const y = ((pt.lat - origin.lat) * Math.PI / 180) * EARTH_RADIUS;
  return { x, y };
}

/**
 * Desproyección métrica local de vuelta a coordenadas WGS84 (Lat, Lng)
 */
export function desproyectarLocal(pt: MetricPoint, origin: LatLng): LatLng {
  const latRad = (origin.lat * Math.PI) / 180;
  const lng = origin.lng + (pt.x / (EARTH_RADIUS * Math.cos(latRad))) * (180 / Math.PI);
  const lat = origin.lat + (pt.y / EARTH_RADIUS) * (180 / Math.PI);
  return { lat, lng };
}

/**
 * Calcula el área y perímetro de un polígono
 */
export function calcularMetricasPoligono(puntos: LatLng[]): { areaM2: number; areaHectareas: number; perimetroMeters: number } {
  if (puntos.length < 3) {
    return { areaM2: 0, areaHectareas: 0, perimetroMeters: 0 };
  }

  const origin = calcularCentroide(puntos);
  const metricPts = puntos.map((p) => proyectarLocal(p, origin));

  // Fórmula de Gauss (Shoelace) en metros locales
  let area = 0;
  let perimetro = 0;
  const n = metricPts.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += metricPts[i].x * metricPts[j].y;
    area -= metricPts[j].x * metricPts[i].y;

    const dx = metricPts[j].x - metricPts[i].x;
    const dy = metricPts[j].y - metricPts[i].y;
    perimetro += Math.sqrt(dx * dx + dy * dy);
  }

  const areaM2 = Math.abs(area) / 2;
  const areaHectareas = areaM2 / 10000;

  return {
    areaM2: Math.round(areaM2 * 100) / 100,
    areaHectareas: Math.round(areaHectareas * 100) / 100,
    perimetroMeters: Math.round(perimetro * 10) / 10,
  };
}

/**
 * Encuentra el borde más largo del polígono para alinear las pasadas automáticamente
 */
export function encontrarRumboBordeMasLargo(puntos: LatLng[]): number {
  if (puntos.length < 2) return 0;
  let maxDist = -1;
  let bestRumbo = 0;

  for (let i = 0; i < puntos.length; i++) {
    const j = (i + 1) % puntos.length;
    const dist = calcularDistanciaMetros(puntos[i], puntos[j]);
    if (dist > maxDist) {
      maxDist = dist;
      bestRumbo = calcularRumboGrados(puntos[i], puntos[j]);
    }
  }

  return Math.round(bestRumbo * 10) / 10;
}

/**
 * Generador geométrico de pasadas rectas / calles paralelas dentro del polígono.
 * - Recorta con precisión las rectas contra cualquier polígono (convexo o cóncavo).
 * - Espaciado en metros exactos.
 * - Rumbo/Azimut determinado.
 */
export function generarLineasGuia(
  polygon: LatLng[],
  anchoCalleMeters: number,
  rumboGrados: number,
  alternarSentido: boolean = true,
  minSegmentLengthMeters: number = 3
): LineSegment[] {
  if (polygon.length < 3 || anchoCalleMeters <= 0) return [];

  const origin = calcularCentroide(polygon);
  const metricPts = polygon.map((p) => proyectarLocal(p, origin));

  // Ángulo de orientación theta en radianes (desde el Norte hacia el Este)
  const theta = (rumboGrados * Math.PI) / 180;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Transformar coordenadas métricas a un sistema alineado (u = a lo largo de la calle, v = perpendicular)
  const rotPts = metricPts.map((pt) => ({
    u: pt.x * sinT + pt.y * cosT,
    v: pt.x * cosT - pt.y * sinT,
  }));

  // Encontrar límites transversales (vMin, vMax)
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const pt of rotPts) {
    if (pt.v < vMin) vMin = pt.v;
    if (pt.v > vMax) vMax = pt.v;
  }

  const vSpan = vMax - vMin;
  if (vSpan <= 0) return [];

  // Calcular pasadas centradas en el lote
  const numPasadas = Math.floor(vSpan / anchoCalleMeters);
  const resto = vSpan - numPasadas * anchoCalleMeters;
  let vStart = vMin + resto / 2 + anchoCalleMeters / 2;
  // Si el lote es menor al paso solicitado (ej: lote de 80m y paso de 100m), trazar 1 eje central en lugar de quedar vacío
  if (numPasadas === 0 && vSpan >= minSegmentLengthMeters) {
    vStart = vMin + vSpan / 2;
  }

  const rawSegments: { u1: number; u2: number; v: number }[] = [];
  const n = rotPts.length;

  for (let v = vStart; v < vMax; v += anchoCalleMeters) {
    // Intersecar línea horizontal v = cte con cada arista del polígono
    const intersections: number[] = [];

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const p1 = rotPts[i];
      const p2 = rotPts[j];

      if ((v >= p1.v && v < p2.v) || (v >= p2.v && v < p1.v)) {
        if (Math.abs(p2.v - p1.v) > 1e-7) {
          const t = (v - p1.v) / (p2.v - p1.v);
          const uInt = p1.u + t * (p2.u - p1.u);
          intersections.push(uInt);
        }
      }
    }

    // Ordenar intersecciones de menor a mayor
    intersections.sort((a, b) => a - b);

    // Emparejar de a dos (segmentos interiores)
    for (let k = 0; k < intersections.length - 1; k += 2) {
      const u1 = intersections[k];
      const u2 = intersections[k + 1];
      if (Math.abs(u2 - u1) >= minSegmentLengthMeters) {
        rawSegments.push({ u1, u2, v });
      }
    }
  }

  // Convertir segmentos de vuelta a WGS84
  const result: LineSegment[] = [];

  rawSegments.forEach((seg, idx) => {
    // Alternar sentido de avance si está activado (Boustrophedon)
    const reverse = alternarSentido && idx % 2 === 1;
    const startU = reverse ? seg.u2 : seg.u1;
    const endU = reverse ? seg.u1 : seg.u2;

    const startX = startU * sinT + seg.v * cosT;
    const startY = startU * cosT - seg.v * sinT;
    const endX = endU * sinT + seg.v * cosT;
    const endY = endU * cosT - seg.v * sinT;

    const startLatLng = desproyectarLocal({ x: startX, y: startY }, origin);
    const endLatLng = desproyectarLocal({ x: endX, y: endY }, origin);

    const lengthMeters = Math.round(Math.abs(seg.u2 - seg.u1) * 10) / 10;
    const bearing = calcularRumboGrados(startLatLng, endLatLng);

    result.push({
      id: `linea-${idx + 1}`,
      index: idx + 1,
      nombre: `Calle ${String(idx + 1).padStart(2, "0")}`,
      start: startLatLng,
      end: endLatLng,
      lengthMeters,
      bearing: Math.round(bearing * 10) / 10,
      headingName: obtenerNombreRumbo(bearing),
      tipo: "pasada_auto",
    });
  });

  return result;
}

/**
 * Parsea coordenadas en varios formatos comunes (decimales o grados)
 */
export function parsearCoordenadas(texto: string): LatLng | null {
  const clean = texto.trim();
  // Formato decimal simple: "-32.8908, -64.3496"
  const regexDec = /^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/;
  const matchDec = clean.match(regexDec);
  if (matchDec) {
    const lat = parseFloat(matchDec[1]);
    const lng = parseFloat(matchDec[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/**
 * Exportador KML 2.2 de alta fidelidad optimizado para Avenza Maps y Google Earth.
 * Formatea estilos limpios, de alto contraste y carpetas jerárquicas legibles al sol.
 */
export function generarKML(plan: LotePlan): string {
  const coordsPoly = plan.polygon
    .concat(plan.polygon[0] ? [plan.polygon[0]] : [])
    .map((p) => `${p.lng},${p.lat},0`)
    .join(" ");

  // Vértices del polígono como mojones perimetrales
  const verticesPlacemarks = plan.polygon
    .map((p, idx) => `
      <Placemark>
        <name>Vértice ${idx + 1}</name>
        <description>Coordenadas: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</description>
        <styleUrl>#pinVertexStyle</styleUrl>
        <Point>
          <coordinates>${p.lng},${p.lat},0</coordinates>
        </Point>
      </Placemark>`)
    .join("\n");

  // Pasadas rectas automáticas
  const lineasPlacemarks = plan.lineas
    .map((l) => {
      const coords = `${l.start.lng},${l.start.lat},0 ${l.end.lng},${l.end.lat},0`;
      return `
    <Placemark id="${l.id}">
      <name>${l.nombre}</name>
      <description><![CDATA[
        <b>Longitud:</b> ${l.lengthMeters.toLocaleString("es-AR")} m<br/>
        <b>Rumbo:</b> ${l.bearing}° (${l.headingName})<br/>
        <b>Inicio (A):</b> ${l.start.lat.toFixed(6)}, ${l.start.lng.toFixed(6)}<br/>
        <b>Fin (B):</b> ${l.end.lat.toFixed(6)}, ${l.end.lng.toFixed(6)}
      ]]></description>
      <styleUrl>#guiaLineStyle</styleUrl>
      <LineString>
        <extrude>0</extrude>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>`;
    })
    .join("\n");

  // Calles manuales
  const manualesPlacemarks = (plan.callesManuales || [])
    .map((l) => {
      const coords = `${l.start.lng},${l.start.lat},0 ${l.end.lng},${l.end.lat},0`;
      return `
    <Placemark id="${l.id}">
      <name>${l.nombre} (Manual)</name>
      <description><![CDATA[
        <b>Longitud:</b> ${l.lengthMeters.toLocaleString("es-AR")} m<br/>
        <b>Rumbo:</b> ${l.bearing}° (${l.headingName})<br/>
        <b>Inicio (A):</b> ${l.start.lat.toFixed(6)}, ${l.start.lng.toFixed(6)}<br/>
        <b>Fin (B):</b> ${l.end.lat.toFixed(6)}, ${l.end.lng.toFixed(6)}
      ]]></description>
      <styleUrl>#manualLineStyle</styleUrl>
      <LineString>
        <extrude>0</extrude>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>`;
    })
    .join("\n");

  // Waypoints / Obstáculos / Puntos de interés
  const waypointsPlacemarks = (plan.waypoints || [])
    .map((w) => {
      let style = "#pinWaypointStyle";
      if (w.tipo === "obstaculo") style = "#pinObstaculoStyle";
      if (w.tipo === "acceso") style = "#pinAccesoStyle";
      if (w.tipo === "combustible") style = "#pinCombustibleStyle";

      return `
    <Placemark id="${w.id}">
      <name>${w.nombre}</name>
      <description><![CDATA[
        <b>Tipo:</b> ${w.tipo.toUpperCase()}<br/>
        <b>Coordenadas:</b> ${w.lat.toFixed(6)}, ${w.lng.toFixed(6)}<br/>
        ${w.radioSeguridadMeters ? `<b>Radio de Seguridad:</b> ${w.radioSeguridadMeters} m<br/>` : ""}
        ${w.notas ? `<b>Notas:</b> ${w.notas}` : ""}
      ]]></description>
      <styleUrl>${style}</styleUrl>
      <Point>
        <coordinates>${w.lng},${w.lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join("\n");

  // Puntos A y B de cabecera
  const puntosPlacemarks = plan.lineas
    .map((l) => {
      return `
    <Placemark>
      <name>A - ${l.nombre}</name>
      <styleUrl>#pinStartStyle</styleUrl>
      <Point>
        <coordinates>${l.start.lng},${l.start.lat},0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>B - ${l.nombre}</name>
      <styleUrl>#pinEndStyle</styleUrl>
      <Point>
        <coordinates>${l.end.lng},${l.end.lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${plan.nombre || "Trazado de Lote y Calles"}</name>
    <description><![CDATA[
      <b>Superficie:</b> ${plan.areaHectareas.toLocaleString("es-AR")} Ha (${plan.areaM2.toLocaleString("es-AR")} m²)<br/>
      <b>Perímetro:</b> ${plan.perimetroMeters.toLocaleString("es-AR")} m<br/>
      <b>Ancho de Pasada:</b> ${plan.anchoCalleMeters} m<br/>
      <b>Rumbo Base:</b> ${plan.rumboGrados}°<br/>
      <b>Total Calles:</b> ${plan.lineas.length}<br/>
      <b>Distancia Total:</b> ${(plan.distanciaTotalMeters / 1000).toFixed(2)} km
    ]]></description>

    <!-- Estilos de Alta Visibilidad para Campo -->
    <Style id="polygonStyle">
      <LineStyle>
        <color>ff00ff00</color> <!-- Verde brillante -->
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>4d00ff00</color> <!-- Verde translúcido -->
      </PolyStyle>
    </Style>

    <Style id="guiaLineStyle">
      <LineStyle>
        <color>ff00d7ff</color> <!-- Amarillo/Naranja de Guía Agrícola/Vial -->
        <width>4</width>
      </LineStyle>
    </Style>

    <Style id="manualLineStyle">
      <LineStyle>
        <color>ffff00ff</color> <!-- Magenta brillante para calles maestras manuales -->
        <width>5</width>
      </LineStyle>
    </Style>

    <Style id="pinVertexStyle">
      <IconStyle>
        <scale>0.6</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinStartStyle">
      <IconStyle>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinEndStyle">
      <IconStyle>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinObstaculoStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinAccesoStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/blu-stars.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinCombustibleStyle">
      <IconStyle>
        <scale>0.9</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/gas_stations.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="pinWaypointStyle">
      <IconStyle>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Folder>
      <name>1. Perímetro del Terreno</name>
      <open>1</open>
      <Placemark>
        <name>${plan.nombre || "Lote Delimitado"}</name>
        <styleUrl>#polygonStyle</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${coordsPoly}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
      <Folder>
        <name>Vértices del Polígono</name>
        ${verticesPlacemarks}
      </Folder>
    </Folder>

    <Folder>
      <name>2. Líneas Guía / Calles Rectas (${plan.lineas.length})</name>
      <open>1</open>
      ${lineasPlacemarks}
    </Folder>

    ${(plan.callesManuales && plan.callesManuales.length > 0) ? `
    <Folder>
      <name>3. Calles Maestras Manuales (${plan.callesManuales.length})</name>
      <open>1</open>
      ${manualesPlacemarks}
    </Folder>` : ""}

    ${(plan.waypoints && plan.waypoints.length > 0) ? `
    <Folder>
      <name>4. Waypoints y Obstáculos (${plan.waypoints.length})</name>
      <open>1</open>
      ${waypointsPlacemarks}
    </Folder>` : ""}

    <Folder>
      <name>5. Puntos de Cabecera A-B</name>
      <open>0</open>
      ${puntosPlacemarks}
    </Folder>
  </Document>
</kml>`;
}

/**
 * Exportador de coordenadas a CSV para Banderilleros Satelitales y Planillas
 */
export function generarCSV(plan: LotePlan): string {
  const headers = [
    "Tipo_Elemento",
    "Identificador",
    "Longitud_Metros",
    "Rumbo_Grados",
    "Rumbo_Cardinal",
    "Punto_A_Lat",
    "Punto_A_Lng",
    "Punto_B_Lat",
    "Punto_B_Lng",
    "Notas",
  ];

  const rows: string[][] = [];

  // Vértices del polígono
  plan.polygon.forEach((p, idx) => {
    rows.push([
      "VERTICE_POLIGONO",
      `"Vértice ${idx + 1}"`,
      "0",
      "0",
      '""',
      p.lat.toFixed(7),
      p.lng.toFixed(7),
      '""',
      '""',
      `"Perímetro de Lote ${plan.nombre}"`,
    ]);
  });

  // Pasadas rectas
  plan.lineas.forEach((l) => {
    rows.push([
      "LINEA_PASADA_AB",
      `"${l.nombre}"`,
      l.lengthMeters.toFixed(1),
      l.bearing.toFixed(1),
      `"${l.headingName}"`,
      l.start.lat.toFixed(7),
      l.start.lng.toFixed(7),
      l.end.lat.toFixed(7),
      l.end.lng.toFixed(7),
      '"Pasada recta paralela"',
    ]);
  });

  // Calles manuales
  (plan.callesManuales || []).forEach((l) => {
    rows.push([
      "CALLE_MANUAL",
      `"${l.nombre}"`,
      l.lengthMeters.toFixed(1),
      l.bearing.toFixed(1),
      `"${l.headingName}"`,
      l.start.lat.toFixed(7),
      l.start.lng.toFixed(7),
      l.end.lat.toFixed(7),
      l.end.lng.toFixed(7),
      '"Calle trazada manualmente"',
    ]);
  });

  // Waypoints y Obstáculos
  (plan.waypoints || []).forEach((w) => {
    rows.push([
      `WAYPOINT_${w.tipo.toUpperCase()}`,
      `"${w.nombre}"`,
      "0",
      "0",
      '""',
      w.lat.toFixed(7),
      w.lng.toFixed(7),
      '""',
      '""',
      `"${w.notas || ""}"`,
    ]);
  });

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

/**
 * Exportador a GeoJSON estándar para interoperabilidad con QGIS, ArcGIS y Python
 */
export function generarGeoJSON(plan: LotePlan): string {
  const features: any[] = [];

  // Polígono
  if (plan.polygon.length >= 3) {
    const coords = plan.polygon
      .concat([plan.polygon[0]])
      .map((p) => [p.lng, p.lat]);

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coords],
      },
      properties: {
        tipo: "perimetro_lote",
        nombre: plan.nombre,
        areaHectareas: plan.areaHectareas,
        areaM2: plan.areaM2,
        perimetroMeters: plan.perimetroMeters,
      },
    });
  }

  // Pasadas rectas
  plan.lineas.forEach((l) => {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [l.start.lng, l.start.lat],
          [l.end.lng, l.end.lat],
        ],
      },
      properties: {
        tipo: "linea_guia_calle",
        nombre: l.nombre,
        longitudMeters: l.lengthMeters,
        rumboGrados: l.bearing,
        headingName: l.headingName,
      },
    });
  });

  // Calles manuales
  (plan.callesManuales || []).forEach((l) => {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [l.start.lng, l.start.lat],
          [l.end.lng, l.end.lat],
        ],
      },
      properties: {
        tipo: "calle_maestra_manual",
        nombre: l.nombre,
        longitudMeters: l.lengthMeters,
        rumboGrados: l.bearing,
        headingName: l.headingName,
      },
    });
  });

  // Waypoints
  (plan.waypoints || []).forEach((w) => {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [w.lng, w.lat],
      },
      properties: {
        tipo: "waypoint",
        categoria: w.tipo,
        nombre: w.nombre,
        radioSeguridadMeters: w.radioSeguridadMeters,
        notas: w.notas,
      },
    });
  });

  return JSON.stringify(
    {
      type: "FeatureCollection",
      name: plan.nombre || "Trazado Lote",
      features,
    },
    null,
    2
  );
}

/**
 * Disparador de descarga de archivo en el navegador
 */
export function descargarArchivo(contenido: string, nombreArchivo: string, mimeType: string) {
  const blob = new Blob([contenido], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface SnapResult {
  snappedPt: LatLng;
  isSnapped: boolean;
  tipo: "vertice" | "escuadra_90" | "recta_180" | "ninguno";
  label: string;
}

/**
 * Autoayuda de Snapping Inteligente:
 * - Magnético a vértices existentes (facilita cerrar el lote con precisión matemática)
 * - Escuadra ortogonal a 90° (perpendicular automática para campos rectangulares)
 * - Alineación a 180° (continuación perfectamente recta de un borde)
 */
export function calcularSnapInteligente(
  cursor: LatLng,
  puntos: LatLng[],
  snappingActivo: boolean = true,
  snapVertexDistMetros: number = 25,
  snapAngleTolGrados: number = 6
): SnapResult {
  if (!snappingActivo || puntos.length === 0) {
    return { snappedPt: cursor, isSnapped: false, tipo: "ninguno", label: "" };
  }

  // 1. Snap a vértice inicial (prioritario para cerrar el lote)
  if (puntos.length >= 3) {
    const distToFirst = calcularDistanciaMetros(cursor, puntos[0]);
    if (distToFirst <= snapVertexDistMetros) {
      return {
        snappedPt: puntos[0],
        isSnapped: true,
        tipo: "vertice",
        label: "🧲 Clic para Cerrar Lote (Inicio)",
      };
    }
  }

  // Snap a otros vértices
  for (let i = 1; i < puntos.length; i++) {
    const dist = calcularDistanciaMetros(cursor, puntos[i]);
    if (dist <= snapVertexDistMetros * 0.7) {
      return {
        snappedPt: puntos[i],
        isSnapped: true,
        tipo: "vertice",
        label: `🧲 Snap a Vértice ${i + 1}`,
      };
    }
  }

  // 2. Snap Ortogonal (Escuadra 90° o 180° recto) respecto al último segmento trazado
  if (puntos.length >= 2) {
    const lastPt = puntos[puntos.length - 1];
    const prevPt = puntos[puntos.length - 2];
    const origin = calcularCentroide([prevPt, lastPt, cursor]);

    const mPrev = proyectarLocal(prevPt, origin);
    const mLast = proyectarLocal(lastPt, origin);
    const mCursor = proyectarLocal(cursor, origin);

    const vSeg = { x: mLast.x - mPrev.x, y: mLast.y - mPrev.y };
    const segLen = Math.hypot(vSeg.x, vSeg.y);

    if (segLen > 0) {
      const vCur = { x: mCursor.x - mLast.x, y: mCursor.y - mLast.y };
      const curDist = Math.hypot(vCur.x, vCur.y);

      if (curDist > 5) {
        const segAngle = Math.atan2(vSeg.y, vSeg.x);
        const curAngle = Math.atan2(vCur.y, vCur.x);
        const diffDeg = ((curAngle - segAngle) * (180 / Math.PI) + 360) % 360;
        const tol = snapAngleTolGrados;

        // Escuadra 90° (derecha)
        if (Math.abs(diffDeg - 90) <= tol) {
          const snappedAngle = segAngle + Math.PI / 2;
          const snappedMetric = {
            x: mLast.x + curDist * Math.cos(snappedAngle),
            y: mLast.y + curDist * Math.sin(snappedAngle),
          };
          return {
            snappedPt: desproyectarLocal(snappedMetric, origin),
            isSnapped: true,
            tipo: "escuadra_90",
            label: "📐 Escuadra 90° (Perpendicular)",
          };
        }

        // Continuación recta 180°
        if (Math.abs(diffDeg) <= tol || Math.abs(diffDeg - 360) <= tol) {
          const snappedAngle = segAngle;
          const snappedMetric = {
            x: mLast.x + curDist * Math.cos(snappedAngle),
            y: mLast.y + curDist * Math.sin(snappedAngle),
          };
          return {
            snappedPt: desproyectarLocal(snappedMetric, origin),
            isSnapped: true,
            tipo: "recta_180",
            label: "➡️ Continuar Derecho (180°)",
          };
        }

        // Escuadra 90° (izquierda / 270°)
        if (Math.abs(diffDeg - 270) <= tol) {
          const snappedAngle = segAngle - Math.PI / 2;
          const snappedMetric = {
            x: mLast.x + curDist * Math.cos(snappedAngle),
            y: mLast.y + curDist * Math.sin(snappedAngle),
          };
          return {
            snappedPt: desproyectarLocal(snappedMetric, origin),
            isSnapped: true,
            tipo: "escuadra_90",
            label: "📐 Escuadra 90° (Perpendicular)",
          };
        }
      }
    }
  }

  return { snappedPt: cursor, isSnapped: false, tipo: "ninguno", label: "" };
}

/**
 * Auto-completa con precisión el 4to vértice de un lote rectangular / paralelogramo
 */
export function autoCompletarCuartoVertice(p1: LatLng, p2: LatLng, p3: LatLng): LatLng {
  const origin = calcularCentroide([p1, p2, p3]);
  const m1 = proyectarLocal(p1, origin);
  const m2 = proyectarLocal(p2, origin);
  const m3 = proyectarLocal(p3, origin);

  const m4 = {
    x: m3.x + (m1.x - m2.x),
    y: m3.y + (m1.y - m2.y),
  };

  return desproyectarLocal(m4, origin);
}

/**
 * Asistente de lote rápido: genera un rectángulo exacto por medidas métricas
 */
export function generarLotePorMedidas(
  centro: LatLng,
  anchoFrenteMetros: number,
  largoFondoMetros: number,
  rumboGrados: number
): LatLng[] {
  const theta = (rumboGrados * Math.PI) / 180;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  const hw = anchoFrenteMetros / 2;
  const hl = largoFondoMetros / 2;

  const esquinasRot = [
    { u: -hw, v: -hl },
    { u: hw, v: -hl },
    { u: hw, v: hl },
    { u: -hw, v: hl },
  ];

  return esquinasRot.map((pt) => {
    const x = pt.u * cosT - pt.v * sinT;
    const y = pt.u * sinT + pt.v * cosT;
    return desproyectarLocal({ x, y }, centro);
  });
}

/**
 * Genera pasadas paralelas libres espaciadas en metros (ej. cada 5 metros) a partir de una sola línea recta A-B,
 * tirando las líneas rectas hacia los lados "hasta el final" sin necesidad obligatoria de cerrar un polígono.
 */
export function generarPasadasDesdeLineaBase(
  lineaBase: { start: LatLng; end: LatLng },
  anchoMeters: number = 5,
  cantidadPasadas: number = 20,
  lado: "ambos" | "derecha" | "izquierda" = "derecha"
): LineSegment[] {
  const origin = calcularCentroide([lineaBase.start, lineaBase.end]);
  const mStart = proyectarLocal(lineaBase.start, origin);
  const mEnd = proyectarLocal(lineaBase.end, origin);

  const dx = mEnd.x - mStart.x;
  const dy = mEnd.y - mStart.y;
  const lengthMeters = Math.hypot(dx, dy);
  if (lengthMeters <= 0) return [];

  const bearing = calcularRumboGrados(lineaBase.start, lineaBase.end);
  const headingName = obtenerNombreRumbo(bearing);

  // Vector unitario normal (perpendicular a la derecha)
  const nx = dy / lengthMeters;
  const ny = -dx / lengthMeters;

  const offsets: number[] = [0]; // Incluye la línea base
  if (lado === "derecha" || lado === "ambos") {
    for (let i = 1; i <= cantidadPasadas; i++) offsets.push(i * anchoMeters);
  }
  if (lado === "izquierda" || lado === "ambos") {
    for (let i = 1; i <= cantidadPasadas; i++) offsets.push(-i * anchoMeters);
  }

  offsets.sort((a, b) => a - b);

  return offsets.map((offset, idx) => {
    const sX = mStart.x + offset * nx;
    const sY = mStart.y + offset * ny;
    const eX = mEnd.x + offset * nx;
    const eY = mEnd.y + offset * ny;

    const start = desproyectarLocal({ x: sX, y: sY }, origin);
    const end = desproyectarLocal({ x: eX, y: eY }, origin);

    const labelOffset = offset === 0 ? "Eje Base" : offset > 0 ? `+${offset}m` : `${offset}m`;

    return {
      id: `pasada-ab-${idx + 1}`,
      index: idx + 1,
      nombre: `Línea ${String(idx + 1).padStart(2, "0")} (${labelOffset})`,
      start,
      end,
      lengthMeters: Math.round(lengthMeters * 10) / 10,
      bearing: Math.round(bearing * 10) / 10,
      headingName,
      tipo: "pasada_auto",
    };
  });
}

export interface BordeMetrica {
  index: number;
  nombre: string;
  from: LatLng;
  to: LatLng;
  distanciaMetros: number;
  rumboGrados: number;
  headingName: string;
  anguloEsquinaGrados?: number;
  esEscuadra?: boolean;
}

export interface AuditoriaLote {
  bordes: BordeMetrica[];
  esCuadradoRecto: boolean;
  scoreRectitud: number; // 0 a 100%
  diferenciaLadosOpuestosMeters: number;
  mensajeSeguridad: string;
}

/**
 * Calcula las métricas exactas de cada borde del perímetro:
 * distancia precisa en metros, rumbo y ángulo de cada esquina
 */
export function calcularBordesPerimetro(polygon: LatLng[]): BordeMetrica[] {
  if (polygon.length < 2) return [];
  const n = polygon.length;
  const bordes: BordeMetrica[] = [];

  const origin = calcularCentroide(polygon);
  const mPts = polygon.map((p) => proyectarLocal(p, origin));
  const edgeCount = n >= 3 ? n : n - 1;

  for (let i = 0; i < edgeCount; i++) {
    const j = (i + 1) % n;
    const p1 = polygon[i];
    const p2 = polygon[j];
    const dist = Math.round(calcularDistanciaMetros(p1, p2) * 10) / 10;
    const rumbo = Math.round(calcularRumboGrados(p1, p2) * 10) / 10;

    // Calcular ángulo de la esquina en p1
    let anguloEsquina: number | undefined = undefined;
    let esEscuadra: boolean | undefined = undefined;

    if (n >= 3) {
      const prevIdx = (i - 1 + n) % n;
      const mPrev = mPts[prevIdx];
      const mCur = mPts[i];
      const mNext = mPts[j];

      const vIn = { x: mPrev.x - mCur.x, y: mPrev.y - mCur.y };
      const vOut = { x: mNext.x - mCur.x, y: mNext.y - mCur.y };

      const dot = vIn.x * vOut.x + vIn.y * vOut.y;
      const magIn = Math.hypot(vIn.x, vIn.y);
      const magOut = Math.hypot(vOut.x, vOut.y);

      if (magIn > 0 && magOut > 0) {
        const cosTheta = Math.max(-1, Math.min(1, dot / (magIn * magOut)));
        const angDeg = Math.round(Math.acos(cosTheta) * (180 / Math.PI) * 10) / 10;
        anguloEsquina = angDeg;
        esEscuadra = Math.abs(angDeg - 90) <= 3.0; // Margen de escuadra
      }
    }

    bordes.push({
      index: i + 1,
      nombre: `Lado ${i + 1} (P${i + 1} → P${j + 1})`,
      from: p1,
      to: p2,
      distanciaMetros: dist,
      rumboGrados: rumbo,
      headingName: obtenerNombreRumbo(rumbo),
      anguloEsquinaGrados: anguloEsquina,
      esEscuadra,
    });
  }

  return bordes;
}

/**
 * Realiza una auditoría completa de cuadratura y rectitud del lote
 */
export function auditarRectitudLote(polygon: LatLng[]): AuditoriaLote {
  const bordes = calcularBordesPerimetro(polygon);
  if (polygon.length !== 4) {
    return {
      bordes,
      esCuadradoRecto: false,
      scoreRectitud: polygon.length > 2 ? 70 : 0,
      diferenciaLadosOpuestosMeters: 0,
      mensajeSeguridad: polygon.length < 3 ? "Delimite el terreno para auditar la rectitud." : `Polígono de ${polygon.length} lados irregulares.`,
    };
  }

  // Comparar lados opuestos (Lado 1 vs Lado 3, Lado 2 vs Lado 4)
  const l1 = bordes[0].distanciaMetros;
  const l2 = bordes[1].distanciaMetros;
  const l3 = bordes[2].distanciaMetros;
  const l4 = bordes[3].distanciaMetros;

  const diff13 = Math.abs(l1 - l3);
  const diff24 = Math.abs(l2 - l4);
  const maxDiff = Math.max(diff13, diff24);

  const todasEscuadras = bordes.every((b) => b.esEscuadra === true);
  const ladosParalelos = maxDiff <= 5; // Menos de 5m de diferencia

  const esCuadradoRecto = todasEscuadras && ladosParalelos;
  let score = 100 - Math.min(60, maxDiff);
  if (!todasEscuadras) score -= 20;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let mensaje = "";
  if (esCuadradoRecto) {
    mensaje = "✅ Lote 100% Derecho: Esquinas a escuadra (90°) y lados paralelos verificados.";
  } else if (todasEscuadras) {
    mensaje = `⚠️ Esquinas a 90°, pero los lados opuestos difieren por ${maxDiff.toFixed(1)}m.`;
  } else {
    mensaje = `⚠️ El terreno presenta ligeras desviaciones angulares. Presiona "Cuadrar y Enderezar a 90°" para calibrarlo a la perfección.`;
  }

  return {
    bordes,
    esCuadradoRecto,
    scoreRectitud: score,
    diferenciaLadosOpuestosMeters: Math.round(maxDiff * 10) / 10,
    mensajeSeguridad: mensaje,
  };
}

/**
 * Endereza un polígono de 4 esquinas para convertirlo en un rectángulo con escuadras matemáticas exactas de 90°
 */
export function enderezarPoligonoCuadrado(polygon: LatLng[]): LatLng[] {
  if (polygon.length !== 4) return polygon;

  const origin = calcularCentroide(polygon);
  const mPts = polygon.map((p) => proyectarLocal(p, origin));

  const dx = mPts[1].x - mPts[0].x;
  const dy = mPts[1].y - mPts[0].y;
  const lenBase = Math.hypot(dx, dy);
  if (lenBase <= 0) return polygon;

  const ux = dx / lenBase;
  const uy = dy / lenBase;
  const vx = -uy;
  const vy = ux;

  const lateral1 = (mPts[2].x - mPts[1].x) * vx + (mPts[2].y - mPts[1].y) * vy;
  const lateral2 = (mPts[3].x - mPts[0].x) * vx + (mPts[3].y - mPts[0].y) * vy;
  const H = (lateral1 + lateral2) / 2;

  const newM0 = mPts[0];
  const newM1 = { x: newM0.x + lenBase * ux, y: newM0.y + lenBase * uy };
  const newM2 = { x: newM1.x + H * vx, y: newM1.y + H * vy };
  const newM3 = { x: newM0.x + H * vx, y: newM0.y + H * vy };

  return [
    desproyectarLocal(newM0, origin),
    desproyectarLocal(newM1, origin),
    desproyectarLocal(newM2, origin),
    desproyectarLocal(newM3, origin),
  ];
}

/**
 * Suaviza de forma inteligente un polígono dibujado groseramente
 * aplicando el algoritmo de Chaikin para generar curvas naturales
 * (para alambrados curvos, costas, bajos, cortinas forestales o cañadas).
 */
export function suavizarBordesCurvos(polygon: LatLng[], iteraciones: number = 1): LatLng[] {
  if (polygon.length < 3) return polygon;
  let pts = [...polygon];

  for (let it = 0; it < iteraciones; it++) {
    const newPts: LatLng[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];

      // Punto a 25% y punto a 75%
      const q: LatLng = {
        lat: 0.75 * p1.lat + 0.25 * p2.lat,
        lng: 0.75 * p1.lng + 0.25 * p2.lng,
      };
      const r: LatLng = {
        lat: 0.25 * p1.lat + 0.75 * p2.lat,
        lng: 0.25 * p1.lng + 0.75 * p2.lng,
      };
      newPts.push(q, r);
    }
    pts = newPts;
  }

  return pts;
}

/**
 * Proyecta una línea recta maestra a través del centro del lote
 * de borde a borde (horizontal 90°, vertical 0° o con cualquier rumbo).
 */
export function proyectarEjeCentral(polygon: LatLng[], rumboGrados: number): LineSegment | null {
  if (polygon.length < 3) return null;
  const origin = calcularCentroide(polygon);
  const metricPts = polygon.map((p) => proyectarLocal(p, origin));

  const theta = (rumboGrados * Math.PI) / 180;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // En el sistema rotado (u, v), el eje central que pasa por el centroide tiene v = 0
  const rotPts = metricPts.map((pt) => ({
    u: pt.x * sinT + pt.y * cosT,
    v: pt.x * cosT - pt.y * sinT,
  }));

  const v = 0;
  const n = rotPts.length;
  const intersections: number[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = rotPts[i];
    const p2 = rotPts[j];

    if ((v >= p1.v && v < p2.v) || (v >= p2.v && v < p1.v)) {
      if (Math.abs(p2.v - p1.v) > 1e-7) {
        const u = p1.u + ((v - p1.v) * (p2.u - p1.u)) / (p2.v - p1.v);
        intersections.push(u);
      }
    }
  }

  intersections.sort((a, b) => a - b);
  if (intersections.length < 2) return null;

  const uStart = intersections[0];
  const uEnd = intersections[intersections.length - 1];

  const mStart = {
    x: uStart * sinT + v * cosT,
    y: uStart * cosT - v * sinT,
  };
  const mEnd = {
    x: uEnd * sinT + v * cosT,
    y: uEnd * cosT - v * sinT,
  };

  const start = desproyectarLocal(mStart, origin);
  const end = desproyectarLocal(mEnd, origin);
  const dist = Math.round(calcularDistanciaMetros(start, end) * 10) / 10;
  const brng = Math.round(calcularRumboGrados(start, end) * 10) / 10;

  return {
    id: `eje-${Date.now()}`,
    index: 1,
    nombre: `Eje Central (${Math.round(rumboGrados)}° ${obtenerNombreRumbo(rumboGrados)})`,
    start,
    end,
    lengthMeters: dist,
    bearing: brng,
    headingName: obtenerNombreRumbo(brng),
    tipo: "calle_manual",
  };
}

export interface EjesLote {
  rumboLargo: number; // Rumbo a lo largo del lote (lado mayor)
  rumboAncho: number; // Rumbo a lo ancho del lote (perpendicular a 90°)
  nombreLargo: string;
  nombreAncho: string;
}

/**
 * Calcula los dos rumbos naturales del terreno (a lo largo y a lo ancho a 90°)
 * garantizando que las pasadas queden 100% paralelas a los alambrados y no cruzadas.
 */
export function calcularEjesLote(polygon: LatLng[]): EjesLote {
  if (polygon.length < 2) {
    return { rumboLargo: 0, rumboAncho: 90, nombreLargo: "Norte", nombreAncho: "Este" };
  }

  const bordes = calcularBordesPerimetro(polygon);
  if (bordes.length === 0) {
    return { rumboLargo: 0, rumboAncho: 90, nombreLargo: "Norte", nombreAncho: "Este" };
  }

  let maxBorde = bordes[0];
  for (const b of bordes) {
    if (b.distanciaMetros > maxBorde.distanciaMetros) {
      maxBorde = b;
    }
  }

  const rumboLargo = Math.round(maxBorde.rumboGrados * 10) / 10;
  const rumboAncho = Math.round(((rumboLargo + 90) % 360) * 10) / 10;

  return {
    rumboLargo,
    rumboAncho,
    nombreLargo: `A lo Largo (${Math.round(rumboLargo)}° ${obtenerNombreRumbo(rumboLargo)})`,
    nombreAncho: `A lo Ancho (${Math.round(rumboAncho)}° ${obtenerNombreRumbo(rumboAncho)})`,
  };
}




