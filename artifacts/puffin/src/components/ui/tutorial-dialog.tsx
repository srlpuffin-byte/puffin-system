import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  color: string;
  bgGradient: string;
  emoji: string;
  title: string;
  description: string;
  steps: string[];
  tip?: string;
  image: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    emoji: "🚜",
    color: "text-blue-600",
    bgGradient: "from-blue-500 to-blue-700",
    title: "Iniciar una Jornada",
    description: "Antes de arrancar a trabajar, registrá el inicio de tu jornada.",
    image: "/tutorial/step1.png",
    steps: [
      "Tocá \"Iniciar Jornada\" en la pantalla de Jornadas",
      "Seleccioná tu nombre como Operario",
      "Elegí la máquina que vas a usar",
      "Ingresá el horómetro actual (número del tablero)",
      "Completá el estado del equipo y checklist",
    ],
    tip: "💡 El sistema avisa si ya hay una jornada en curso con esa máquina.",
  },
  {
    emoji: "📋",
    color: "text-indigo-600",
    bgGradient: "from-indigo-500 to-indigo-700",
    title: "Completar el Formulario",
    description: "Llená todos los datos requeridos antes de confirmar.",
    image: "/tutorial/step2.png",
    steps: [
      "Completá los 4 tabs: General, Seguridad, Mecánica y Fotos",
      "En Seguridad y Mecánica: activá los ítems que verificaste",
      "Opcional: sacá fotos del estado del equipo",
      "Tocá \"Iniciar Jornada\" al final para confirmar",
    ],
    tip: "💡 Los campos marcados con * son obligatorios. Sin ellos no podés guardar.",
  },
  {
    emoji: "⛽",
    color: "text-orange-600",
    bgGradient: "from-orange-400 to-orange-600",
    title: "Registrar Combustible",
    description: "Cada carga de combustible debe registrarse en el sistema.",
    image: "/tutorial/step3.png",
    steps: [
      "Andá a \"Combustible\" desde el menú",
      "Tocá \"Registrar Carga\"",
      "Seleccioná la máquina y completá los litros y precio",
      "Agregá la estación de servicio y km/horómetro",
      "Si tenés el ticket, sacale una foto y adjuntala",
    ],
    tip: "💡 El importe total se calcula solo. Solo ingresás litros y precio.",
  },
  {
    emoji: "✅",
    color: "text-green-600",
    bgGradient: "from-green-500 to-green-700",
    title: "Finalizar la Jornada",
    description: "Al terminar el día, cerrá la jornada correctamente.",
    image: "/tutorial/step4.png",
    steps: [
      "En Jornadas, buscá tu jornada \"EN CURSO\"",
      "Tocá el botón rojo \"Finalizar Jornada\"",
      "Ingresá el horómetro final (número actual del tablero)",
      "Agregá observaciones si hay algo para aclarar",
      "Confirmá el cierre",
    ],
    tip: "💡 Sin finalizar la jornada, el sistema no puede calcular las horas trabajadas.",
  },
  {
    emoji: "📅",
    color: "text-purple-600",
    bgGradient: "from-purple-500 to-purple-700",
    title: "Ver tu Historial",
    description: "Podés ver todas tus jornadas y registros desde el menú.",
    image: "/tutorial/step5.png",
    steps: [
      "En \"Jornadas\" ves todo tu historial de trabajo",
      "Las jornadas FINALIZADAS aparecen con las horas totales",
      "En \"Combustible\" ves las cargas que registraste",
      "Usá el buscador 🔍 para encontrar algo específico",
    ],
    tip: "💡 Si algo está mal en un registro, avisale al administrador.",
  },
];

interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialDialog({ open, onOpenChange }: TutorialDialogProps) {
  const [step, setStep] = useState(0);
  const [imgExpanded, setImgExpanded] = useState(false);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isFirst = step === 0;

  const handleClose = () => {
    setStep(0);
    setImgExpanded(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 max-h-[92vh] flex flex-col">

        {/* Colored header */}
        <div className={cn("bg-gradient-to-br text-white px-5 pt-5 pb-4 flex-shrink-0 relative", current.bgGradient)}>
          <button onClick={handleClose} className="absolute top-3 right-3 text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="text-3xl mb-1">{current.emoji}</div>
          <h2 className="text-lg font-bold leading-tight">{current.title}</h2>
          <p className="text-sm text-white/80 mt-1">{current.description}</p>
        </div>

        {/* Screenshot */}
        <div
          className="bg-slate-100 flex-shrink-0 cursor-zoom-in overflow-hidden"
          style={{ maxHeight: imgExpanded ? "280px" : "160px", transition: "max-height 0.3s" }}
          onClick={() => setImgExpanded(v => !v)}
        >
          <img
            src={current.image}
            alt={`Paso ${step + 1}: ${current.title}`}
            className="w-full object-cover object-top"
            style={{ maxHeight: imgExpanded ? "280px" : "160px", objectFit: "cover", objectPosition: "top" }}
          />
          <div className="text-center text-[10px] text-slate-400 py-0.5">
            {imgExpanded ? "Tocá para reducir" : "Tocá la imagen para ampliar"}
          </div>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {current.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-snug">{s}</p>
            </div>
          ))}
          {current.tip && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <p className="text-xs text-amber-800">{current.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-3 border-t flex items-center justify-between flex-shrink-0">
          {/* Dots */}
          <div className="flex gap-1.5">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => { setStep(i); setImgExpanded(false); }}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === step ? "bg-primary w-5" : "bg-slate-300 w-2"
                )}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => { setStep(s => s - 1); setImgExpanded(false); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={handleClose} className="bg-green-600 hover:bg-green-700">
                ¡Listo! ✓
              </Button>
            ) : (
              <Button size="sm" onClick={() => { setStep(s => s + 1); setImgExpanded(false); }}>
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
