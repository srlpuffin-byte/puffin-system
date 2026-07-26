import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App";
import "./index.css";

// Registrar Service Worker para soporte Offline (cache de assets)
// La detección de actualizaciones la maneja usePWAUpdate hook (más confiable en iOS)
registerSW({
  onOfflineReady() {
    console.log("[PWA] App lista para trabajar sin conexión.");
  },
  immediate: true,
});

createRoot(document.getElementById("root")!).render(<App />);
