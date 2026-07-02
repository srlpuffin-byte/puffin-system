import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Layers, Grid3x3, Route, Shield, Settings } from "lucide-react";

const FEATURES = [
  { icon: Grid3x3, label: "Lotes y Campos", desc: "Definición de lotes, campos y sectores de trabajo" },
  { icon: MapPin, label: "Geocercas", desc: "Áreas permitidas, prohibidas y zonas de trabajo" },
  { icon: Route, label: "Recorridos", desc: "Trazado y seguimiento de rutas autorizadas" },
  { icon: Shield, label: "Áreas de cobertura", desc: "Control de cobertura realizada por máquina" },
  { icon: Layers, label: "Obras y Sectores", desc: "Gestión de obras activas por ubicación" },
  { icon: Settings, label: "Configuración", desc: "Integración con servidor AmericanGIS" },
];

export function Americangis() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-green-600 p-2">
          <MapPin className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">AmericanGIS</h1>
          <p className="text-sm text-muted-foreground">Integración de información geográfica y gestión de áreas</p>
        </div>
        <Badge variant="secondary" className="ml-auto">Integración pendiente</Badge>
      </div>

      <Card className="border-l-4 border-l-yellow-500 bg-yellow-50">
        <CardContent className="pt-4">
          <p className="text-sm text-yellow-800">
            Esta integración requiere configurar las credenciales de conexión con el servidor AmericanGIS. 
            Contactá al administrador del sistema para activar esta funcionalidad.
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-dashed border-slate-300">
        <CardContent className="py-0">
          <div className="h-72 flex flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-slate-100 p-6">
              <Layers className="h-14 w-14 text-slate-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-600">Visor de Campos y Lotes</p>
              <p className="text-sm text-slate-500 mt-1">Una vez configurada la integración, aquí se visualizarán</p>
              <p className="text-sm text-slate-500">los campos, lotes, recorridos y cobertura de máquinas</p>
            </div>
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Lotes</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Máquinas</span>
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">Recorridos</span>
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Cobertura</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.label} className="opacity-75">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <f.icon className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{f.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Configuración de conexión</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Endpoint API</span>
              <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">https://api.americangis.com.ar/v1</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Estado de conexión</span>
              <Badge variant="secondary">Sin configurar</Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Módulo</span>
              <span className="font-mono text-xs">/integrations/americangis</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
