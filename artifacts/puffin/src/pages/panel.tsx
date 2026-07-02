import React from "react";
import { useGetDashboardResumen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Clock, Droplets, HardHat, Settings, Truck } from "lucide-react";

export function Panel() {
  const { data: resumen, isLoading } = useGetDashboardResumen();

  if (isLoading) {
    return <div className="text-center p-12">Cargando panel...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Panel de Control</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Máquinas Activas</CardTitle>
            <Truck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumen?.maquinas_activas || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Detenidas / Mantenimiento</CardTitle>
            <Settings className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(resumen?.maquinas_detenidas || 0) + (resumen?.maquinas_mantenimiento || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
            <HardHat className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumen?.empleados_activos || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Activas</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumen?.alertas_activas || 0}</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">Métricas del Mes</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
            <Droplets className="h-8 w-8 text-blue-500 mb-2" />
            <div className="text-3xl font-bold">{resumen?.litros_mes || 0} L</div>
            <p className="text-sm text-muted-foreground">Combustible</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
            <Clock className="h-8 w-8 text-orange-500 mb-2" />
            <div className="text-3xl font-bold">{resumen?.horas_mes || 0} h</div>
            <p className="text-sm text-muted-foreground">Horas Trabajadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
            <Settings className="h-8 w-8 text-slate-500 mb-2" />
            <div className="text-3xl font-bold">{resumen?.mantenimientos_mes || 0}</div>
            <p className="text-sm text-muted-foreground">Mantenimientos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
            <div className="text-3xl font-bold">{resumen?.disponibilidad || 0}%</div>
            <p className="text-sm text-muted-foreground">Disponibilidad</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
