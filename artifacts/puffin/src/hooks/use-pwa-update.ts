import { useEffect, useRef } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "puffin_build_id";
const CHECK_URL = "/"; // Siempre traemos el index.html fresco

/**
 * Detecta si Vercel desplegó una nueva versión comparando el hash del bundle JS.
 * Funciona en iOS y Android sin depender del Service Worker.
 * Corre cada vez que el usuario vuelve a la app (visibilitychange / focus).
 */
export function usePWAUpdate() {
  const toastShown = useRef(false);

  const checkForUpdate = async () => {
    if (toastShown.current) return; // No mostrar más de una vez por sesión

    try {
      // Traemos el index.html sin caché para ver el build más reciente
      const res = await fetch(CHECK_URL, {
        cache: "no-store",
        headers: { "pragma": "no-cache", "cache-control": "no-cache" },
      });
      const html = await res.text();

      // El hash del build está en el src del JS principal (ej: /assets/index-Abc123.js)
      const match = html.match(/src="[^"]*\/assets\/index-([^"]+)\.js"/);
      if (!match) return;

      const serverBuildId = match[1];
      const localBuildId = localStorage.getItem(STORAGE_KEY);

      // Primera vez que abre la app → guardamos el ID sin mostrar nada
      if (!localBuildId) {
        localStorage.setItem(STORAGE_KEY, serverBuildId);
        return;
      }

      // Si cambió el build → hay una versión nueva
      if (localBuildId !== serverBuildId) {
        toastShown.current = true;
        localStorage.setItem(STORAGE_KEY, serverBuildId);

        toast("🔄 Nueva versión disponible", {
          description: "PUFFIN fue actualizado. Tocá para cargar los últimos cambios.",
          duration: Infinity,
          action: {
            label: "Actualizar ahora",
            onClick: () => window.location.reload(),
          },
        });
      }
    } catch {
      // Sin conexión o error — ignorar silenciosamente
    }
  };

  useEffect(() => {
    // Verificar al cargar la app
    checkForUpdate();

    // Verificar cada vez que el usuario vuelve a la app (minimizó, cambió de pestaña, etc.)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    // También al recuperar el foco en desktop
    const handleFocus = () => checkForUpdate();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);
}
