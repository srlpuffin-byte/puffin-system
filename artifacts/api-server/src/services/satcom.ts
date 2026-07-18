const BASE_URL = "https://satcom.rastreo.com.ar/api";
const TOKEN = "wycuxj26ptcymd0wvpjs5v7mx6ildm";

export interface SatcomDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  positionId: number;
}

export interface SatcomPosition {
  id: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  attributes: {
    ignition?: boolean;
    hours?: number;
    distance?: number;
    [key: string]: any;
  };
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
}
