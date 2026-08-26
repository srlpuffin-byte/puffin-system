import React, { useState, useEffect } from "react";
import { useUpdateJornada, useGetEmpleados, useGetMaquinas, Jornada } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MobilePickerSheet } from "@/components/ui/mobile-picker-sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jornada: Jornada | null;
}

export function EditarJornadaDialog({ open, onOpenChange, jornada }: Props) {
  const queryClient = useQueryClient();
  const updateMut = useUpdateJornada();
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinasRaw } = useGetMaquinas();
  const maquinas = (maquinasRaw || []).filter((m: any) => m.categoria !== "inventario");

  const [form, setForm] = useState({
    empleado_id: "",
    maquina_id: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",
    horometro_inicio: "",
    horometro_fin: "",
    km_inicio: "",
    km_fin: "",
    estado: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (jornada) {
      setForm({
        empleado_id: jornada.empleado_id?.toString() || "",
        maquina_id: jornada.maquina_id?.toString() || "",
        fecha: jornada.fecha || "",
        hora_inicio: jornada.hora_inicio || "",
        hora_fin: jornada.hora_fin || "",
        horometro_inicio: jornada.horometro_inicio?.toString() || "",
        horometro_fin: jornada.horometro_fin?.toString() || "",
        km_inicio: jornada.km_inicio?.toString() || "",
        km_fin: jornada.km_fin?.toString() || "",
        estado: jornada.estado || "en_curso",
      });
    }
  }, [jornada]);

  const set = (field: string, val: string) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  // Derived validation: horometro fin debe ser mayor al inicio
  const hrInicioNum = form.horometro_inicio ? parseFloat(form.horometro_inicio) : null;
  const hrFinNum = form.horometro_fin ? parseFloat(form.horometro_fin) : null;
  const horometroError =
    hrInicioNum !== null &&
    hrFinNum !== null &&
    hrFinNum <= hrInicioNum;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.empleado_id || !form.maquina_id || !form.fecha) {
      toast.error("Operario, máquina y fecha son obligatorios");
      return;
    }
    if (horometroError) {
      toast.error(`El horómetro final (${hrFinNum}) debe ser mayor al de inicio (${hrInicioNum}). Verificá los valores.`);
      return;
    }
    if (!jornada) return;
    setIsSubmitting(true);
    updateMut.mutate(
      {
        id: jornada.id,
        data: {
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          fecha: form.fecha,
          hora_inicio: form.hora_inicio || undefined,
          hora_fin: form.hora_fin || undefined,
          horometro_inicio: form.horometro_inicio ? parseFloat(form.horometro_inicio) : undefined,
          horometro_fin: form.horometro_fin ? parseFloat(form.horometro_fin) : undefined,
          km_inicio: form.km_inicio ? parseFloat(form.km_inicio) : undefined,
          km_fin: form.km_fin ? parseFloat(form.km_fin) : undefined,
          estado: form.estado as any,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["jornadas"] });
          toast.success("Jornada actualizada con éxito");
          onOpenChange(false);
          setIsSubmitting(false);
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.error || "Error al actualizar jornada");
          setIsSubmitting(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="sm:max-w-[600px] bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Editar Jornada
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Operario *</Label>
              <MobilePickerSheet
                value={form.empleado_id}
                onChange={v => set("empleado_id", v)}
                placeholder="Seleccionar operario"
                searchPlaceholder="Buscar operario..."
                recentStorageKey="puffin_recent_operarios"
                options={Array.isArray(empleados) ? empleados.map((e: any) => ({
                  value: e.id.toString(),
                  label: `${e.apellido}, ${e.nombre}`,
                  sublabel: e.cargo || undefined,
                  avatarUrl: e.foto_perfil || null,
                  initials: `${e.nombre?.[0] || ""}${e.apellido?.[0] || ""}`,
                })) : []}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Máquina *</Label>
              <MobilePickerSheet
                value={form.maquina_id}
                onChange={v => set("maquina_id", v)}
                placeholder="Seleccionar máquina"
                searchPlaceholder="Buscar máquina..."
                recentStorageKey="puffin_recent_maquinas"
                options={Array.isArray(maquinas) ? maquinas
                  .map((m: any) => ({
                    value: m.id.toString(),
                    label: m.nombre,
                    sublabel: [m.patente || m.dominio, m.marca, m.modelo].filter(Boolean).join(" · ") || undefined,
                    avatarUrl: m.imagen_url || null,
                    initials: m.nombre.substring(0, 2).toUpperCase(),
                  })) : []}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Fecha *</Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={e => set("fecha", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Estado</Label>
              <Select value={form.estado} onValueChange={v => set("estado", v)}>
                <SelectTrigger className="bg-black/20 border-white/10 text-white focus:border-white/30">
                  <SelectValue placeholder="Estado..." />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-white/10">
                  <SelectItem value="en_curso" className="text-white focus:bg-white/10">En Curso</SelectItem>
                  <SelectItem value="finalizada" className="text-white focus:bg-white/10">Finalizada</SelectItem>
                  <SelectItem value="anulada" className="text-white focus:bg-white/10">Anulada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Hora Inicio</Label>
              <Input
                type="time"
                value={form.hora_inicio}
                onChange={e => set("hora_inicio", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Hora Fin</Label>
              <Input
                type="time"
                value={form.hora_fin}
                onChange={e => set("hora_fin", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Horómetro Inicio</Label>
              <Input
                type="number"
                step="0.1"
                value={form.horometro_inicio}
                onChange={e => set("horometro_inicio", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
                placeholder="Ej. 120.5"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Horómetro Fin</Label>
              <Input
                type="number"
                step="0.1"
                value={form.horometro_fin}
                onChange={e => set("horometro_fin", e.target.value)}
                className={`bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors${
                  horometroError ? " border-amber-500" : ""
                }`}
                placeholder="Ej. 128.5"
              />
              {horometroError && (
                <div className="flex items-start gap-1.5 mt-1 p-2 rounded-md bg-amber-900/30 border border-amber-500/50">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 font-medium">
                    El horómetro final ({hrFinNum}) es menor o igual al de inicio ({hrInicioNum}h). Verificá los valores.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Km Inicio</Label>
              <Input
                type="number"
                step="0.1"
                value={form.km_inicio}
                onChange={e => set("km_inicio", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Km Fin</Label>
              <Input
                type="number"
                step="0.1"
                value={form.km_fin}
                onChange={e => set("km_fin", e.target.value)}
                className="bg-black/20 border-white/10 text-white focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-white/10 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || horometroError}
              className="bg-white text-black hover:bg-white/90 shadow-lg shadow-white/20 transition-all active:scale-95"
            >
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
