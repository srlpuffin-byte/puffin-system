import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Si el error es de carga de chunks (típico cuando se actualiza Vercel),
    // forzamos una recarga automática para traer la nueva versión
    const isChunkLoadFailed = 
      error.message.includes("Failed to fetch dynamically imported module") ||
      error.message.includes("Importing a module script failed");
      
    if (isChunkLoadFailed) {
      window.location.reload();
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
          <div className="p-4 bg-red-50 rounded-full">
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Algo salió mal</h2>
          <p className="text-muted-foreground max-w-md">
            Ocurrió un error inesperado en esta sección de la aplicación.
            Nuestro equipo ha sido notificado.
          </p>
          <div className="flex gap-4 mt-4">
            <Button onClick={() => window.location.reload()} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Recargar página
            </Button>
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              Volver al inicio
            </Button>
          </div>
          {process.env.NODE_ENV !== "production" && this.state.error && (
            <pre className="mt-8 p-4 bg-slate-100 rounded text-left text-sm text-red-800 overflow-auto max-w-2xl w-full">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
