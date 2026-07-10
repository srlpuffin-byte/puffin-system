import React, { useState } from "react";
import { useGetCalendarioEventos } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/ui/export-buttons";

export function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const { data: eventos, isLoading } = useGetCalendarioEventos({ 
    mes: currentDate.getMonth() + 1, 
    anio: currentDate.getFullYear() 
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const exportColumns = [
    { header: "Fecha", key: "fecha", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Título", key: "titulo" },
    { header: "Entidad", key: "entidad_nombre" },
    { header: "Prioridad", key: "prioridad", formatter: (v: string) => v?.toUpperCase() }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Calendario de Operaciones</h1>
        <div className="flex items-center gap-4">
          {eventos && (
            <ExportButtons 
              data={eventos} 
              columns={exportColumns} 
              filename={`Reporte_Calendario_${format(currentDate, "MM_yyyy")}`} 
              title={`Eventos - ${format(currentDate, "MMMM yyyy", { locale: es })}`} 
            />
          )}
          <Button variant="outline" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-lg font-medium w-48 text-center capitalize">
            {format(currentDate, "MMMM yyyy", { locale: es })}
          </span>
          <Button variant="outline" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
              <div key={day} className="py-2 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[120px]">
            {daysInMonth.map((day, i) => {
              const dayEvents = eventos?.filter(e => isSameDay(new Date(e.fecha), day)) || [];
              
              return (
                <div 
                  key={day.toString()} 
                  className={`border-b border-r last:border-r-0 p-2 ${i % 7 === 6 ? 'border-r-0' : ''}`}
                  style={{ gridColumnStart: i === 0 ? day.getDay() + 1 : 'auto' }}
                >
                  <div className="text-right text-sm font-medium mb-1">
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[80px]">
                    {dayEvents.map(event => (
                      <div 
                        key={event.id} 
                        className={`text-xs px-1 py-0.5 rounded truncate ${
                          event.prioridad === 'rojo' ? 'bg-red-100 text-red-800' :
                          event.prioridad === 'amarillo' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}
                        title={`${event.titulo} - ${event.entidad_nombre || ''}`}
                      >
                        {event.titulo}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
