import React, { useState } from "react";
import { useFinalizarJornada, getGetJornadasQueryKey, useUploadFotografia } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "../ui/multi-image-upload";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jornadaId: number;
  empleadoNombre?: string;
  maquinaNombre?: string;
  horometroInicio?: number | null;
}

export function FinalizarJornadaDialog({ open, onOpenChange, jornadaId, empleadoNombre, maquinaNombre, horometroInicio }: Props) {
  const queryClient = useQueryClient();
  const finalizarMut = useFinalizarJornada();
  const uploadMut = useUploadFotografia();
  
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [form, setForm] = useState({ 
    horometro_fin: "", 
    km_fin: "", 
    problemas: "",
    estado_equipo_fin: ""
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.horometro_fin) {
      toast.error("El horómetro final es obligatorio");
      return;
    }
    if (!form.estado_equipo_fin) {
      toast.error("Debe indicar el estado en que entrega el equipo");
      return;
    }

    try {
      await finalizarMut.mutateAsync({
        id: jornadaId,
        data: {
          horometro_fin: parseFloat(form.horometro_fin),
          km_fin: form.km_fin ? parseFloat(form.km_fin) : undefined,
          problemas: form.problemas || undefined,
          estado_equipo_fin: form.estado_equipo_fin
        },
      });

      if (images.length > 0) {
        toast.loading("Subiendo fotografías del cierre...", { id: "uploading-photos-fin" });
        await Promise.all(images.map(img => 
          uploadMut.mutateAsync({
            data: {
              entidad_tipo: "jornada_fin",
              entidad_id: jornadaId,
              base64Data: img.base64,
              filename: img.file.name,
              descripcion: "Foto postoperacional (Cierre)"
            }
          })
        ));
        toast.dismiss("uploading-photos-fin");
      }

      toast.success("Jornada finalizada correctamente");
      queryClient.invalidateQueries({ queryKey: getGetJornadasQueryKey() });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.dismiss("uploading-photos-fin");
      toast.error("Error al finalizar la jornada");
    }
  };

  const resetForm = () => {
    setForm({ horometro_fin: "", km_fin: "", problemas: "", estado_equipo_fin: "" });
    setImages([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Jornada (Checklist de Cierre)</DialogTitle>
          <DialogDescription>
            {empleadoNombre && <span>{empleadoNombre}</span>}
            {maquinaNombre && <span> • {maquinaNombre}</span>}
            {horometroInicio != null && <span> • Inicio: {horometroInicio}h</span>}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Horómetro final (h) *</Label>
              <Input type="number" step="0.1" placeholder={horometroInicio?.toString() || "0"} value={form.horometro_fin} onChange={e => set("horometro_fin", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Km final (si aplica)</Label>
              <Input type="number" placeholder="0" value={form.km_fin} onChange={e => set("km_fin", e.target.value)} />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label>Estado del equipo al finalizar *</Label>
            <Select value={form.estado_equipo_fin} onValueChange={v => set("estado_equipo_fin", v)} required>
              <SelectTrigger className={
                form.estado_equipo_fin === "sin_novedades" ? "border-green-500 text-green-700 bg-green-50" :
                form.estado_equipo_fin === "con_observaciones" ? "border-blue-500 text-blue-700 bg-blue-50" :
                form.estado_equipo_fin === "requiere_mantenimiento" ? "border-yellow-500 text-yellow-700 bg-yellow-50" :
                form.estado_equipo_fin === "fuera_de_servicio" ? "border-red-500 text-red-700 bg-red-50" : ""
              }>
                <SelectValue placeholder="Seleccione cómo entrega el equipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin_novedades">
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> Sin novedades (Operativo)</div>
                </SelectItem>
                <SelectItem value="con_observaciones">
                  <div className="flex items-center gap-2"><Info className="w-4 h-4 text-blue-500"/> Con observaciones menores (Operativo)</div>
                </SelectItem>
                <SelectItem value="requiere_mantenimiento">
                  <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500"/> Requiere mantenimiento pronto</div>
                </SelectItem>
                <SelectItem value="fuera_de_servicio">
                  <div className="flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-red-500"/> Fuera de servicio (Roto / Peligroso)</div>
                </SelectItem>
              </SelectContent>
            </Select>
            {(form.estado_equipo_fin === "requiere_mantenimiento" || form.estado_equipo_fin === "fuera_de_servicio") && (
              <p className="text-sm text-yellow-600 font-medium mt-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Se generará una alerta automáticamente para los supervisores.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Fotografías del cierre (opcional)</Label>
            <MultiImageUpload images={images} onChange={setImages} maxImages={4} />
          </div>

          <div className="space-y-1">
            <Label>Novedades / Problemas presentados</Label>
            <Textarea placeholder="Describir cualquier problema que haya surgido durante la jornada..." value={form.problemas} onChange={e => set("problemas", e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={finalizarMut.isPending || uploadMut.isPending}>
              {(finalizarMut.isPending || uploadMut.isPending) ? "Finalizando..." : "Finalizar Jornada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
