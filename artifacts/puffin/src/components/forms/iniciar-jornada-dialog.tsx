import React, { useState } from "react";
import { useIniciarJornada, useGetEmpleados, useGetMaquinas, getGetJornadasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empleadoIdFijo?: number;
  maquinaIdFija?: number;
}

export function IniciarJornadaDialog({ open, onOpenChange, empleadoIdFijo, maquinaIdFija }: Props) {
  const queryClient = useQueryClient();
  const createMut = useIniciarJornada();
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas } = useGetMaquinas({ estado: "activa" });

  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    horometro_inicio: "",
    km_inicio: "",
    observaciones: "",
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empleado_id || !form.maquina_id || !form.horometro_inicio) {
      toast.error("Operario, máquina y horómetro son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          horometro_inicio: parseFloat(form.horometro_inicio),
          km_inicio: form.km_inicio ? parseFloat(form.km_inicio) : undefined,
          observaciones: form.observaciones || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Jornada iniciada correctamente");
          queryClient.invalidateQueries({ queryKey: getGetJornadasQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", horometro_inicio: "", km_inicio: "", observaciones: "" });
        },
        onError: () => toast.error("Error al iniciar la jornada"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Iniciar Jornada</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario *</Label>
              <Select value={form.empleado_id} onValueChange={v => set("empleado_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar operario" /></SelectTrigger>
                <SelectContent>
                  {empleados?.map(e => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {e.apellido}, {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina *</Label>
              <Select value={form.maquina_id} onValueChange={v => set("maquina_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar máquina" /></SelectTrigger>
                <SelectContent>
                  {maquinas?.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.nombre} ({m.codigo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Horómetro inicial (h) *</Label>
              <Input type="number" step="0.1" placeholder="4850" value={form.horometro_inicio} onChange={e => set("horometro_inicio", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Km inicial (si aplica)</Label>
              <Input type="number" placeholder="89500" value={form.km_inicio} onChange={e => set("km_inicio", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea placeholder="Novedades al inicio..." value={form.observaciones} onChange={e => set("observaciones", e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Iniciando..." : "Iniciar Jornada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
