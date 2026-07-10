import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App";
import "./index.css";

// Registrar Service Worker para soporte Offline
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("Hay una nueva versión disponible. ¿Recargar?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("Aplicación lista para trabajar sin conexión.");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
