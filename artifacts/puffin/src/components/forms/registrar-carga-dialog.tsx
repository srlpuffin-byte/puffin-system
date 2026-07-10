import React, { useState } from "react";
import { useCreateCombustible, useGetEmpleados, useGetMaquinas, getGetCombustibleQueryKey, useUploadFotografia } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
  empleadoIdFijo?: number;
}

export function RegistrarCargaDialog({ open, onOpenChange, maquinaIdFija, empleadoIdFijo }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateCombustible();
  const uploadMut = useUploadFotografia();
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas } = useGetMaquinas();
  const [fotoNivel, setFotoNivel] = useState<{ base64: string; name: string } | null>(null);

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
        onSuccess: async (carga) => {
          if (fotoNivel && carga.id) {
            try {
              await uploadMut.mutateAsync({
                data: {
                  entidad_tipo: "combustible",
                  entidad_id: carga.id,
                  base64Data: fotoNivel.base64,
                  filename: fotoNivel.name,
                  descripcion: "Foto nivel combustible"
                }
              });
            } catch {}
          }
          toast.success("Carga de combustible registrada");
          queryClient.invalidateQueries({ queryKey: getGetCombustibleQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", litros: "", precio: "", importe: "", estacion: "", kilometraje: "" });
          setFotoNivel(null);
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
              <select
                value={form.empleado_id}
                onChange={e => set("empleado_id", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                required
              >
                <option value="" disabled>Seleccionar operario</option>
                {Array.isArray(empleados) ? empleados.map(e => <option key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</option>) : null}
              </select>
            </div>
          )}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina *</Label>
              <select
                value={form.maquina_id}
                onChange={e => set("maquina_id", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                required
              >
                <option value="" disabled>Seleccionar máquina</option>
                {Array.isArray(maquinas) ? maquinas.map(m => <option key={m.id} value={m.id.toString()}>{m.nombre}</option>) : null}
              </select>
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
          <div className="space-y-2">
            <Label>Foto del nivel de combustible</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors text-sm">
                <Camera className="h-4 w-4" />
                {fotoNivel ? "Foto cargada ✓" : "Tomar / subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1];
                      setFotoNivel({ base64, name: file.name });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {fotoNivel && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setFotoNivel(null)}>
                  Quitar
                </Button>
              )}
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
