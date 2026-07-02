import React, { useState } from "react";
import { useCreateCombustible, useGetEmpleados, useGetMaquinas, getGetCombustibleQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
  empleadoIdFijo?: number;
}

export function RegistrarCargaDialog({ open, onOpenChange, maquinaIdFija, empleadoIdFijo }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateCombustible();
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas } = useGetMaquinas();

  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    litros: "",
    precio: "",
    importe: "",
    estacion: "",
    kilometraje: "",
  });

  const set = (field: string, val: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if ((field === "litros" || field === "precio") && next.litros && next.precio) {
        next.importe = (parseFloat(next.litros) * parseFloat(next.precio)).toFixed(0);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empleado_id || !form.maquina_id || !form.litros) {
      toast.error("Operario, máquina y litros son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          litros: parseFloat(form.litros),
          precio: form.precio ? parseFloat(form.precio) : undefined,
          importe: form.importe ? parseFloat(form.importe) : undefined,
          estacion: form.estacion || undefined,
          kilometraje: form.kilometraje ? parseFloat(form.kilometraje) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Carga de combustible registrada");
          queryClient.invalidateQueries({ queryKey: getGetCombustibleQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", litros: "", precio: "", importe: "", estacion: "", kilometraje: "" });
        },
        onError: () => toast.error("Error al registrar la carga"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Carga de Combustible</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario *</Label>
              <Select value={form.empleado_id} onValueChange={v => set("empleado_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar operario" /></SelectTrigger>
                <SelectContent>
                  {empleados?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</SelectItem>)}
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
                  {maquinas?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Litros *</Label>
              <Input type="number" step="0.01" placeholder="180" value={form.litros} onChange={e => set("litros", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Precio por litro ($)</Label>
              <Input type="number" step="0.01" placeholder="1250" value={form.precio} onChange={e => set("precio", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Importe total ($)</Label>
              <Input type="number" placeholder="Auto" value={form.importe} onChange={e => set("importe", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Estación de servicio</Label>
              <Input placeholder="YPF Autopista Norte" value={form.estacion} onChange={e => set("estacion", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kilometraje actual (km)</Label>
              <Input type="number" placeholder="89500" value={form.kilometraje} onChange={e => set("kilometraje", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Guardando..." : "Registrar Carga"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
