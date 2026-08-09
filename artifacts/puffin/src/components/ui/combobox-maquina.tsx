import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Tractor, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Maquina } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProyectoResumen {
  id: number;
  lugar: string;
  maquinas_asignadas?: number[] | null;
}

interface ComboboxMaquinaProps {
  value: string;
  onChange: (value: string) => void;
  maquinas: Maquina[];
  proyectos?: ProyectoResumen[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ComboboxMaquina({
  value,
  onChange,
  maquinas,
  proyectos,
  disabled,
  placeholder = "Seleccionar máquina",
  className,
}: ComboboxMaquinaProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const selectedMaquina = value ? maquinas.find((m) => m.id.toString() === value) : null;

  const proyectosMap = React.useMemo(() => {
    const map = new Map<number, string>();
    if (proyectos) {
      for (const p of proyectos) {
        if (p.maquinas_asignadas) {
          for (const maqId of p.maquinas_asignadas) {
            map.set(maqId, p.lugar);
          }
        }
      }
    }
    return map;
  }, [proyectos]);

  const filtered = React.useMemo(() => {
    const list = maquinas.filter(m => m.categoria !== "inventario");
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(m =>
      m.nombre.toLowerCase().includes(q) ||
      (m.patente || "").toLowerCase().includes(q) ||
      (m.dominio || "").toLowerCase().includes(q) ||
      (m.marca || "").toLowerCase().includes(q) ||
      (m.modelo || "").toLowerCase().includes(q)
    );
  }, [maquinas, search]);

  const triggerButton = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn("w-full justify-between h-auto py-2", className)}
      disabled={disabled}
    >
      {selectedMaquina ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6 rounded-md">
            <AvatarImage src={selectedMaquina.imagen_url || undefined} className="object-cover" />
            <AvatarFallback className="rounded-md bg-slate-100 text-[10px]">
              <Tractor className="h-3 w-3 text-slate-400" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-sm truncate">
              {selectedMaquina.nombre}
              {selectedMaquina.patente ? ` (${selectedMaquina.patente})` : selectedMaquina.dominio ? ` (${selectedMaquina.dominio})` : ""}
            </span>
          </div>
        </div>
      ) : (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerTrigger asChild>
          {triggerButton}
        </DrawerTrigger>
        <DrawerContent className="h-[85vh] px-2 flex flex-col">
          <div className="sr-only"><DrawerTitle>Seleccionar máquina</DrawerTitle></div>
          <Command className="flex-1 overflow-hidden mt-4">
            <CommandInput placeholder="Buscar máquina..." autoFocus={false} />
            <CommandList className="max-h-full overflow-y-auto">
              <CommandEmpty>No se encontró ninguna máquina.</CommandEmpty>
              <CommandGroup>
                {maquinas.filter(m => m.categoria !== "inventario").map((m) => {
                  const isSelected = value === m.id.toString();
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${m.nombre} ${m.patente || ""} ${m.dominio || ""}`}
                      onSelect={() => { onChange(m.id.toString()); setOpen(false); }}
                      className="py-3 px-2 border-b border-slate-100 last:border-0"
                    >
                      <Check className={cn("mr-3 h-5 w-5 text-primary shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      <Avatar className="h-8 w-8 mr-3 shrink-0 rounded-md">
                        <AvatarImage src={m.imagen_url || undefined} className="object-cover" />
                        <AvatarFallback className="rounded-md bg-slate-100 text-[10px]">
                          <Tractor className="h-4 w-4 text-slate-400" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="font-semibold text-base truncate">
                          {m.nombre}
                          {m.patente ? ` (${m.patente})` : m.dominio ? ` (${m.dominio})` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {m.marca || "-"} · {m.modelo || "-"}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DrawerContent>
      </Drawer>
    );
  }

  // ─── DESKTOP: Popover + HoverCard ────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar máquina..." />
          <CommandList className="max-h-[40vh]">
            <CommandEmpty>No se encontró ninguna máquina.</CommandEmpty>
            <CommandGroup>
              {maquinas.filter(m => m.categoria !== "inventario").map((m) => {
                const lugarProyecto = proyectosMap.get(m.id);
                const isSelected = value === m.id.toString();
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.nombre} ${m.patente || ""} ${m.dominio || ""}`}
                    onSelect={() => { onChange(m.id.toString()); setOpen(false); }}
                    className="py-2"
                  >
                    <HoverCard openDelay={100} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center w-full cursor-help">
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                          <Avatar className="h-8 w-8 mr-2 shrink-0 rounded-md">
                            <AvatarImage src={m.imagen_url || undefined} className="object-cover" />
                            <AvatarFallback className="rounded-md bg-slate-100 text-[10px]">
                              <Tractor className="h-4 w-4 text-slate-400" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col text-left overflow-hidden">
                            <span className="font-semibold text-sm truncate">
                              {m.nombre}
                              {m.patente ? ` (${m.patente})` : m.dominio ? ` (${m.dominio})` : ""}
                            </span>
                            <span className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {m.marca || "-"} · {m.modelo || "-"}
                            </span>
                          </div>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" align="start" className="w-80 shadow-xl z-[999999]">
                        {m.imagen_url && (
                          <div className="w-full h-32 mb-3 rounded-md overflow-hidden bg-slate-100">
                            <img src={m.imagen_url} alt={m.nombre} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1 mb-3">
                          <h4 className="font-bold text-base text-primary flex items-center gap-2">
                            <Tractor className="h-5 w-5" /> {m.nombre}
                          </h4>
                          {(m.patente || m.dominio) && (
                            <span className="text-sm font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md self-start border">
                              {m.patente || m.dominio}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 text-xs text-slate-600 border-t pt-3">
                          <div>
                            <div className="flex items-center gap-1 font-semibold text-slate-500 mb-1">
                              <Briefcase className="h-3 w-3" /> Proyecto actual:
                            </div>
                            {lugarProyecto ? (
                              <div className="bg-primary/5 p-1.5 rounded-md border border-primary/10">
                                <span className="font-medium text-primary">{lugarProyecto}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">En base / Sin proyecto asignado</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
                            <div><span className="font-semibold text-slate-500">Marca:</span> {m.marca || "-"}</div>
                            <div><span className="font-semibold text-slate-500">Modelo:</span> {m.modelo || "-"}</div>
                            <div><span className="font-semibold text-slate-500">Año:</span> {m.anio || "-"}</div>
                            <div><span className="font-semibold text-slate-500">Estado:</span> <span className="uppercase">{m.estado}</span></div>
                          </div>
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
