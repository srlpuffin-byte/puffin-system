import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, PlayCircle, Fuel, Wrench, CheckSquare, ClipboardList, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  tip?: string;
  steps: string[];
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: <PlayCircle className="h-16 w-16" />,
    color: "text-blue-500",
    title: "🚜 Cómo iniciar una Jornada",
    description: "Antes de arrancar a trabajar, tenés que registrar el inicio de tu jornada en el sistema.",
    steps: [
      "Tocá el botón \"Iniciar Jornada\" en la pantalla principal",
      "Seleccioná tu nombre en el campo Operario",
      "Seleccioná la máquina que vas a usar ese día",
      "Ingresá el horómetro actual (lo ves en el tablero de la máquina)",
      "Completá el checklist de seguridad y estado del equipo",
      "Tocá \"Iniciar Jornada\" y ¡listo!",
    ],
    tip: "💡 Si ya tenés una jornada en curso, el sistema te va a avisar antes de crear otra.",
  },
  {
    icon: <Fuel className="h-16 w-16" />,
    color: "text-orange-500",
    title: "⛽ Registrar Carga de Combustible",
    description: "Cada vez que cargás combustible, tenés que registrarlo en el sistema.",
    steps: [
      "Andá al menú y tocá \"Combustible\"",
      "Tocá el botón \"Registrar Carga\"",
      "Seleccioná la máquina que cargaste",
      "Ingresá los litros cargados y el precio por litro",
      "Agregá la estación de servicio y el km/horómetro actual",
      "Si querés, sacá una foto del ticket y adjuntala",
    ],
    tip: "💡 El sistema calcula el importe total automáticamente.",
  },
  {
    icon: <Wrench className="h-16 w-16" />,
    color: "text-red-500",
    title: "🔧 Reportar un Problema o Incidente",
    description: "Si la máquina tiene alguna falla o pasó algo en el trabajo, registralo de inmediato.",
    steps: [
      "Andá al menú y tocá \"Incidentes\"",
      "Tocá \"Reportar Incidente\"",
      "Describí qué pasó con el mayor detalle posible",
      "Seleccioná el tipo de incidente y la máquina afectada",
      "Si podés, sacá una foto de la falla",
      "Enviá el reporte — el administrador recibirá una notificación",
    ],
    tip: "💡 No esperes para reportar problemas. Cuanto antes se registra, más fácil es solucionarlo.",
  },
  {
    icon: <CheckSquare className="h-16 w-16" />,
    color: "text-green-500",
    title: "✅ Finalizar la Jornada",
    description: "Al terminar el día o cuando dejes de usar la máquina, cerrá la jornada.",
    steps: [
      "En la pantalla de Jornadas, buscá tu jornada \"EN CURSO\"",
      "Tocá el botón rojo \"Finalizar Jornada\"",
      "Ingresá el horómetro final (número actual del tablero)",
      "Completá las observaciones si hay algo para aclarar",
      "Confirmá el cierre",
    ],
    tip: "💡 Es importante cerrar la jornada para que el sistema calcule correctamente las horas trabajadas.",
  },
  {
    icon: <ClipboardList className="h-16 w-16" />,
    color: "text-purple-500",
    title: "📋 Ver tu Historial",
    description: "Podés ver todas tus jornadas, cargas de combustible y documentos desde el menú.",
    steps: [
      "Tocá el menú (≡) arriba a la izquierda",
      "En \"Jornadas\" ves todo tu historial de trabajo",
      "En \"Combustible\" ves las cargas que registraste",
      "En \"Mis Datos\" podés ver y actualizar tu información personal",
    ],
    tip: "💡 Si necesitás ver algo específico, usá el buscador (🔍) arriba a la derecha.",
  },
  {
    icon: <User className="h-16 w-16" />,
    color: "text-slate-500",
    title: "👤 Tus Datos Personales",
    description: "Mantené tus datos actualizados para que la empresa pueda contactarte cuando sea necesario.",
    steps: [
      "Andá a \"Mis Datos\" desde el menú",
      "Revisá que tu teléfono esté correcto",
      "Si tenés un contacto familiar, verificá que esté cargado",
      "Tu foto de perfil aparece en las jornadas que iniciás",
    ],
    tip: "💡 Si algo está mal en tus datos, avisale al administrador para que lo corrija.",
  },
];

interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialDialog({ open, onOpenChange }: TutorialDialogProps) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isFirst = step === 0;

  const handleClose = () => {
    setStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Header with gradient */}
        <div className={cn("flex flex-col items-center justify-center py-10 px-6 text-white relative", 
          step === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700" :
          step === 1 ? "bg-gradient-to-br from-orange-400 to-orange-600" :
          step === 2 ? "bg-gradient-to-br from-red-400 to-red-600" :
          step === 3 ? "bg-gradient-to-br from-green-500 to-green-700" :
          step === 4 ? "bg-gradient-to-br from-purple-500 to-purple-700" :
          "bg-gradient-to-br from-slate-500 to-slate-700"
        )}>
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="text-white/90 mb-3">{current.icon}</div>
          <h2 className="text-xl font-bold text-center">{current.title}</h2>
          <p className="text-sm text-white/80 text-center mt-2">{current.description}</p>
        </div>

        {/* Steps list */}
        <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
          {current.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700">{s}</p>
            </div>
          ))}

          {current.tip && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <p className="text-xs text-amber-800">{current.tip}</p>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="px-5 pb-5 flex items-center justify-between border-t pt-4">
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === step ? "bg-primary w-4" : "bg-slate-300"
                )}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={handleClose}>
                ¡Entendido! ✓
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
