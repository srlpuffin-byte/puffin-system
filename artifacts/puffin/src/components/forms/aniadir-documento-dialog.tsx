import React, { useState } from "react";
import { useCreateDocumento, useGetMaquinas, useGetEmpleados, getGetDocumentosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const TIPOS_DOC = ["Seguro", "VTV", "Carnet", "Habilitación", "Patente", "Permiso de circulación", "Inspección técnica", "Certificado", "Contrato", "Otro"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEntidadTipo?: string;
  defaultEntidadId?: string;
}

export function AñadirDocumentoDialog({ open, onOpenChange, defaultEntidadTipo, defaultEntidadId }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateDocumento();
  const { data: maquinas } = useGetMaquinas();
  const { data: empleados } = useGetEmpleados();

  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [form, setForm] = useState({
    tipo: "",
    descripcion: "",
    entidad_tipo: defaultEntidadTipo || "",
    entidad_id: defaultEntidadId || "",
    fecha_vencimiento: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (open) {
      setForm({
        tipo: "",
        descripcion: "",
        entidad_tipo: defaultEntidadTipo || "",
        entidad_id: defaultEntidadId || "",
        fecha_vencimiento: "",
      });
    }
  }, [open, defaultEntidadTipo, defaultEntidadId]);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        toast.error("El archivo no puede pesar más de 10MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFile({ name: selected.name, base64: reader.result as string });
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.tipo || !form.fecha_vencimiento) {
      toast.error("Tipo y fecha de vencimiento son obligatorios");
      return;
    }
    setIsSubmitting(true);
    createMut.mutate(
      {
        data: {
          tipo: form.tipo,
          descripcion: form.descripcion || undefined,
          entidad_tipo: form.entidad_tipo || undefined,
          entidad_id: form.entidad_id ? parseInt(form.entidad_id) : undefined,
          fecha_vencimiento: form.fecha_vencimiento,
          base64Data: file?.base64,
          filename: file?.name,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Documento añadido correctamente");
          queryClient.invalidateQueries({ queryKey: getGetDocumentosQueryKey() });
          onOpenChange(false);
          setForm({ tipo: "", descripcion: "", entidad_tipo: "", entidad_id: "", fecha_vencimiento: "" });
          setFile(null);
          setIsSubmitting(false);
        },
        onError: () => {
          toast.error("Error al añadir el documento");
          setIsSubmitting(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir Documento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tipo de documento *</Label>
            <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
              <SelectContent>
                {TIPOS_DOC.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea placeholder="Descripción del documento..." value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Asociar a</Label>
            <Select value={form.entidad_tipo} onValueChange={v => { set("entidad_tipo", v); set("entidad_id", ""); }}>
              <SelectTrigger><SelectValue placeholder="(Opcional) Máquina o Operario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="maquina">Máquina</SelectItem>
                <SelectItem value="empleado">Operario</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.entidad_tipo === "maquina" && (
            <div className="space-y-1">
              <Label>Máquina</Label>
              <Select value={form.entidad_id} onValueChange={v => set("entidad_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar máquina" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(maquinas) ? maquinas.filter(m => m.categoria !== "inventario") : [])?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.entidad_tipo === "empleado" && (
            <div className="space-y-1">
              <Label>Operario</Label>
              <Select value={form.entidad_id} onValueChange={v => set("entidad_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar operario" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(empleados) ? empleados : [])?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Fecha de vencimiento *</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Archivo (Opcional - Imagen o PDF)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={handleFileChange} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Añadir Documento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
