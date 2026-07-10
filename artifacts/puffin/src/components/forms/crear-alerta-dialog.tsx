import React, { useState } from "react";
import { useGetMaquinas, useGetEmpleados, getGetAlertasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

const PRIORIDADES = [
  { value: "azul", label: "Informativa (Azul)" },
  { value: "amarilla", label: "Media (Amarilla)" },
  { value: "roja", label: "Crítica (Roja)" },
];

const TIPOS_ALERTA = [
  { value: "maquina", label: "Máquina" },
  { value: "empleado", label: "Empleado" },
  { value: "documento", label: "Documento" },
  { value: "sistema", label: "Sistema" },
  { value: "otro", label: "Otro" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrearAlertaDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: maquinas } = useGetMaquinas();
  const { data: empleados } = useGetEmpleados();

  const [form, setForm] = useState({
    tipo: "otro",
    prioridad: "azul",
    descripcion: "",
    relacion: "ninguna",
    entidad_id: "",
  });

  const [isPending, setIsPending] = useState(false);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descripcion) {
      toast.error("La descripción es obligatoria");
      return;
    }

    setIsPending(true);
    try {
      let entidad_tipo = undefined;
      let entidad_id = undefined;
      let entidad_nombre = undefined;

      if (form.relacion === "maquina" && form.entidad_id) {
        const mq = maquinas?.find(m => m.id.toString() === form.entidad_id);
        if (mq) {
          entidad_tipo = "maquina";
          entidad_id = mq.id;
          entidad_nombre = mq.nombre;
        }
      } else if (form.relacion === "empleado" && form.entidad_id) {
        const emp = empleados?.find(e => e.id.toString() === form.entidad_id);
        if (emp) {
          entidad_tipo = "empleado";
          entidad_id = emp.id;
          entidad_nombre = `${emp.nombre} ${emp.apellido}`;
        }
      }

      await apiFetch("/alertas", {
        method: "POST",
        body: JSON.stringify({
          tipo: form.tipo,
          prioridad: form.prioridad,
          descripcion: form.descripcion,
          entidad_tipo,
          entidad_id,
          entidad_nombre,
        }),
      });

      toast.success("Alerta creada correctamente");
      queryClient.invalidateQueries({ queryKey: getGetAlertasQueryKey({ estado: 'activa' }) });
      onOpenChange(false);
      setForm({ tipo: "otro", prioridad: "azul", descripcion: "", relacion: "ninguna", entidad_id: "" });
    } catch (err) {
      console.error("Error creating alert:", err);
      toast.error("Error al crear la alerta");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Alerta Manual</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo de alerta</Label>
              <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ALERTA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={v => set("prioridad", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar prioridad" /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Relacionar con</Label>
            <Select value={form.relacion} onValueChange={v => { set("relacion", v); set("entidad_id", ""); }}>
              <SelectTrigger><SelectValue placeholder="Vincular a..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna entidad</SelectItem>
                <SelectItem value="maquina">Una máquina</SelectItem>
                <SelectItem value="empleado">Un empleado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.relacion === "maquina" && (
            <div className="space-y-1">
              <Label>Máquina</Label>
              <Select value={form.entidad_id} onValueChange={v => set("entidad_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar máquina" /></SelectTrigger>
                <SelectContent>
                  {maquinas?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.relacion === "empleado" && (
            <div className="space-y-1">
              <Label>Empleado</Label>
              <Select value={form.entidad_id} onValueChange={v => set("entidad_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                <SelectContent>
                  {empleados?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Descripción *</Label>
            <Textarea placeholder="Describa el motivo o detalle de la alerta..." value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={4} required />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando..." : "Crear Alerta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
