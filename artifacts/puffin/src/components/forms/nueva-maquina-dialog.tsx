import React, { useState } from "react";
import { useCreateMaquina, useGetMaquinas, useUploadFotografia } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMaquinasQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "../ui/multi-image-upload";

const TIPOS_MAQUINA = ["Retroexcavadora", "Niveladora", "Compactadora", "Camión", "Camión Cisterna", "Grúa", "Pala Cargadora", "Minicargadora", "Bulldozer", "Motoniveladora", "Otro"];
const TIPOS_INVENTARIO = ["Casilla Rodante", "Tanque de Agua", "Tanque de Combustible", "Herramienta Manual", "Herramienta Eléctrica", "Repuesto", "Otro"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategoria?: "maquinaria" | "inventario";
}

export function NuevaMaquinaDialog({ open, onOpenChange, defaultCategoria = "maquinaria" }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateMaquina();
  const uploadMut = useUploadFotografia();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [form, setForm] = useState({
    codigo: "", nombre: "", tipo: "", marca: "", modelo: "",
    anio: "", patente: "", dominio: "", horometro: "", kilometros: "",
    motor: "", chasis: "",
    filtro_tipo: "", filtro_codigo: "", filtro_fecha_cambio: "", filtro_proximo_cambio: ""
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.tipo) {
      toast.error("Nombre y tipo son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          categoria: defaultCategoria,
          codigo: form.codigo || undefined,
          nombre: form.nombre,
          tipo: form.tipo,
          marca: form.marca || undefined,
          modelo: form.modelo || undefined,
          anio: form.anio ? parseInt(form.anio) : undefined,
          patente: form.patente || undefined,
          dominio: form.dominio || undefined,
          horometro: defaultCategoria === "maquinaria" && form.horometro ? parseFloat(form.horometro) : undefined,
          kilometros: defaultCategoria === "maquinaria" && form.kilometros ? parseFloat(form.kilometros) : undefined,
          motor: form.motor || undefined,
          chasis: form.chasis || undefined,
          filtro_tipo: form.filtro_tipo || undefined,
          filtro_codigo: form.filtro_codigo || undefined,
          filtro_fecha_cambio: form.filtro_fecha_cambio || undefined,
          filtro_proximo_cambio: form.filtro_proximo_cambio || undefined,
        },
      },
      {
        onSuccess: async (maquina) => {
          if (images.length > 0 && maquina.id) {
            toast.loading("Subiendo fotografía...", { id: "uploading-photos-maquina" });
            try {
              await Promise.all(images.map(img => 
                uploadMut.mutateAsync({
                  data: {
                    entidad_tipo: "maquina",
                    entidad_id: maquina.id,
                    base64Data: img.base64,
                    filename: img.file.name,
                    descripcion: "Foto de la máquina"
                  }
                })
              ));
              toast.dismiss("uploading-photos-maquina");
            } catch (err) {
              toast.dismiss("uploading-photos-maquina");
              toast.error("Error al subir fotografía");
            }
          }
          toast.success("Máquina creada correctamente");
          queryClient.invalidateQueries({ queryKey: getGetMaquinasQueryKey() });
          onOpenChange(false);
          setForm({ codigo: "", nombre: "", tipo: "", marca: "", modelo: "", anio: "", patente: "", dominio: "", horometro: "", kilometros: "", motor: "", chasis: "", filtro_tipo: "", filtro_codigo: "", filtro_fecha_cambio: "", filtro_proximo_cambio: "" });
          setImages([]);
        },
        onError: () => toast.error("Error al crear la máquina"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{defaultCategoria === "maquinaria" ? "Nueva Máquina" : "Nuevo Ítem de Inventario"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre {defaultCategoria === "maquinaria" ? "de Máquina" : "del Ítem"}</Label>
              <Input placeholder={defaultCategoria === "maquinaria" ? "Ej. Excavadora Cat" : "Ej. Casilla 4 camas"} value={form.nombre} onChange={e => set("nombre", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => set("tipo", v)} required>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {(defaultCategoria === "maquinaria" ? TIPOS_MAQUINA : TIPOS_INVENTARIO).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Código / Identificador interno</Label>
              <Input placeholder="Ej. MAQ-01" value={form.codigo} onChange={e => set("codigo", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={form.marca} onChange={e => set("marca", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input value={form.modelo} onChange={e => set("modelo", e.target.value)} />
            </div>
            {defaultCategoria === "maquinaria" && (
              <>
                <div className="space-y-1">
                  <Label>Año</Label>
                  <Input type="number" value={form.anio} onChange={e => set("anio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Patente</Label>
                  <Input value={form.patente} onChange={e => set("patente", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Dominio (Maquinaria agrícola)</Label>
                  <Input value={form.dominio} onChange={e => set("dominio", e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>Fotografía de la Máquina</Label>
            <MultiImageUpload images={images} onChange={setImages} maxImages={1} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Guardando..." : "Crear Máquina"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
