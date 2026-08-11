import React, { useState, useEffect } from "react";
import { useGetEmpleados, useGetMaquinas, getGetJornadasQueryKey, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MobilePickerSheet } from "@/components/ui/mobile-picker-sheet";
import { CalendarDays, Clock, Info } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CargarJornadaPasadaDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: empleados, isLoading: loadingEmpleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinasRaw, isLoading: loadingMaquinas } = useGetMaquinas();
  const maquinas = (maquinasRaw || []).filter(m => m.categoria !== "inventario");
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";

  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState({
    empleado_id: "",
    maquina_id: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",
    horometro_inicio: "",
    horometro_fin: "",
    ubicacion: "",
    descripcion_trabajo: "",
    observaciones: "",
  });

  // Calcular fecha de ayer por defecto
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().split("T")[0];

  // Max fecha = ayer (no puede cargar hoy ni futuro, para eso usa el flujo normal)
  const hoy = new Date().toISOString().split("T")[0];

  // Fecha mínima = 7 días atrás
  const hace7dias = new Date();
  hace7dias.setDate(hace7dias.getDate() - 7);
  const hace7diasStr = hace7dias.toISOString().split("T")[0];

  useEffect(() => {
    if (open) {
      setForm(prev => ({ ...prev, fecha: ayerStr }));
    }
  }, [open]);

  // Auto-completar empleado si es operario
  useEffect(() => {
    if (isEmpleado && user && empleados?.length) {
      const miEmpleado = (empleados as any[]).find(e =>
        e.nombre.toLowerCase() === user.nombre?.toLowerCase() &&
        e.apellido.toLowerCase() === user.apellido?.toLowerCase()
      );
      if (miEmpleado && !form.empleado_id) {
        setForm(prev => ({ ...prev, empleado_id: miEmpleado.id.toString() }));
      }
    }
  }, [isEmpleado, user, empleados]);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const calcularHorasReloj = () => {
    if (!form.hora_inicio || !form.hora_fin) return null;
    const [h1, m1] = form.hora_inicio.split(":").map(Number);
    const [h2, m2] = form.hora_fin.split(":").map(Number);
    const minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (minutos <= 0) return null;
    return (minutos / 60).toFixed(1);
  };

  const calcularHorasHorometro = () => {
    if (!form.horometro_inicio || !form.horometro_fin) return null;
    const diff = parseFloat(form.horometro_fin) - parseFloat(form.horometro_inicio);
    if (diff <= 0) return null;
    return diff.toFixed(1);
  };

  const resetForm = () => {
    setForm({
      empleado_id: "",
      maquina_id: "",
      fecha: ayerStr,
      hora_inicio: "",
      hora_fin: "",
      horometro_inicio: "",
      horometro_fin: "",
      ubicacion: "",
      descripcion_trabajo: "",
      observaciones: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.empleado_id || !form.maquina_id || !form.fecha) {
      toast.error("Operario, máquina y fecha son obligatorios");
      return;
    }
    if (!form.hora_inicio || !form.hora_fin) {
      toast.error("Debe ingresar hora de inicio y hora de fin");
      return;
    }
    if (!form.horometro_inicio || !form.horometro_fin) {
      toast.error("Debe ingresar horómetro inicial y final");
      return;
    }

    const horasReloj = calcularHorasReloj();
    const horasHorometro = calcularHorasHorometro();

    if (!horasReloj || parseFloat(horasReloj) <= 0) {
      toast.error("La hora de fin debe ser posterior a la hora de inicio");
      return;
    }
    if (!horasHorometro || parseFloat(horasHorometro) <= 0) {
      toast.error("El horómetro final debe ser mayor al inicial");
      return;
    }

    setIsPending(true);
    try {
      await customFetch("/jornadas/manual", {
        method: "POST",
        body: JSON.stringify({
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          fecha: form.fecha,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
          horometro_inicio: parseFloat(form.horometro_inicio),
          horometro_fin: parseFloat(form.horometro_fin),
          horas_trabajadas: parseFloat(horasHorometro),
          horas_reloj: parseFloat(horasReloj),
          ubicacion: form.ubicacion || undefined,
          descripcion_trabajo: form.descripcion_trabajo || undefined,
          observaciones: form.observaciones || undefined,
          estado: "finalizada",
        })
      });

      toast.success("Jornada cargada correctamente");
      queryClient.invalidateQueries({ queryKey: getGetJornadasQueryKey() });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Error al cargar la jornada");
    } finally {
      setIsPending(false);
    }
  };

  const horasReloj = calcularHorasReloj();
  const horasHorometro = calcularHorasHorometro();

  return (
    <Dialog modal={false} open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Cargar Jornada del Día Anterior
          </DialogTitle>
          <DialogDescription>
            Usá esto si ayer no pudiste registrar tu jornada. Podés cargar hasta 7 días atrás.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-400">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>Esta jornada quedará registrada como <strong>finalizada</strong> con los datos que ingreses.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">

          {/* Operario */}
          {!isEmpleado && (
            <div className="space-y-1">
              <Label>Operario *</Label>
              <MobilePickerSheet
                value={form.empleado_id}
                onChange={v => set("empleado_id", v)}
                placeholder="Seleccionar operario"
                searchPlaceholder="Buscar operario..."
                recentStorageKey="puffin_recent_operarios"
                isLoading={loadingEmpleados}
                options={Array.isArray(empleados) ? (empleados as any[]).map(e => ({
                  value: e.id.toString(),
                  label: `${e.apellido}, ${e.nombre}`,
                  sublabel: e.cargo || undefined,
                  avatarUrl: e.foto_perfil || null,
                  initials: `${e.nombre?.[0] || ""}${e.apellido?.[0] || ""}`,
                })) : []}
              />
            </div>
          )}

          {/* Máquina */}
          <div className="space-y-1">
            <Label>Máquina *</Label>
            <MobilePickerSheet
              value={form.maquina_id}
              onChange={v => set("maquina_id", v)}
              placeholder="Seleccionar máquina"
              searchPlaceholder="Buscar máquina..."
              recentStorageKey="puffin_recent_maquinas"
              isLoading={loadingMaquinas}
              options={Array.isArray(maquinas) ? (maquinas as any[]).map(m => ({
                value: m.id.toString(),
                label: m.nombre,
                sublabel: [m.patente || m.dominio, m.marca, m.modelo].filter(Boolean).join(" · ") || undefined,
                avatarUrl: m.imagen_url || null,
                initials: m.nombre?.slice(0, 2).toUpperCase(),
              })) : []}
            />
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <Label>Fecha *</Label>
            <Input
              type="date"
              value={form.fecha}
              min={hace7diasStr}
              max={ayerStr}
              onChange={e => set("fecha", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Máximo 7 días atrás. No se puede cargar el día de hoy por este formulario.</p>
          </div>

          {/* Horas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora de inicio *</Label>
              <Input type="time" value={form.hora_inicio} onChange={e => set("hora_inicio", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora de fin *</Label>
              <Input type="time" value={form.hora_fin} onChange={e => set("hora_fin", e.target.value)} required />
            </div>
          </div>

          {/* Horómetro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Horómetro inicio (h) *</Label>
              <Input type="text" inputMode="decimal" placeholder="4850.0" value={form.horometro_inicio} onChange={e => set("horometro_inicio", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Horómetro fin (h) *</Label>
              <Input type="text" inputMode="decimal" placeholder="4858.5" value={form.horometro_fin} onChange={e => set("horometro_fin", e.target.value)} required />
            </div>
          </div>

          {/* Resumen calculado */}
          {(horasReloj || horasHorometro) && (
            <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm border">
              {horasReloj && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Hs Reloj</p>
                  <p className="font-bold text-lg">{horasReloj} h</p>
                </div>
              )}
              {horasHorometro && (
                <div>
                  <p className="text-xs text-primary uppercase font-semibold">Hs Máquina</p>
                  <p className="font-bold text-lg text-primary">{horasHorometro} h</p>
                </div>
              )}
            </div>
          )}

          {/* Ubicación */}
          <div className="space-y-1">
            <Label>Ubicación / Zona de trabajo</Label>
            <Input placeholder="Ej. Ruta 7 km 45" value={form.ubicacion} onChange={e => set("ubicacion", e.target.value)} />
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <Label>Descripción del trabajo</Label>
            <Textarea placeholder="Describa brevemente qué trabajó ese día..." value={form.descripcion_trabajo} onChange={e => set("descripcion_trabajo", e.target.value)} rows={2} />
          </div>

          {/* Observaciones */}
          <div className="space-y-1">
            <Label>Motivo por el que no pudo registrarlo en el momento</Label>
            <Textarea placeholder="Ej. Sin señal, sin batería, olvidé..." value={form.observaciones} onChange={e => set("observaciones", e.target.value)} rows={2} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar Jornada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
