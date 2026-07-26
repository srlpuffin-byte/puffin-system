import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App";
import "./index.css";

// Registrar Service Worker — checkea actualizaciones cada 60 segundos
const updateSW = registerSW({
  onNeedRefresh() {
    // Guardar la función de actualización globalmente para que el banner la use
    (window as any).__puffin_updateSW = () => updateSW(true);
    // Disparar evento global — el banner en App lo escucha
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
  },
  onOfflineReady() {
    console.log("[PWA] App lista para trabajar sin conexión.");
  },
  immediate: true,
});

// Verificar actualizaciones cada 60 segundos en segundo plano
setInterval(() => {
  (navigator.serviceWorker?.getRegistration() as Promise<ServiceWorkerRegistration | undefined>)
    ?.then(reg => reg?.update())
    ?.catch(() => {});
}, 60_000);

createRoot(document.getElementById("root")!).render(<App />);
