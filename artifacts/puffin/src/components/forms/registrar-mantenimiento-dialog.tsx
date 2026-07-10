import React, { useState } from "react";
import { useCreateMantenimiento, useGetMaquinas, getGetMantenimientosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const TIPOS_MANTENIMIENTO = ["Service Periódico", "Service por km", "Service por horas", "Reparación", "Preventivo", "Correctivo", "Cambio de neumáticos", "Cambio de aceite", "Revisión general", "Otro"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
}

export function RegistrarMantenimientoDialog({ open, onOpenChange, maquinaIdFija }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateMantenimiento();
  const { data: maquinas } = useGetMaquinas();

  const [form, setForm] = useState({
    maquina_id: maquinaIdFija?.toString() || "",
    tipo: "",
    horas: "",
    descripcion: "",
    proximo_service: "",
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.maquina_id || !form.tipo) {
      toast.error("Máquina y tipo son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          maquina_id: parseInt(form.maquina_id),
          tipo: form.tipo,
          horas: form.horas ? parseFloat(form.horas) : undefined,
          descripcion: form.descripcion || undefined,
          proximo_service: form.proximo_service || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Mantenimiento registrado correctamente");
          queryClient.invalidateQueries({ queryKey: getGetMantenimientosQueryKey() });
          onOpenChange(false);
          setForm({ maquina_id: maquinaIdFija?.toString() || "", tipo: "", horas: "", descripcion: "", proximo_service: "" });
        },
        onError: () => toast.error("Error al registrar el mantenimiento"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Mantenimiento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina *</Label>
              <Select value={form.maquina_id} onValueChange={v => set("maquina_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar máquina" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(maquinas) ? maquinas : [])?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Tipo de mantenimiento *</Label>
            <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
              <SelectContent>
                {TIPOS_MANTENIMIENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Horómetro al momento (h)</Label>
              <Input type="number" step="0.1" placeholder="4850" value={form.horas} onChange={e => set("horas", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fecha próximo service</Label>
              <Input type="date" value={form.proximo_service} onChange={e => set("proximo_service", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descripción / Detalle del trabajo</Label>
            <Textarea placeholder="Describir el trabajo realizado..." value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Guardando..." : "Registrar Mantenimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
