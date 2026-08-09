import React, { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Users, Briefcase, AlertTriangle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Empleado } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProyectoResumen {
  id: number;
  lugar: string;
  empleados_asignados?: number[] | null;
}

interface ComboboxEmpleadoProps {
  value: string;
  onChange: (value: string) => void;
  empleados: Empleado[];
  proyectos?: ProyectoResumen[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

// ─── MOBILE: Inline expandable list (no portals, works inside Dialog on iOS) ──
function ComboboxEmpleadoMobile({
  value,
  onChange,
  empleados,
  disabled,
  placeholder = "Seleccionar operario",
  className,
}: Omit<ComboboxEmpleadoProps, "proyectos">) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const selectedEmpleado = value ? empleados.find((e) => e.id.toString() === value) : null;

  const filtered = React.useMemo(() => {
    if (!search.trim()) return empleados;
    const q = search.toLowerCase();
    return empleados.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        e.apellido.toLowerCase().includes(q) ||
        (e.cargo || "").toLowerCase().includes(q)
    );
  }, [empleados, search]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={cn("relative w-full", className)}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-input bg-background text-sm",
          "active:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {selectedEmpleado ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={selectedEmpleado.foto_perfil || undefined} />
              <AvatarFallback className="text-[10px]">
                {selectedEmpleado.nombre[0]}{selectedEmpleado.apellido[0]}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">
              {selectedEmpleado.apellido}, {selectedEmpleado.nombre}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {/* Inline dropdown — rendered in the same DOM tree, no portals */}
      {open && (
        <div
          className="w-full mt-1 rounded-md border border-input bg-background shadow-lg z-50"
          style={{ position: "relative" }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 p-2 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus={false}
              type="text"
              placeholder="Buscar operario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* List */}
          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{ maxHeight: "240px", WebkitOverflowScrolling: "touch" }}
          >
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                No se encontró ningún operario.
              </p>
            ) : (
              filtered.map((e) => {
                const isSelected = value === e.id.toString();
                return (
                  <button
                    key={e.id}
                    type="button"
                    onPointerDown={() => handleSelect(e.id.toString())}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 text-left border-b border-slate-100 last:border-0",
                      "active:bg-accent",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-primary",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={e.foto_perfil || undefined} />
                      <AvatarFallback className="text-xs">
                        {e.nombre[0]}{e.apellido[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-left overflow-hidden">
                      <span className="font-semibold text-sm truncate">
                        {e.apellido}, {e.nombre}
                      </span>
                      {e.cargo && (
                        <span className="text-xs text-muted-foreground truncate">
                          {e.cargo}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function ComboboxEmpleado({
  value,
  onChange,
  empleados,
  proyectos,
  disabled,
  placeholder = "Seleccionar operario",
  className,
}: ComboboxEmpleadoProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  // On mobile, use the inline version (no portals)
  if (isMobile) {
    return (
      <ComboboxEmpleadoMobile
        value={value}
        onChange={onChange}
        empleados={empleados}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  // ─── DESKTOP: Popover + HoverCard ────────────────────────────────────────────
  const selectedEmpleado = value ? empleados.find((e) => e.id.toString() === value) : null;
  const proyectosMap = React.useMemo(() => {
    const map = new Map<number, string>();
    if (proyectos) {
      for (const p of proyectos) {
        if (p.empleados_asignados) {
          for (const empId of p.empleados_asignados) {
            map.set(empId, p.lugar);
          }
        }
      }
    }
    return map;
  }, [proyectos]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-auto py-2", className)}
          disabled={disabled}
        >
          {selectedEmpleado ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selectedEmpleado.foto_perfil || undefined} />
                <AvatarFallback className="text-[10px]">
                  {selectedEmpleado.nombre[0]}{selectedEmpleado.apellido[0]}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selectedEmpleado.apellido}, {selectedEmpleado.nombre}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar operario..." />
          <CommandList className="max-h-[40vh]">
            <CommandEmpty>No se encontró ningún operario.</CommandEmpty>
            <CommandGroup>
              {empleados.map((e) => {
                const lugarProyecto = proyectosMap.get(e.id);
                const isSelected = value === e.id.toString();
                return (
                  <CommandItem
                    key={e.id}
                    value={`${e.apellido} ${e.nombre}`}
                    onSelect={() => { onChange(e.id.toString()); setOpen(false); }}
                    className="py-2"
                  >
                    <HoverCard openDelay={100} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center w-full cursor-help">
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                          <Avatar className="h-6 w-6 mr-2 shrink-0">
                            <AvatarImage src={e.foto_perfil || undefined} />
                            <AvatarFallback className="text-[10px]">{e.nombre[0]}{e.apellido[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col text-left overflow-hidden">
                            <span className="font-medium text-sm truncate">{e.apellido}, {e.nombre}</span>
                            {e.cargo && <span className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.cargo}</span>}
                          </div>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" align="start" className="w-72 shadow-xl z-[999999]">
                        <div className="flex gap-4 mb-3">
                          <Avatar className="h-16 w-16 border-2 border-primary/10">
                            <AvatarImage src={e.foto_perfil || undefined} className="object-cover" />
                            <AvatarFallback className="text-lg">{e.nombre[0]}{e.apellido[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col justify-center">
                            <h4 className="font-bold text-sm text-primary flex items-center gap-1">
                              <Users className="h-4 w-4" /> {e.nombre} {e.apellido}
                            </h4>
                            <span className="text-xs text-slate-500 font-medium">{e.cargo || "Sin cargo"}</span>
                          </div>
                        </div>
                        <div className="space-y-3 text-xs text-slate-600 border-t pt-3">
                          <div>
                            <div className="flex items-center gap-1 font-semibold text-slate-500 mb-1">
                              <Briefcase className="h-3 w-3" /> Proyecto asignado:
                            </div>
                            {lugarProyecto ? (
                              <div className="bg-primary/5 p-1.5 rounded-md border border-primary/10">
                                <span className="font-medium text-primary">{lugarProyecto}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No está asignado a ningún proyecto.</span>
                            )}
                          </div>
                          {(e.alertas_count ?? 0) > 0 && (
                            <div className="flex gap-2 p-2 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 mt-2">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block">¡Atención!</span>
                                Este operario tiene {e.alertas_count} alerta(s) activa(s).
                              </div>
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
