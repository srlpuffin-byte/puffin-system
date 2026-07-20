import { useState } from "react";
import { Smartphone, Share, MoreVertical, PlusSquare, CheckCircle, Download, Apple, Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type OS = "ios" | "android" | "desktop";

function detectOS(): OS {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export default function Instalar() {
  const [os, setOs] = useState<OS>(detectOS);
  const [installed, setInstalled] = useState(false);

  // For Android/Desktop: use the browser's install prompt when available
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1B2B5E] to-[#111827] flex flex-col items-center justify-start px-4 pt-10 pb-20">
      {/* Logo + Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center mb-4 overflow-hidden">
          <img src="/favicon.png" alt="PUFFIN" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-2xl font-bold text-white">PUFFIN SRL</h1>
        <p className="text-blue-200 text-sm mt-1">Sistema de Gestión Operacional</p>
      </div>

      {/* Already installed */}
      {installed && (
        <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-xl px-5 py-3 text-green-300 text-sm mb-6 font-semibold">
          <CheckCircle className="h-5 w-5 shrink-0" />
          ¡Listo! La app fue instalada en tu dispositivo.
        </div>
      )}

      {/* OS Selector */}
      <div className="flex gap-2 bg-white/10 rounded-xl p-1 mb-6">
        <button
          onClick={() => setOs("ios")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${os === "ios" ? "bg-white text-[#1B2B5E] shadow" : "text-white/70"}`}
        >
          <Apple className="h-4 w-4" /> iPhone
        </button>
        <button
          onClick={() => setOs("android")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${os === "android" ? "bg-white text-[#1B2B5E] shadow" : "text-white/70"}`}
        >
          <Smartphone className="h-4 w-4" /> Android
        </button>
        <button
          onClick={() => setOs("desktop")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${os === "desktop" ? "bg-white text-[#1B2B5E] shadow" : "text-white/70"}`}
        >
          <Monitor className="h-4 w-4" /> PC
        </button>
      </div>

      {/* iOS Steps */}
      {os === "ios" && (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-white/60 text-xs text-center uppercase tracking-widest mb-4 font-semibold">Instrucciones para iPhone / iPad</p>

          <Step n={1} icon={<Share className="h-5 w-5 text-blue-400" />}>
            Abrí el sitio <span className="text-blue-300 font-semibold">puffinsrl.site</span> en <span className="font-semibold">Safari</span>
          </Step>

          <Step n={2} icon={<Share className="h-5 w-5 text-blue-400" />}>
            Tocá el botón <span className="font-semibold">Compartir</span>{" "}
            <span className="inline-flex items-center justify-center bg-blue-500/20 border border-blue-400/30 rounded px-1.5 py-0.5 text-xs">
              <Share className="h-3 w-3" />
            </span>{" "}
            en la barra inferior del navegador
          </Step>

          <Step n={3} icon={<PlusSquare className="h-5 w-5 text-blue-400" />}>
            En el menú que se abre, buscá y tocá{" "}
            <span className="font-semibold">"Agregar a pantalla de inicio"</span>
          </Step>

          <Step n={4} icon={<CheckCircle className="h-5 w-5 text-green-400" />}>
            Confirmá tocando <span className="font-semibold text-green-400">Agregar</span>. ¡Listo! Va a aparecer el ícono de PUFFIN en tu pantalla de inicio.
          </Step>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-white/50 text-xs text-center">
              ⚠️ Este paso <span className="font-semibold text-white/70">solo funciona en Safari</span>. Si usás Chrome en iPhone, necesitás cambiar a Safari primero.
            </p>
          </div>
        </div>
      )}

      {/* Android Steps */}
      {os === "android" && (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-white/60 text-xs text-center uppercase tracking-widest mb-4 font-semibold">Instrucciones para Android</p>

          {deferredPrompt ? (
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-3 bg-blue-500 hover:bg-blue-400 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl shadow-lg text-base mb-4"
            >
              <Download className="h-5 w-5" />
              Instalar PUFFIN ahora
            </button>
          ) : (
            <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 mb-4">
              <p className="text-blue-200 text-sm text-center">
                Si el botón no aparece, seguí los pasos manuales ↓
              </p>
            </div>
          )}

          <Step n={1} icon={<Smartphone className="h-5 w-5 text-blue-400" />}>
            Abrí el sitio <span className="text-blue-300 font-semibold">puffinsrl.site</span> en <span className="font-semibold">Chrome</span>
          </Step>

          <Step n={2} icon={<MoreVertical className="h-5 w-5 text-blue-400" />}>
            Tocá los <span className="font-semibold">tres puntos ⋮</span> en la esquina superior derecha del navegador
          </Step>

          <Step n={3} icon={<PlusSquare className="h-5 w-5 text-blue-400" />}>
            Seleccioná{" "}
            <span className="font-semibold">"Agregar a pantalla de inicio"</span> o{" "}
            <span className="font-semibold">"Instalar aplicación"</span>
          </Step>

          <Step n={4} icon={<CheckCircle className="h-5 w-5 text-green-400" />}>
            Confirmá la instalación. ¡Listo! PUFFIN aparecerá en tu pantalla de inicio como una app.
          </Step>
        </div>
      )}

      {/* Desktop Steps */}
      {os === "desktop" && (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-white/60 text-xs text-center uppercase tracking-widest mb-4 font-semibold">Instrucciones para PC / Laptop</p>

          {deferredPrompt ? (
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-3 bg-blue-500 hover:bg-blue-400 active:scale-95 transition-all text-white font-bold py-4 rounded-2xl shadow-lg text-base mb-4"
            >
              <Download className="h-5 w-5" />
              Instalar PUFFIN en esta PC
            </button>
          ) : null}

          <Step n={1} icon={<Monitor className="h-5 w-5 text-blue-400" />}>
            Abrí el sitio en <span className="font-semibold">Google Chrome</span> o <span className="font-semibold">Edge</span>
          </Step>

          <Step n={2} icon={<MoreVertical className="h-5 w-5 text-blue-400" />}>
            En Chrome: hacé clic en el ícono de{" "}
            <span className="font-semibold">instalar (⬇️)</span> que aparece en la barra de dirección, a la derecha
          </Step>

          <Step n={3} icon={<CheckCircle className="h-5 w-5 text-green-400" />}>
            Confirmá haciendo clic en <span className="font-semibold text-green-400">Instalar</span>. La app abre en su propia ventana sin barra del navegador.
          </Step>
        </div>
      )}

      {/* URL reminder */}
      <div className="mt-10 flex flex-col items-center gap-2">
        <p className="text-white/40 text-xs">Dirección del sistema</p>
        <div className="bg-white/10 rounded-xl px-5 py-3 border border-white/10">
          <span className="text-blue-300 font-bold text-lg tracking-wide">puffinsrl.site</span>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-white/8 bg-white/5">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
            {n}
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm text-white/80 leading-snug">
          {icon}
          <span>{children}</span>
        </div>
      </CardContent>
    </Card>
  );
}
