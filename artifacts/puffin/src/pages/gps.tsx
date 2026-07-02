import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Satellite, Radio, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Maquina {
  id: number;
  nombre: string;
  tipo: string;
  estado: string;
  patente?: string;
  horometro: number;
  kilometros: number;
}

const GEOCERCAS = [
  { id: 1, nombre: "Zona de Trabajo - Obra Central", estado: "activa", radio: "500 m", tipo: "circular" },
  { id: 2, nombre: "Depósito Principal", estado: "activa", radio: "200 m", tipo: "circular" },
  { id: 3, nombre: "Área de Mantenimiento", estado: "activa", radio: "150 m", tipo: "circular" },
];

function estadoColor(estado: string) {
  if (estado === "activa") return "bg-green-600";
  if (estado === "mantenimiento") return "bg-yellow-600";
  return "bg-red-600";
}

function estadoLabel(estado: string) {
  if (estado === "activa") return "Activa";
  if (estado === "mantenimiento") return "Mantenimiento";
  return "Detenida";
}

export function Gps() {
  const { data: maquinas = [] } = useQuery<Maquina[]>({
    queryKey: ["maquinas"],
    queryFn: () => apiFetch("/maquinas"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MapPin className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-primary">GPS y Rastreo</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-600">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{maquinas.filter((m) => m.estado === "activa").length}</div>
                <p className="text-xs text-muted-foreground">Dentro del área</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-600">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold">{maquinas.filter((m) => m.estado === "mantenimiento").length}</div>
                <p className="text-xs text-muted-foreground">En mantenimiento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold">{maquinas.filter((m) => m.estado === "detenida").length}</div>
                <p className="text-xs text-muted-foreground">Detenidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-dashed border-slate-300">
        <CardContent className="py-0">
          <div className="h-80 flex flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-slate-100 p-6">
              <Satellite className="h-14 w-14 text-slate-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-600">Mapa en Tiempo Real</p>
              <p className="text-sm text-slate-500 mt-1">Integración con Xpert Satcom configurada en</p>
              <p className="text-sm font-mono text-primary mt-1">/integrations/xpert</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-4 py-2 rounded-full">
              <Radio className="h-3 w-3" />
              Conectar dispositivos GPS para visualizar posiciones en tiempo real
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5" /> Estado de la Flota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {maquinas.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No hay maquinaria registrada</p>
              )}
              {maquinas.map((maq) => (
                <div key={maq.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${estadoColor(maq.estado)}`} />
                    <div>
                      <p className="font-medium text-sm">{maq.nombre}</p>
                      <p className="text-xs text-muted-foreground">{maq.tipo}{maq.patente ? ` · ${maq.patente}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{Number(maq.horometro).toFixed(0)} h</div>
                      <div>{Number(maq.kilometros).toFixed(0)} km</div>
                    </div>
                    <Badge className={`${estadoColor(maq.estado)} text-white text-xs`}>
                      {estadoLabel(maq.estado)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Geocercas Configuradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {GEOCERCAS.map((gc) => (
                <div key={gc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-green-600" />
                    <div>
                      <p className="font-medium text-sm">{gc.nombre}</p>
                      <p className="text-xs text-muted-foreground">Radio: {gc.radio} · {gc.tipo}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-600 text-white text-xs">Activa</Badge>
                </div>
              ))}
              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-muted-foreground">
                Las geocercas se configuran desde la integración con AmericanGIS. Cuando una máquina salga del área permitida se generará una alerta roja automáticamente.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
