import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetProyecto } from "@/hooks/use-proyectos";
import { useGetEmpleados } from "@workspace/api-client-react";
import { useGetMaquinas } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, MapPin, Activity, DollarSign, Users, Tractor, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export function ProyectoFicha() {
  const { id } = useParams();
  const proyectoId = parseInt(id || "0", 10);
  
  const { data: proyecto, isLoading } = useGetProyecto(proyectoId);
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();

  if (isLoading) return <div className="p-8 text-center">Cargando proyecto...</div>;
  if (!proyecto) return <div className="p-8 text-center text-red-500">Proyecto no encontrado</div>;

  const assignedEmpleados = empleados?.filter(e => proyecto.empleados_asignados?.includes(e.id)) || [];
  const assignedMaquinas = maquinas?.filter(m => proyecto.maquinas_asignadas?.includes(m.id)) || [];

  const estadoBadge = (estado: string) => {
    if (estado === "activo") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVO</Badge>;
    if (estado === "finalizado") return <Badge variant="secondary">FINALIZADO</Badge>;
    return <Badge variant="outline">{estado.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/proyectos">
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-3">
            {proyecto.lugar}
            {estadoBadge(proyecto.estado)}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" /> Proyecto ID: {proyecto.id} • Creado el {format(new Date(proyecto.createdAt), "dd/MM/yyyy")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Datos Comerciales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Hectáreas
              </p>
              <p className="font-medium text-lg">{parseFloat(proyecto.hectareas).toLocaleString('es-AR')} Has.</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Precio por Hectárea
              </p>
              <p className="font-medium text-lg">${parseFloat(proyecto.precio_hectarea).toLocaleString('es-AR')}</p>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground font-medium">Ganancia Estimada</p>
              <p className="font-bold text-2xl text-green-700">
                ${parseFloat(proyecto.ganancia_estimada || "0").toLocaleString('es-AR', {minimumFractionDigits: 2})}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Personal Asignado
              </CardTitle>
              <CardDescription>Empleados trabajando actualmente en este proyecto</CardDescription>
            </CardHeader>
            <CardContent>
              {assignedEmpleados.length === 0 ? (
                <p className="text-muted-foreground italic">No hay empleados asignados a este proyecto.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {assignedEmpleados.map(e => (
                    <Link key={e.id} href={`/operarios/${e.id}`}>
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group">
                        <div className="flex flex-col">
                          <span className="font-medium">{e.nombre} {e.apellido}</span>
                          <span className="text-xs text-muted-foreground">Empleado</span>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tractor className="h-5 w-5 text-amber-600" />
                Maquinaria e Inventario
              </CardTitle>
              <CardDescription>Maquinaria asignada a este proyecto</CardDescription>
            </CardHeader>
            <CardContent>
              {assignedMaquinas.length === 0 ? (
                <p className="text-muted-foreground italic">No hay maquinarias asignadas a este proyecto.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {assignedMaquinas.map(m => (
                    <Link key={m.id} href={`/maquinas/${m.id}`}>
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group">
                        <div className="flex flex-col">
                          <span className="font-medium">{m.nombre}</span>
                          <span className="text-xs text-muted-foreground">{m.marca} {m.modelo}</span>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
