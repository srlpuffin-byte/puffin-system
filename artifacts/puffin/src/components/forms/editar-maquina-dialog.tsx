import React, { useState, useEffect } from "react";
import { useUpdateMaquina, getGetMaquinaQueryKey, getGetMaquinasQueryKey, useUploadFotografia, MaquinaUpdateEstado } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "../ui/multi-image-upload";

const TIPOS_MAQUINA = ["Retroexcavadora", "Niveladora", "Compactadora", "Camión", "Camión Cisterna", "Grúa", "Pala Cargadora", "Minicargadora", "Bulldozer", "Motoniveladora", "Otro"];
const TIPOS_INVENTARIO = ["Casilla Rodante", "Tanque de Combustible", "Carro Herramientas", "Generador", "Compresor", "Bomba de Agua", "Torre de Iluminación", "Herramienta Menor", "Otro"];
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquina: any;
}

export function EditarMaquinaDialog({ open, onOpenChange, maquina }: Props) {
  const queryClient = useQueryClient();
  const updateMut = useUpdateMaquina();
  const uploadMut = useUploadFotografia();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [form, setForm] = useState({
    codigo: "", nombre: "", tipo: "", marca: "", modelo: "",
    anio: "", patente: "", dominio: "", horometro: "", kilometros: "",
    motor: "", chasis: "", estado: "",
    filtro_tipo: "", filtro_codigo: "", filtro_fecha_cambio: "", filtro_proximo_cambio: ""
  });

  const categoria = maquina?.categoria || "maquinaria";

  useEffect(() => {
    if (maquina && open) {
      setForm({
        codigo: maquina.codigo || "",
        nombre: maquina.nombre || "",
        tipo: maquina.tipo || "",
        marca: maquina.marca || "",
        modelo: maquina.modelo || "",
        anio: maquina.anio?.toString() || "",
        patente: maquina.patente || "",
        dominio: maquina.dominio || "",
        horometro: maquina.horometro?.toString() || "",
        kilometros: maquina.kilometros?.toString() || "",
        motor: maquina.motor || "",
        chasis: maquina.chasis || "",
        estado: maquina.estado || "activa",
        filtro_tipo: maquina.filtro_tipo || "",
        filtro_codigo: maquina.filtro_codigo || "",
        filtro_fecha_cambio: maquina.filtro_fecha_cambio || "",
        filtro_proximo_cambio: maquina.filtro_proximo_cambio || "",
      });
      setImages([]);
    }
  }, [maquina, open]);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.tipo) {
      toast.error("Nombre y tipo son obligatorios");
      return;
    }
    updateMut.mutate(
      {
        id: maquina.id,
        data: {
          codigo: form.codigo || undefined,
          nombre: form.nombre,
          tipo: form.tipo,
          marca: form.marca || undefined,
          modelo: form.modelo || undefined,
          anio: form.anio ? parseInt(form.anio) : undefined,
          patente: form.patente || undefined,
          dominio: form.dominio || undefined,
          horometro: form.horometro ? parseFloat(form.horometro) : undefined,
          kilometros: form.kilometros ? parseFloat(form.kilometros) : undefined,
          motor: form.motor || undefined,
          chasis: form.chasis || undefined,
          estado: form.estado as MaquinaUpdateEstado || undefined,
          filtro_tipo: form.filtro_tipo || undefined,
          filtro_codigo: form.filtro_codigo || undefined,
          filtro_fecha_cambio: form.filtro_fecha_cambio || undefined,
          filtro_proximo_cambio: form.filtro_proximo_cambio || undefined,
        },
      },
      {
        onSuccess: async () => {
          if (images.length > 0) {
            toast.loading("Subiendo fotografía...", { id: "uploading-photos-edit-maquina" });
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
              toast.dismiss("uploading-photos-edit-maquina");
            } catch (err) {
              toast.dismiss("uploading-photos-edit-maquina");
              toast.error("Error al subir fotografía");
            }
          }
          toast.success("Máquina actualizada correctamente");
          queryClient.invalidateQueries({ queryKey: getGetMaquinaQueryKey(maquina.id) });
          queryClient.invalidateQueries({ queryKey: getGetMaquinasQueryKey() });
          onOpenChange(false);
          setImages([]);
        },
        onError: () => toast.error("Error al actualizar la máquina"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {categoria === "maquinaria" ? "Máquina" : "Ítem de Inventario"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Código interno</Label>
              <Input placeholder="Ej. RX-12" value={form.codigo} onChange={e => set("codigo", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input placeholder="Ej. Retroexcavadora 12" value={form.nombre} onChange={e => set("nombre", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  {(categoria === "maquinaria" ? TIPOS_MAQUINA : TIPOS_INVENTARIO).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => set("estado", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activa">Activa</SelectItem>
                  <SelectItem value="detenida">Detenida</SelectItem>
                  <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input placeholder="Ej. Caterpillar" value={form.marca} onChange={e => set("marca", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input placeholder="Ej. 320D" value={form.modelo} onChange={e => set("modelo", e.target.value)} />
            </div>
          </div>

          {categoria === "maquinaria" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Año</Label>
                  <Input type="number" placeholder="Ej. 2020" value={form.anio} onChange={e => set("anio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Patente (vehículos)</Label>
                  <Input placeholder="Ej. AB 123 CD" value={form.patente} onChange={e => set("patente", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Dominio / Identificador</Label>
                  <Input placeholder="Ej. RX-012" value={form.dominio} onChange={e => set("dominio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Horómetro (h)</Label>
                  <Input type="number" step="0.1" placeholder="0" value={form.horometro} onChange={e => set("horometro", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Kilometraje (km)</Label>
                <Input type="number" placeholder="0" value={form.kilometros} onChange={e => set("kilometros", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Número de motor</Label>
                  <Input placeholder="Ej. 4HK1-123456" value={form.motor} onChange={e => set("motor", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Número de chasis</Label>
                  <Input placeholder="Ej. JALE6LX1..." value={form.chasis} onChange={e => set("chasis", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Tipo de filtro</Label>
                  <Input placeholder="Ej. Aceite / Aire" value={form.filtro_tipo} onChange={e => set("filtro_tipo", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Código de filtro</Label>
                  <Input placeholder="Ej. LF3349" value={form.filtro_codigo} onChange={e => set("filtro_codigo", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fecha cambio filtro</Label>
                  <Input type="date" value={form.filtro_fecha_cambio} onChange={e => set("filtro_fecha_cambio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Próximo cambio filtro</Label>
                  <Input type="date" value={form.filtro_proximo_cambio} onChange={e => set("filtro_proximo_cambio", e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Actualizar Fotografía (Opcional)</Label>
            <MultiImageUpload images={images} onChange={setImages} maxImages={1} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary" disabled={updateMut.isPending}>
              {updateMut.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
