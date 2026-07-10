import React, { useState } from "react";
import { useGetMaquinas, useGetEmpleados } from "@workspace/api-client-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Truck, HardHat } from "lucide-react";
import { useLocation } from "wouter";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BusquedaGlobalDialog({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  const { data: maquinas } = useGetMaquinas({ search: query || undefined });
  const { data: empleados } = useGetEmpleados({ search: query || undefined });

  const maquinasFiltradas = query.length >= 2 ? (maquinas || []).slice(0, 4) : [];
  const empleadosFiltrados = query.length >= 2 ? (empleados || []).slice(0, 4) : [];
  const hasResults = maquinasFiltradas.length > 0 || empleadosFiltrados.length > 0;

  const go = (href: string) => {
    navigate(href);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setQuery(""); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center px-4 py-3 border-b gap-2">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            placeholder="Buscar maquinas, operarios..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 text-base p-0 h-auto"
          />
        </div>
        {query.length >= 2 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {!hasResults && (
              <p className="text-center text-muted-foreground py-8 text-sm">Sin resultados para "{query}"</p>
            )}
            {maquinasFiltradas.length > 0 && (
              <div>
                <p className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Maquinas</p>
                {maquinasFiltradas.map(m => (
                  <button key={m.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left" onClick={() => go(`/maquinas/${m.id}`)}>
                    <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{m.nombre}</p>
                      <p className="text-xs text-muted-foreground">{m.tipo}{m.codigo ? ` - ${m.codigo}` : ""} - {m.estado}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {empleadosFiltrados.length > 0 && (
              <div>
                <p className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">Operarios</p>
                {empleadosFiltrados.map(e => (
                  <button key={e.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left" onClick={() => go(`/operarios/${e.id}`)}>
                    <HardHat className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{e.apellido}, {e.nombre}</p>
                      <p className="text-xs text-muted-foreground">DNI: {e.dni}{e.cargo ? ` - ${e.cargo}` : ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {query.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Escribi al menos 2 caracteres para buscar
            <div className="mt-2 text-xs">Tip: usa <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+K</kbd> para abrir</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
