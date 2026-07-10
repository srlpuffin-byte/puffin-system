import React, { useState } from "react";
import { useCreateEmpleado, getGetEmpleadosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CARGOS = ["Operador de Retroexcavadora", "Operador de Niveladora", "Operador de Compactadora", "Chofer", "Ayudante", "Capataz", "Operario General", "Mecánico", "Administrativo"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevoOperarioDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateEmpleado();
  const [form, setForm] = useState({
    nombre: "", apellido: "", dni: "", telefono: "", cargo: "", fecha_ingreso: "",
    contacto_familiar_nombre: "", contacto_familiar_telefono: "",
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.apellido || !form.dni) {
      toast.error("Nombre, apellido y DNI son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          nombre: form.nombre,
          apellido: form.apellido,
          dni: form.dni,
          telefono: form.telefono || undefined,
          cargo: form.cargo || undefined,
          fecha_ingreso: form.fecha_ingreso || undefined,
          contacto_familiar_nombre: form.contacto_familiar_nombre || undefined,
          contacto_familiar_telefono: form.contacto_familiar_telefono || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Operario creado correctamente");
          queryClient.invalidateQueries({ queryKey: getGetEmpleadosQueryKey() });
          onOpenChange(false);
          setForm({ nombre: "", apellido: "", dni: "", telefono: "", cargo: "", fecha_ingreso: "", contacto_familiar_nombre: "", contacto_familiar_telefono: "" });
        },
        onError: () => toast.error("Error al crear el operario"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo Operario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input placeholder="Juan" value={form.nombre} onChange={e => set("nombre", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Apellido *</Label>
              <Input placeholder="González" value={form.apellido} onChange={e => set("apellido", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>DNI *</Label>
              <Input placeholder="30456789" value={form.dni} onChange={e => set("dni", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input placeholder="11-4521-3344" value={form.telefono} onChange={e => set("telefono", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cargo</Label>
            <Select value={form.cargo} onValueChange={v => set("cargo", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cargo" /></SelectTrigger>
              <SelectContent>
                {CARGOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Fecha de ingreso</Label>
            <Input type="date" value={form.fecha_ingreso} onChange={e => set("fecha_ingreso", e.target.value)} />
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-2">Contacto de emergencia</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre familiar</Label>
                <Input placeholder="Ej. María García" value={form.contacto_familiar_nombre} onChange={e => set("contacto_familiar_nombre", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono familiar</Label>
                <Input placeholder="11-9876-5432" value={form.contacto_familiar_telefono} onChange={e => set("contacto_familiar_telefono", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Guardando..." : "Crear Operario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
