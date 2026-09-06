const BASE_URL = process.env.SATCOM_BASE_URL || "https://satcom.rastreo.com.ar/api";
const TOKEN = process.env.SATCOM_TOKEN || "wycuxj26ptcymd0wvpjs5v7mx6ildm";

export interface SatcomDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate?: string;
  positionId: number;
}

export interface SatcomPosition {
  id: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
  attributes: {
    ignition?: boolean;
    hours?: number;
    distance?: number;
    motion?: boolean;
    [key: string]: any;
  };
}

export function isPositionEngineOn(position: any, deviceStatus?: string, checkRealtimeLiveness: boolean = false): boolean {
  if (!position) return false;

  // Si se solicita verificar si está en marcha en vivo en este preciso instante
  if (checkRealtimeLiveness) {
    if (deviceStatus && deviceStatus !== "online") return false;
    const timestamp = position.fixTime || position.deviceTime;
    if (!timestamp) return false;
    const ageMinutes = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60);
    if (isNaN(ageMinutes) || ageMinutes > 15) return false;
  }

  if (position.attributes?.ignition === true) return true;
  if (position.attributes?.motion === true) return true;
  if (typeof position.speed === "number" && position.speed > 0.5) return true;
  if (position.attributes?.io0 === true) return true;
  return false;
}

export class SatcomClient {
  private static getHeaders() {
    return {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    };
  }

  static async getDevices(): Promise<SatcomDevice[]> {
    try {
      const res = await fetch(`${BASE_URL}/devices`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`Satcom API Error: ${res.statusText}`);
      return (await res.json()) as SatcomDevice[];
    } catch (e) {
      console.error("Error fetching devices from Satcom", e);
      return [];
    }
  }

  static async getPosition(positionId: number): Promise<SatcomPosition | null> {
    try {
      const res = await fetch(`${BASE_URL}/positions?id=${positionId}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`Satcom API Error: ${res.statusText}`);
      const data = (await res.json()) as any[];
      return data[0] || null;
    } catch (e) {
      console.error("Error fetching position from Satcom", e);
      return null;
    }
  }

  static async getPositionsBulk(positionIds: number[]): Promise<SatcomPosition[]> {
    if (!positionIds.length) return [];
    try {
      const params = positionIds.map(id => `id=${id}`).join("&");
      const res = await fetch(`${BASE_URL}/positions?${params}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`Satcom API Error: ${res.statusText}`);
      return (await res.json()) as SatcomPosition[];
    } catch (e) {
      console.error("Error fetching bulk positions from Satcom", e);
      return [];
    }
  }

  static async getDeviceTrack(deviceId: number, from: string, to: string): Promise<SatcomPosition[]> {
    try {
      const url = `${BASE_URL}/positions?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`Satcom API Error: ${res.statusText}`);
      const data = (await res.json()) as SatcomPosition[];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error("Error fetching device track from Satcom", e);
      return [];
    }
  }
}
