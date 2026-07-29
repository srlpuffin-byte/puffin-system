import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, MapPin, Wrench, CheckCircle2, AlertTriangle, User, Tractor, Info } from "lucide-react";

interface VerJornadaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jornada: any;
}

export function VerJornadaDialog({ open, onOpenChange, jornada }: VerJornadaDialogProps) {
  if (!jornada) return null;

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
                {jornada.fecha ? format(new Date(jornada.fecha), "dd/MM/yyyy") : "Sin fecha"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            
            {/* General Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full"><User className="w-4 h-4 text-primary" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Operario</p>
                  <p className="font-medium text-sm">{jornada.empleado_nombre || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full"><Tractor className="w-4 h-4 text-primary" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Máquina</p>
                  <p className="font-medium text-sm">{jornada.maquina_nombre || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full"><MapPin className="w-4 h-4 text-primary" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Ubicación / Obra</p>
                  <p className="font-medium text-sm">{jornada.ubicacion || "-"} {jornada.nombre_obra ? `(${jornada.nombre_obra})` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full"><Wrench className="w-4 h-4 text-primary" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Tipo de Trabajo</p>
                  <p className="font-medium text-sm">{jornada.tipo_trabajo || "-"}</p>
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
                    <span className="font-medium capitalize">{jornada.estado_equipo_inicio?.replace(/_/g, " ") || "-"}</span>
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
                    <span className="font-medium capitalize">{jornada.estado_equipo_fin?.replace(/_/g, " ") || "-"}</span>
                  </div>
                  <div className="flex flex-col text-sm mt-2">
                    <span className="text-muted-foreground mb-1">Problemas / Novedades:</span>
                    <span className={jornada.problemas ? "font-medium text-red-600 p-2 bg-red-50 rounded text-xs" : "font-medium"}>{jornada.problemas || "Ninguno"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observaciones */}
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
                    <div className="border rounded-md p-3 text-sm bg-amber-50/30">
                      <p className="text-[10px] uppercase text-amber-700 font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Observaciones</p>
                      <p>{jornada.observaciones}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Fotos */}
            {(jornada.foto_tablero_inicio || jornada.foto_tablero_fin) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info className="w-4 h-4" /> Fotos (Evidencia)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {jornada.foto_tablero_inicio && (
                    <div className="border rounded-md p-2 flex flex-col items-center">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Tablero (Inicio)</p>
                      <a href={jornada.foto_tablero_inicio} target="_blank" rel="noreferrer">
                         <img src={jornada.foto_tablero_inicio} alt="Tablero Inicio" className="w-full h-48 object-cover rounded cursor-pointer hover:opacity-90 transition" />
                      </a>
                    </div>
                  )}
                  {jornada.foto_tablero_fin && (
                    <div className="border rounded-md p-2 flex flex-col items-center">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Tablero (Fin)</p>
                      <a href={jornada.foto_tablero_fin} target="_blank" rel="noreferrer">
                         <img src={jornada.foto_tablero_fin} alt="Tablero Fin" className="w-full h-48 object-cover rounded cursor-pointer hover:opacity-90 transition" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
