import React, { useState } from "react";
import { Clock, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetJornadas, useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export function JornadaAlertaBanner() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { data: jornadasResp } = useGetJornadas({ limit: 10 });
  const [dismissedJornadaId, setDismissedJornadaId] = useState<number | null>(null);

  const jornadas = jornadasResp?.data || [];
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";

  // Buscar si hay alguna jornada activa > 12h
  const jornadaExcedida = jornadas.find((j: any) => {
    if (j.estado !== "en_curso") return false;
    if (dismissedJornadaId === j.id) return false;

    // Si es empleado, solo mostrar la que le pertenece a él
    if (isEmpleado && user?.nombre) {
      const match = String(j.empleado_nombre || "").toLowerCase().includes(user.nombre.toLowerCase());
      if (!match) return false;
    }

    let startTime = j.createdAt ? new Date(j.createdAt).getTime() : 0;
    if (j.fecha) {
      const fechaStr = String(j.fecha).split("T")[0];
      const horaStr = j.hora_inicio || "07:00";
      const parsed = new Date(`${fechaStr}T${horaStr.length === 5 ? horaStr + ":00" : horaStr}`).getTime();
      if (!isNaN(parsed) && parsed > 0) startTime = parsed;
    }
    if (!startTime) return false;

    const hours = (Date.now() - startTime) / (1000 * 60 * 60);
    return hours >= 12;
  });

  if (!jornadaExcedida) return null;

  let horas = 12;
  const jExAny = jornadaExcedida as any;
  let startTime = (jExAny.createdAt || jExAny.created_at) ? new Date(jExAny.createdAt || jExAny.created_at).getTime() : 0;
  if (jornadaExcedida.fecha) {
    const fechaStr = String(jornadaExcedida.fecha).split("T")[0];
    const horaStr = jornadaExcedida.hora_inicio || "07:00";
    const parsed = new Date(`${fechaStr}T${horaStr.length === 5 ? horaStr + ":00" : horaStr}`).getTime();
    if (!isNaN(parsed) && parsed > 0) startTime = parsed;
  }
  if (startTime) {
    horas = Math.floor((Date.now() - startTime) / (1000 * 60 * 60));
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-transparent border-b border-amber-500/30 px-3 py-2 sm:px-4 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 bg-amber-500 text-white rounded-full shrink-0 animate-pulse">
          <Clock className="h-3.5 w-3.5" />
        </div>
        <p className="text-foreground font-medium truncate sm:text-clip">
          <strong className="text-amber-700 dark:text-amber-400 font-bold">Recordatorio de Jornada (+12h):</strong>{" "}
          {isEmpleado ? "Tu jornada" : `La jornada de ${jornadaExcedida.empleado_nombre || "operario"}`} en{" "}
          <strong>{jornadaExcedida.maquina_nombre || "el equipo"}</strong> lleva más de{" "}
          <strong>{horas} hs abierta</strong>. Por favor registrá el cierre y el horómetro final.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="h-7 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          onClick={() => setLocation("/jornadas")}
        >
          <Square className="h-3 w-3 mr-1 fill-current" />
          Finalizar Jornada
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissedJornadaId(jornadaExcedida.id)}
          title="Ocultar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
export default JornadaAlertaBanner;
