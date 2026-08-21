import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, MapPin, Wrench, CheckCircle2, XCircle, AlertTriangle, User, Tractor, Info, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

// Mapa de etiquetas legibles para cada ítem del checklist
const CHECKLIST_LABELS: Record<string, string> = {
  cinturon: "Cinturón de seguridad",
  bocina: "Bocina",
  luces_delanteras: "Luces delanteras",
  luces_traseras: "Luces traseras",
  balizas: "Balizas",
  espejos: "Espejos",
  matafuego: "Matafuego (Presencia)",
  nivel_aceite: "Nivel de aceite",
  nivel_combustible: "Nivel de combustible",
  nivel_refrigerante: "Nivel de refrigerante",
  perdidas: "Ausencia de pérdidas (aceite/agua)",
  neumaticos: "Estado de neumáticos / orugas",
  luces_advertencia: "Tablero sin luces de advertencia",
};

interface VerJornadaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jornada: any;
}

export function VerJornadaDialog({ open, onOpenChange, jornada }: VerJornadaDialogProps) {
  const [, setLocation] = useLocation();
  if (!jornada) return null;

  const irAFichaMaquina = () => {
    if (!jornada.maquina_id) return;
    onOpenChange(false);
    setTimeout(() => setLocation(`/maquinas/${jornada.maquina_id}`), 150);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b">
          <div className="flex items-start justify-between pr-6">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                Detalles de la Jornada
                <Badge 
                  variant={jornada.estado === "en_curso" ? "outline" : "secondary"}
                  className={jornada.estado === "en_curso" ? "text-blue-600 border-blue-600" : ""}
                >
                  {jornada.estado?.toUpperCase().replace("_", " ")}
                </Badge>
              </DialogTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {jornada.fecha ? format(new Date(jornada.fecha + "T12:00:00"), "dd/MM/yyyy") : "Sin fecha"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            
            {/* Info del Operario y Máquina — al principio */}
            <div className="bg-slate-50 border rounded-md p-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                <div className="flex items-center gap-3">
                  {jornada.empleado_foto ? (
                    <img src={jornada.empleado_foto} alt="Operario" className="w-12 h-12 rounded-full object-cover border flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0"><User className="w-6 h-6 text-slate-500" /></div>
                  )}
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase text-[10px]">Operario</p>
                    <p className="font-medium text-sm">{jornada.empleado_nombre || "-"}</p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3 cursor-pointer rounded-md p-1.5 -m-1.5 hover:bg-blue-50 hover:border hover:border-blue-200 transition-colors group"
                  onClick={irAFichaMaquina}
                  title="Ver ficha de la máquina"
                >
                  {jornada.maquina_foto ? (
                    <img src={jornada.maquina_foto} alt="Máquina" className="w-12 h-12 rounded-md object-cover border flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-slate-200 flex items-center justify-center flex-shrink-0"><Tractor className="w-6 h-6 text-slate-500" /></div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-muted-foreground uppercase text-[10px]">Máquina</p>
                    <p className="font-medium text-sm flex items-center gap-1">
                      {jornada.maquina_nombre || "-"}
                      <ExternalLink className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </p>
                    {jornada.maquina_descripcion && <p className="text-muted-foreground mt-0.5">{jornada.maquina_descripcion}</p>}
                    {jornada.tipo_trabajo && <p className="text-muted-foreground mt-0.5">Trabajo: {jornada.tipo_trabajo}</p>}
                  </div>
                </div>

                <div className="md:col-span-2 mt-1 pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <p className="font-semibold text-red-600 uppercase text-[10px] mb-0.5">📍 Ubicación (Operario reporta):</p>
                    <p className="font-medium">{jornada.ubicacion || "-"}{jornada.nombre_obra ? ` (${jornada.nombre_obra})` : ""}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-700 uppercase text-[10px] mb-0.5">🏢 Máquina asignada en (Sistema):</p>
                    <p className="font-medium">{jornada.maquina_asignada_en || "No asignada a ningún proyecto"}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Time & Counters */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Horarios y Contadores</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border rounded-md p-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Inicio</p>
                  <p className="font-medium text-lg">{jornada.hora_inicio || "-"}</p>
                </div>
                <div className="border rounded-md p-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Fin</p>
                  <p className="font-medium text-lg">{jornada.hora_fin || "-"}</p>
                </div>
                <div className="border rounded-md p-3 bg-blue-50/50">
                  <p className="text-[10px] uppercase text-blue-700 font-semibold">H. Inicio</p>
                  <p className="font-medium text-lg">{jornada.horometro_inicio != null ? jornada.horometro_inicio : "-"}</p>
                </div>
                <div className="border rounded-md p-3 bg-blue-50/50">
                  <p className="text-[10px] uppercase text-blue-700 font-semibold">H. Fin</p>
                  <p className="font-medium text-lg">{jornada.horometro_fin != null ? jornada.horometro_fin : "-"}</p>
                </div>
                
                <div className="border rounded-md p-3 bg-slate-100 md:col-span-2">
                  <p className="text-[10px] uppercase text-slate-700 font-semibold">Total Horas Reloj (Empleado)</p>
                  <p className="font-bold text-xl">
                    {jornada.horas_reloj != null && Number(jornada.horas_reloj) >= 0
                      ? `${parseFloat(Number(jornada.horas_reloj).toFixed(2))} h`
                      : "-"}
                  </p>
                </div>
                
                <div className="border rounded-md p-3 bg-blue-100 md:col-span-2">
                  <p className="text-[10px] uppercase text-blue-800 font-semibold">Total Horas Máquina (Horómetro)</p>
                  <p className="font-bold text-xl text-blue-700">
                    {jornada.horas_trabajadas != null && Number(jornada.horas_trabajadas) >= 0
                      ? `${parseFloat(Number(jornada.horas_trabajadas).toFixed(2))} h`
                      : "-"}
                  </p>
                </div>

                {jornada.km_inicio != null && (
                  <div className="border rounded-md p-3 bg-amber-50/50">
                    <p className="text-[10px] uppercase text-amber-700 font-semibold">KM Inicio</p>
                    <p className="font-medium text-lg">{jornada.km_inicio}</p>
                  </div>
                )}
                {jornada.km_fin != null && (
                  <div className="border rounded-md p-3 bg-amber-50/50">
                    <p className="text-[10px] uppercase text-amber-700 font-semibold">KM Fin</p>
                    <p className="font-medium text-lg">{jornada.km_fin}</p>
                  </div>
                )}
                
                <div className="col-span-2 md:col-span-full border rounded-md p-3 bg-green-50/50 flex justify-between items-center">
                  <p className="text-sm uppercase text-green-800 font-bold">Total Horas Trabajadas</p>
                  <p className="font-bold text-2xl text-green-700">{jornada.horas_trabajadas != null ? `${jornada.horas_trabajadas} h` : "-"}</p>
                </div>
              </div>
            </div>

            {/* Checklist & Status */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Estado del Equipo y Checklist</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 border rounded-md p-4">
                  <h4 className="text-[10px] font-semibold uppercase text-muted-foreground mb-2 border-b pb-1">Condiciones Iniciales</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estado General:</span>
                    <span className={`font-medium capitalize ${
                      jornada.estado_equipo_inicio === "apto" ? "text-green-600" :
                      jornada.estado_equipo_inicio === "apto_observaciones" ? "text-yellow-600" :
                      jornada.estado_equipo_inicio === "no_apto" ? "text-red-600" : ""
                    }`}>{jornada.estado_equipo_inicio?.replace(/_/g, " ") || "-"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nivel Combustible:</span>
                    <span className="font-medium">{jornada.combustible_nivel || "-"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estado Aceite:</span>
                    <span className="font-medium">{jornada.aceite_estado || "-"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Daños/Choques:</span>
                    <span className="font-medium">{jornada.danos_choques || "Ninguno"}</span>
                  </div>
                </div>

                <div className="space-y-3 border rounded-md p-4">
                  <h4 className="text-[10px] font-semibold uppercase text-muted-foreground mb-2 border-b pb-1">Condiciones Finales</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estado Cierre:</span>
                    <span className={`font-medium capitalize ${
                      jornada.estado_equipo_fin === "sin_novedades" ? "text-green-600" :
                      jornada.estado_equipo_fin === "con_observaciones" ? "text-yellow-600" :
                      jornada.estado_equipo_fin === "requiere_mantenimiento" ? "text-orange-600" :
                      jornada.estado_equipo_fin === "fuera_de_servicio" ? "text-red-600" : ""
                    }`}>{jornada.estado_equipo_fin?.replace(/_/g, " ") || "-"}</span>
                  </div>
                  <div className="flex flex-col text-sm mt-2">
                    <span className="text-muted-foreground mb-1">Problemas / Novedades:</span>
                    <span className={jornada.problemas ? "font-medium text-red-600 p-2 bg-red-50 rounded text-xs" : "font-medium text-muted-foreground"}>{jornada.problemas || "Ninguno"}</span>
                  </div>
                </div>
              </div>

              {/* Checklist preoperacional detallado */}
              {jornada.checklist_previo && (() => {
                let items: Record<string, boolean> = {};
                try { items = JSON.parse(jornada.checklist_previo); } catch { return null; }
                const keys = Object.keys(items);
                if (keys.length === 0) return null;
                const aprobados = keys.filter(k => items[k]).length;
                return (
                  <div className="mt-4 border rounded-md p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-semibold uppercase text-muted-foreground border-b pb-1 flex-1">Checklist Preoperacional</h4>
                      <span className={`text-xs font-bold ml-3 px-2 py-0.5 rounded-full ${
                        aprobados === keys.length ? "bg-green-100 text-green-700" :
                        aprobados >= keys.length / 2 ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>{aprobados}/{keys.length} OK</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {keys.map(key => (
                        <div key={key} className={`flex items-center gap-2 text-sm p-2 rounded ${
                          items[key] ? "bg-green-50" : "bg-red-50"
                        }`}>
                          {items[key]
                            ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                          <span className={items[key] ? "text-green-800" : "text-red-700"}>
                            {CHECKLIST_LABELS[key] || key}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Descripción y Observaciones — siempre se muestran si existen */}
            {(jornada.descripcion_trabajo || jornada.observaciones) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info className="w-4 h-4" /> Descripción y Observaciones</h3>
                <div className="space-y-3">
                  {jornada.descripcion_trabajo && (
                    <div className="border rounded-md p-3 text-sm">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">Descripción del Trabajo</p>
                      <p>{jornada.descripcion_trabajo}</p>
                    </div>
                  )}
                  {jornada.observaciones && (
                    <div className="border rounded-md p-3 text-sm bg-amber-50/50 border-amber-200">
                      <p className="text-[10px] uppercase text-amber-700 font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Observaciones del Operario</p>
                      <p className="text-amber-900">{jornada.observaciones}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            

            {/* Fotos de tablero — solo si existen */}
            {(jornada.foto_tablero_inicio || jornada.foto_tablero_fin) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info className="w-4 h-4" /> Fotos del Tablero</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {jornada.foto_tablero_inicio && (
                    <div className="border rounded-md p-2 flex flex-col items-center">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Tablero (Inicio)</p>
                      <a href={jornada.foto_tablero_inicio} target="_blank" rel="noreferrer" className="relative block w-full h-48 group">
                        <img src={jornada.foto_tablero_inicio} alt="Tablero Inicio" className="w-full h-full object-cover rounded cursor-pointer group-hover:opacity-90 transition" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity rounded-b pointer-events-none">
                          Ver imagen original
                        </div>
                      </a>
                    </div>
                  )}
                  {jornada.foto_tablero_fin && (
                    <div className="border rounded-md p-2 flex flex-col items-center">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Tablero (Fin)</p>
                      <a href={jornada.foto_tablero_fin} target="_blank" rel="noreferrer" className="relative block w-full h-48 group">
                        <img src={jornada.foto_tablero_fin} alt="Tablero Fin" className="w-full h-full object-cover rounded cursor-pointer group-hover:opacity-90 transition" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity rounded-b pointer-events-none">
                          Ver imagen original
                        </div>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
