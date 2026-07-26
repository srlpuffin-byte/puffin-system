import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Play, Pause, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const STEP_DURATION = 5000; // ms per step

interface TutorialStep {
  bgGradient: string;
  emoji: string;
  title: string;
  subtitle: string;
  image: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    emoji: "🚜",
    bgGradient: "from-blue-600 to-blue-800",
    title: "Iniciar una Jornada",
    subtitle: "Tocá \"Iniciar Jornada\" → elegí tu nombre y la máquina → ingresá el horómetro → confirmá",
    image: "/tutorial/step1.png",
  },
  {
    emoji: "📋",
    bgGradient: "from-indigo-600 to-indigo-800",
    title: "Completar el Formulario",
    subtitle: "Completá General, Seguridad y Mecánica → activá los ítems del checklist → guardá",
    image: "/tutorial/step2.png",
  },
  {
    emoji: "⛽",
    bgGradient: "from-orange-500 to-orange-700",
    title: "Registrar Combustible",
    subtitle: "Andá a Combustible → \"Registrar Carga\" → máquina, litros, precio, estación",
    image: "/tutorial/step3.png",
  },
  {
    emoji: "✅",
    bgGradient: "from-green-600 to-green-800",
    title: "Finalizar la Jornada",
    subtitle: "Buscá tu jornada EN CURSO → tocá \"Finalizar Jornada\" → ingresá horómetro final",
    image: "/tutorial/step4.png",
  },
  {
    emoji: "📅",
    bgGradient: "from-purple-600 to-purple-800",
    title: "Ver tu Historial",
    subtitle: "En Jornadas ves todo tu historial → las FINALIZADAS muestran las horas totales",
    image: "/tutorial/step5.png",
  },
];

interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialDialog({ open, onOpenChange }: TutorialDialogProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  const goTo = useCallback((nextStep: number, autoplay = true) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setProgress(0);
      setTransitioning(false);
      if (autoplay) setPlaying(true);
    }, 300);
  }, []);

  const handleClose = () => {
    setStep(0);
    setProgress(0);
    setPlaying(true);
    onOpenChange(false);
  };

  const restart = () => {
    goTo(0, true);
  };

  // Progress ticker
  useEffect(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    if (!playing || !open) return;

    const tickMs = 50;
    progressRef.current = setInterval(() => {
      setProgress(prev => {
        const next = prev + (tickMs / STEP_DURATION) * 100;
        if (next >= 100) {
          // Advance to next step
          if (!isLast) {
            goTo(step + 1, true);
          } else {
            setPlaying(false);
          }
          return 100;
        }
        return next;
      });
    }, tickMs);

    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [playing, open, step, isLast, goTo]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0);
      setProgress(0);
      setPlaying(true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 rounded-2xl">

        {/* === IMAGE AREA === */}
        <div className="relative w-full bg-slate-900" style={{ height: "340px" }}>

          {/* Image with fade transition */}
          <img
            key={step}
            src={current.image}
            alt={current.title}
            className={cn(
              "w-full h-full object-cover object-top transition-opacity duration-300",
              transitioning ? "opacity-0" : "opacity-100"
            )}
          />

          {/* Dark gradient overlay at top and bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 bg-black/40 text-white rounded-full p-1 hover:bg-black/60 transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Step counter (top left) */}
          <div className="absolute top-3 left-3 bg-black/40 text-white text-xs font-semibold px-2 py-1 rounded-full">
            {step + 1} / {TUTORIAL_STEPS.length}
          </div>

          {/* Step dots (top center) */}
          <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-white" : i < step ? "w-3 bg-white/60" : "w-3 bg-white/30"
                )}
              />
            ))}
          </div>

          {/* Title overlay at bottom of image */}
          <div className={cn(
            "absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8 transition-opacity duration-300",
            transitioning ? "opacity-0" : "opacity-100"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{current.emoji}</span>
              <h2 className="text-white font-bold text-lg leading-tight">{current.title}</h2>
            </div>
            <p className="text-white/80 text-xs leading-snug">{current.subtitle}</p>
          </div>
        </div>

        {/* === PROGRESS BAR === */}
        <div className="h-1 bg-slate-200 w-full">
          <div
            className="h-full bg-primary transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* === CONTROLS === */}
        <div className="flex items-center justify-between px-4 py-3 bg-white">

          {/* Prev */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={step === 0}
            onClick={() => { goTo(step - 1, false); setPlaying(false); }}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Play / Pause / Restart */}
          <div className="flex items-center gap-2">
            {isLast && !playing ? (
              <Button
                size="sm"
                className="rounded-full px-4 gap-2"
                onClick={restart}
              >
                <RotateCcw className="h-4 w-4" /> Ver de nuevo
              </Button>
            ) : (
              <button
                onClick={() => setPlaying(p => !p)}
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95",
                  playing ? "bg-slate-700" : "bg-primary"
                )}
              >
                {playing
                  ? <Pause className="h-5 w-5" />
                  : <Play className="h-5 w-5 ml-0.5" />
                }
              </button>
            )}
          </div>

          {/* Next */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={isLast}
            onClick={() => { goTo(step + 1, false); setPlaying(false); }}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Close button text */}
        <div className="pb-3 text-center">
          <button onClick={handleClose} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Cerrar tutorial
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
