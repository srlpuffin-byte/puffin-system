import React from "react";
import { useGetActividad } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function Actividad() {
  const { data: actividades, isLoading } = useGetActividad({ limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Historial de Actividad</h1>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8">Cargando actividad...</div>
          ) : actividades?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay actividad reciente.</div>
          ) : (
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              {actividades?.map((act) => (
                <div key={act.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <span className="text-xs font-bold uppercase">{act.tipo.substring(0, 2)}</span>
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded border shadow">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-slate-900 capitalize">{act.tipo.replace('_', ' ')}</div>
                      <time className="font-medium text-sm text-slate-500">
                        {format(new Date(act.fecha), "dd/MM/yyyy HH:mm")}
                      </time>
                    </div>
                    <div className="text-sm text-slate-500">{act.descripcion}</div>
                    <div className="mt-2 text-xs font-semibold text-primary">
                      {act.usuario_nombre} {act.entidad_nombre ? `• ${act.entidad_nombre}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
