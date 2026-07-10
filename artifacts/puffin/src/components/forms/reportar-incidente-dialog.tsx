import React, { useState } from "react";
import { useCreateIncidente, useGetMaquinas, useGetEmpleados, getGetIncidentesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const TIPOS_INCIDENTE = [
  { value: "rotura", label: "Rotura" },
  { value: "golpe", label: "Golpe / Colisión" },
  { value: "accidente", label: "Accidente personal" },
  { value: "falla", label: "Falla operativa" },
  { value: "problema_mecanico", label: "Problema mecánico" },
  { value: "otro", label: "Otro" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
  empleadoIdFijo?: number;
}

export function ReportarIncidenteDialog({ open, onOpenChange, maquinaIdFija, empleadoIdFijo }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateIncidente();
  const { data: maquinas } = useGetMaquinas();
  const { data: empleados } = useGetEmpleados();

  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    tipo: "",
    descripcion: "",
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipo || !form.descripcion) {
      toast.error("Tipo y descripción son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          tipo: form.tipo as any,
          descripcion: form.descripcion,
          empleado_id: form.empleado_id ? parseInt(form.empleado_id) : undefined,
          maquina_id: form.maquina_id ? parseInt(form.maquina_id) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Incidente reportado correctamente");
          queryClient.invalidateQueries({ queryKey: getGetIncidentesQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", tipo: "", descripcion: "" });
        },
        onError: () => toast.error("Error al reportar el incidente"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Reportar Incidente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tipo de incidente *</Label>
            <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
              <SelectContent>
                {TIPOS_INCIDENTE.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario involucrado</Label>
              <Select value={form.empleado_id} onValueChange={v => set("empleado_id", v)}>
                <SelectTrigger><SelectValue placeholder="(Opcional)" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(empleados) ? empleados : [])?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina involucrada</Label>
              <Select value={form.maquina_id} onValueChange={v => set("maquina_id", v)}>
                <SelectTrigger><SelectValue placeholder="(Opcional)" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(maquinas) ? maquinas : [])?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Descripción *</Label>
            <Textarea placeholder="Describir en detalle qué ocurrió..." value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={4} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={createMut.isPending}>
              {createMut.isPending ? "Reportando..." : "Reportar Incidente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
