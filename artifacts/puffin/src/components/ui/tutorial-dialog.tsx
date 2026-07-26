import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Play, Pause, ChevronLeft, ChevronRight, RotateCcw, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const STEP_DURATION = 8000; // ms per full step

interface SubStep {
  text: string;
}

interface TutorialStep {
  emoji: string;
  title: string;
  donde: string; // navigation path
  image: string;
  substeps: SubStep[];
  tip: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    emoji: "🚜",
    title: "Cómo iniciar una Jornada",
    donde: "Menú  →  Jornadas  →  botón \"Iniciar Jornada\"",
    image: "/tutorial/step1.png",
    substeps: [
      { text: "Abrí el menú tocando las tres líneas (☰) arriba a la izquierda" },
      { text: "Tocá \"Jornadas\" en la lista del menú" },
      { text: "Tocá el botón azul \"Iniciar Jornada\" en la parte de arriba" },
      { text: "Elegí tu nombre en el campo \"Operario\"" },
      { text: "Elegí la máquina que vas a usar ese día" },
      { text: "Ingresá el número del horómetro que ves en el tablero de la máquina" },
    ],
    tip: "⚠️ Si ya hay una jornada iniciada con esa máquina, el sistema te avisa antes de continuar.",
  },
  {
    emoji: "📋",
    title: "Completar el Checklist",
    donde: "Formulario de Jornada  →  tabs: Seguridad / Mecánica",
    image: "/tutorial/step2.png",
    substeps: [
      { text: "Seleccioná el estado del equipo (Bueno, Regular o Malo)" },
      { text: "Escribí la ubicación o nombre de la obra donde vas a trabajar" },
      { text: "Tocá el tab \"2. Seguridad\" y activá los ítems que verificaste" },
      { text: "Tocá el tab \"3. Mecánica\" y verificá niveles de aceite, agua y neumáticos" },
      { text: "Si querés, sacá fotos del estado del equipo en el tab \"4. Fotos\"" },
      { text: "Tocá el botón \"Iniciar Jornada\" al final para guardar todo" },
    ],
    tip: "⚠️ Los campos con * son obligatorios. Sin completarlos no podés guardar la jornada.",
  },
  {
    emoji: "⛽",
    title: "Cómo registrar combustible",
    donde: "Menú  →  Combustible  →  botón \"Registrar Carga\"",
    image: "/tutorial/step3.png",
    substeps: [
      { text: "Abrí el menú y tocá \"Combustible\"" },
      { text: "Tocá el botón \"Registrar Carga\" en la parte de arriba" },
      { text: "Seleccioná la máquina a la que le cargaste combustible" },
      { text: "Ingresá los litros que cargaste y el precio por litro" },
      { text: "Escribí el nombre de la estación de servicio" },
      { text: "Si tenés el ticket, sacale una foto y adjuntala. Después tocá Guardar" },
    ],
    tip: "💡 El sistema calcula el importe total solo. Solo tenés que ingresar los litros y el precio.",
  },
  {
    emoji: "✅",
    title: "Cómo finalizar la Jornada",
    donde: "Menú  →  Jornadas  →  tu jornada EN CURSO  →  \"Finalizar Jornada\"",
    image: "/tutorial/step4.png",
    substeps: [
      { text: "Abrí el menú y tocá \"Jornadas\"" },
      { text: "Buscá la tarjeta con el badge naranja que dice \"EN CURSO\"" },
      { text: "Esa tarjeta tiene el botón rojo \"Finalizar Jornada\" abajo" },
      { text: "Tocá ese botón rojo" },
      { text: "Ingresá el horómetro final (el número actual del tablero)" },
      { text: "Agregá observaciones si hay algo para aclarar y confirmá" },
    ],
    tip: "⚠️ Es muy importante finalizar la jornada al terminar. Sin esto no se calculan las horas trabajadas del día.",
  },
  {
    emoji: "📅",
    title: "Cómo ver tu historial",
    donde: "Menú  →  Jornadas  (jornadas pasadas aparecen abajo)",
    image: "/tutorial/step5.png",
    substeps: [
      { text: "Abrí el menú y tocá \"Jornadas\"" },
      { text: "Las jornadas de días anteriores aparecen en la lista con badge verde \"FINALIZADA\"" },
      { text: "Cada tarjeta muestra la máquina, fecha, hora de inicio, hora de fin y total de horas" },
      { text: "Para ver el combustible que cargaste andá al menú y tocá \"Combustible\"" },
      { text: "Si no encontrás algo, usá el ícono de lupa 🔍 arriba a la derecha para buscar" },
    ],
    tip: "💡 Si ves algún dato incorrecto en tu historial, avisale al encargado para que lo corrija.",
  },
];

interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialDialog({ open, onOpenChange }: TutorialDialogProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0); // 0..STEP_DURATION ms
  const [transitioning, setTransitioning] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  // Which sub-step is "active" based on elapsed time
  const activeSubstep = Math.min(
    Math.floor((elapsed / STEP_DURATION) * current.substeps.length),
    current.substeps.length - 1
  );

  const progress = Math.min((elapsed / STEP_DURATION) * 100, 100);

  const goTo = useCallback((nextStep: number, autoplay = true) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setElapsed(0);
      setTransitioning(false);
      if (autoplay) setPlaying(true);
    }, 250);
  }, []);

  const handleClose = () => {
    setStep(0);
    setElapsed(0);
    setPlaying(true);
    onOpenChange(false);
  };

  // Ticker
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!playing || !open) return;

    const TICK = 50;
    tickRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + TICK;
        if (next >= STEP_DURATION) {
          if (!isLast) {
            goTo(step + 1, true);
          } else {
            setPlaying(false);
          }
          return STEP_DURATION;
        }
        return next;
      });
    }, TICK);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [playing, open, step, isLast, goTo]);

  // Reset on open
  useEffect(() => {
    if (open) { setStep(0); setElapsed(0); setPlaying(true); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 rounded-2xl flex flex-col" style={{ maxHeight: "92vh" }}>

        {/* ── TOP: IMAGE ── */}
        <div className="relative flex-shrink-0 bg-slate-900" style={{ height: "220px" }}>
          <img
            key={step}
            src={current.image}
            alt={current.title}
            className={cn(
              "w-full h-full object-cover object-top transition-opacity duration-250",
              transitioning ? "opacity-0" : "opacity-100"
            )}
          />

          {/* Top gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent pointer-events-none" />

          {/* Close */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Step dots */}
          <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-white" : i < step ? "w-3 bg-white/60" : "w-3 bg-white/30"
                )}
              />
            ))}
          </div>

          {/* Paso N de N */}
          <div className="absolute top-3 left-3 bg-black/50 text-white text-xs font-bold px-2 py-1 rounded-full">
            Paso {step + 1} de {TUTORIAL_STEPS.length}
          </div>
        </div>

        {/* ── PROGRESS BAR ── */}
        <div className="h-1.5 bg-slate-200 flex-shrink-0 w-full">
          <div
            className="h-full bg-primary transition-none rounded-r-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── DESCRIPTION PANEL (scrollable) ── */}
        <div className="flex-1 overflow-y-auto bg-white px-4 pt-3 pb-2">

          {/* Title */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{current.emoji}</span>
            <h2 className="font-bold text-base text-slate-800 leading-tight">{current.title}</h2>
          </div>

          {/* WHERE TO GO */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
            <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wide mb-0.5">Dónde ir en la app</p>
              <p className="text-sm font-semibold text-blue-800">{current.donde}</p>
            </div>
          </div>

          {/* Sub-steps — active one is highlighted */}
          <div className="space-y-2">
            {current.substeps.map((s, i) => {
              const isActive = i === activeSubstep;
              const isDone = i < activeSubstep;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg px-3 py-2 transition-all duration-300",
                    isActive ? "bg-primary/10 border border-primary/30" : "bg-transparent"
                  )}
                >
                  <span className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5 transition-colors duration-300",
                    isActive ? "bg-primary text-white" : isDone ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {isDone ? "✓" : i + 1}
                  </span>
                  <p className={cn(
                    "text-sm leading-snug transition-colors duration-300",
                    isActive ? "text-slate-900 font-semibold" : isDone ? "text-slate-400 line-through" : "text-slate-600"
                  )}>
                    {s.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Tip */}
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-sm text-amber-800">{current.tip}</p>
          </div>
        </div>

        {/* ── CONTROLS ── */}
        <div className="flex-shrink-0 border-t bg-white px-4 py-3 flex items-center justify-between">

          {/* Prev */}
          <button
            disabled={step === 0}
            onClick={() => { goTo(step - 1, false); setPlaying(false); }}
            className={cn(
              "h-10 w-10 rounded-full border flex items-center justify-center transition-colors",
              step === 0 ? "opacity-30 cursor-not-allowed border-slate-200" : "border-slate-300 hover:bg-slate-50"
            )}
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>

          {/* Play / Pause / Restart */}
          {isLast && !playing ? (
            <button
              onClick={() => goTo(0, true)}
              className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Ver de nuevo
            </button>
          ) : (
            <button
              onClick={() => setPlaying(p => !p)}
              className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center text-white shadow-md transition-all active:scale-95",
                playing ? "bg-slate-700 hover:bg-slate-800" : "bg-primary hover:bg-primary/90"
              )}
            >
              {playing
                ? <Pause className="h-5 w-5" />
                : <Play className="h-5 w-5 ml-0.5" />
              }
            </button>
          )}

          {/* Next */}
          <button
            disabled={isLast}
            onClick={() => { goTo(step + 1, false); setPlaying(false); }}
            className={cn(
              "h-10 w-10 rounded-full border flex items-center justify-center transition-colors",
              isLast ? "opacity-30 cursor-not-allowed border-slate-200" : "border-slate-300 hover:bg-slate-50"
            )}
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
