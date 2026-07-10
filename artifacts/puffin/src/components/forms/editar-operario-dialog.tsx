import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Empleado } from "@workspace/api-client-react";

const CARGOS = ["Operador de Retroexcavadora", "Operador de Niveladora", "Operador de Compactadora", "Chofer", "Ayudante", "Capataz", "Operario General", "Mecánico", "Administrativo"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operario: Empleado;
}

export function EditarOperarioDialog({ open, onOpenChange, operario }: Props) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  
  const [form, setForm] = useState({
    nombre: "", apellido: "", dni: "", telefono: "", cargo: "", fecha_ingreso: "",
    contacto_familiar_nombre: "", contacto_familiar_telefono: "", estado: ""
  });

  useEffect(() => {
    if (operario && open) {
      setForm({
        nombre: operario.nombre || "",
        apellido: operario.apellido || "",
        dni: operario.dni === "COMPLETAR" ? "" : (operario.dni || ""),
        telefono: operario.telefono || "",
        cargo: operario.cargo || "",
        fecha_ingreso: operario.fecha_ingreso ? new Date(operario.fecha_ingreso).toISOString().split('T')[0] : "",
        contacto_familiar_nombre: operario.contacto_familiar_nombre || "",
        contacto_familiar_telefono: operario.contacto_familiar_telefono || "",
        estado: operario.estado || "activo"
      });
    }
  }, [operario, open]);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.apellido || !form.dni) {
      toast.error("Nombre, apellido y DNI son obligatorios");
      return;
    }
    
    setIsPending(true);
    try {
      const res = await fetch(`/api/empleados/${operario.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          ...form,
          telefono: form.telefono || null,
          cargo: form.cargo || null,
          fecha_ingreso: form.fecha_ingreso || null,
          contacto_familiar_nombre: form.contacto_familiar_nombre || null,
          contacto_familiar_telefono: form.contacto_familiar_telefono || null
        })
      });
      
      if (!res.ok) throw new Error("Error al actualizar");
      
      toast.success("Operario actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["getEmpleado", operario.id] });
      queryClient.invalidateQueries({ queryKey: ["getEmpleados"] });
      onOpenChange(false);
    } catch (err) {
      toast.error("Error al actualizar operario");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Operario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={e => set("nombre", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Apellido *</Label>
              <Input value={form.apellido} onChange={e => set("apellido", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>DNI *</Label>
              <Input value={form.dni} onChange={e => set("dni", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={e => set("telefono", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Select value={form.cargo} onValueChange={v => set("cargo", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {CARGOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => set("estado", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-2">Contacto de emergencia</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre familiar</Label>
                <Input value={form.contacto_familiar_nombre} onChange={e => set("contacto_familiar_nombre", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono familiar</Label>
                <Input value={form.contacto_familiar_telefono} onChange={e => set("contacto_familiar_telefono", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
