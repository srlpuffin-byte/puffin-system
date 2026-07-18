import React, { useState } from "react";
import { useCreateIncidente, useGetMaquinas, useGetEmpleados, getGetIncidentesQueryKey, useGetMe, useUploadFotografia } from "@workspace/api-client-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Camera, X, ImagePlus, Search } from "lucide-react";

const TIPOS_INCIDENTE = [
  { value: "rotura", label: "Rotura", color: "bg-orange-100 text-orange-800 border-orange-300" },
  { value: "golpe", label: "Golpe / Colisión", color: "bg-red-100 text-red-800 border-red-300" },
  { value: "accidente", label: "Accidente personal", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "falla", label: "Falla operativa", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "problema_mecanico", label: "Problema mecánico", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "otro", label: "Otro", color: "bg-gray-100 text-gray-800 border-gray-300" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquinaIdFija?: number;
  empleadoIdFijo?: number;
}

export function ReportarIncidenteDialog({ open, onOpenChange, maquinaIdFija, empleadoIdFijo }: Props) {
  const queryClient = useQueryClient();
  const createMut = useCreateIncidente();
  const uploadMut = useUploadFotografia();
  const { data: maquinas } = useGetMaquinas();
  const { data: empleados } = useGetEmpleados();
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";

  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    tipo: "",
    descripcion: "",
  });

  const [fotos, setFotos] = useState<{ base64: string; name: string; preview: string }[]>([]);
  const [maquinaSearch, setMaquinaSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  useEffect(() => {
    if (!open) {
      setFotos([]);
      setMaquinaSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (isEmpleado && user && empleados?.length) {
      const miEmpleado = empleados.find(e =>
        e.nombre.toLowerCase() === user.nombre.toLowerCase() &&
        e.apellido.toLowerCase() === user.apellido.toLowerCase()
      );
      if (miEmpleado && !form.empleado_id) {
        set("empleado_id", miEmpleado.id.toString());
      }
    }
  }, [isEmpleado, user, empleados, form.empleado_id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        setFotos(prev => [...prev, { base64, name: file.name, preview: result }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFoto = (idx: number) => setFotos(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipo || !form.descripcion) {
      toast.error("Tipo y descripción son obligatorios");
      return;
    }

    createMut.mutate(
      {
        data: {
          tipo: form.tipo as any,
          descripcion: form.descripcion,
          empleado_id: form.empleado_id ? parseInt(form.empleado_id) : undefined,
          maquina_id: form.maquina_id ? parseInt(form.maquina_id) : undefined,
        },
      },
      {
        onSuccess: async (incidente) => {
          if (fotos.length > 0 && incidente?.id) {
            toast.loading("Subiendo fotos...", { id: "uploading-inc-photos" });
            await Promise.all(fotos.map(f =>
              uploadMut.mutateAsync({
                data: {
                  entidad_tipo: "incidente",
                  entidad_id: incidente.id,
                  base64Data: f.base64,
                  filename: f.name,
                  descripcion: "Foto incidente"
                }
              }).catch(() => {})
            ));
            toast.dismiss("uploading-inc-photos");
          }
          toast.success("Incidente reportado correctamente");
          queryClient.invalidateQueries({ queryKey: getGetIncidentesQueryKey() });
          onOpenChange(false);
          setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", tipo: "", descripcion: "" });
          setFotos([]);
        },
        onError: () => toast.error("Error al reportar el incidente"),
      }
    );
  };

  const maquinasFiltradas = (Array.isArray(maquinas) ? maquinas : []).filter(m =>
    m.nombre.toLowerCase().includes(maquinaSearch.toLowerCase()) ||
    (m.patente || m.dominio || "").toLowerCase().includes(maquinaSearch.toLowerCase())
  );

  const maquinaSeleccionada = maquinas?.find(m => m.id.toString() === form.maquina_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <span className="text-xl">⚠️</span> Reportar Incidente
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">

          {/* TIPO - visual grid de botones */}
          <div className="space-y-2">
            <Label>Tipo de incidente *</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_INCIDENTE.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("tipo", t.value)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-all ${
                    form.tipo === t.value
                      ? t.color + " ring-2 ring-offset-1 ring-current shadow-sm"
                      : "border-border bg-muted/30 hover:bg-muted/60 text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* OPERARIO */}
          {!empleadoIdFijo && (
            <div className="space-y-1">
              <Label>Operario involucrado</Label>
              <Select value={form.empleado_id} onValueChange={v => set("empleado_id", v)} disabled={isEmpleado}>
                <SelectTrigger className="disabled:opacity-50"><SelectValue placeholder="(Opcional)" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(empleados) ? empleados : [])?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.apellido}, {e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* MÁQUINA con buscador */}
          {!maquinaIdFija && (
            <div className="space-y-1">
              <Label>Máquina involucrada</Label>
              <div className="border rounded-md overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar máquina..."
                    value={maquinaSearch}
                    onChange={e => setMaquinaSearch(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                  {maquinaSearch && (
                    <button type="button" onClick={() => setMaquinaSearch("")}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => set("maquina_id", "")}
                    className={`w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors ${!form.maquina_id ? "bg-primary/10 font-medium text-primary" : ""}`}
                  >
                    (Ninguna / No aplica)
                  </button>
                  {maquinasFiltradas.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                  ) : (
                    maquinasFiltradas.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => set("maquina_id", m.id.toString())}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between ${form.maquina_id === m.id.toString() ? "bg-primary/10 font-semibold text-primary" : ""}`}
                      >
                        <span>{m.nombre}</span>
                        {(m.patente || m.dominio) && (
                          <span className="text-xs text-muted-foreground ml-2">{m.patente || m.dominio}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
                {maquinaSeleccionada && (
                  <div className="px-3 py-1.5 bg-primary/10 border-t text-xs text-primary font-medium flex items-center justify-between">
                    <span>✓ Seleccionada: {maquinaSeleccionada.nombre}</span>
                    <button type="button" onClick={() => set("maquina_id", "")} className="hover:text-destructive ml-2">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DESCRIPCIÓN */}
          <div className="space-y-1">
            <Label>Descripción *</Label>
            <Textarea
              placeholder="Describir en detalle qué ocurrió..."
              value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              rows={3}
              required
            />
          </div>

          {/* FOTOS - vista previa mejorada */}
          <div className="space-y-2">
            <Label>Fotos del incidente</Label>
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border aspect-square bg-muted">
                    <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto(i)}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] px-1 py-0.5 truncate">
                      {f.name}
                    </div>
                  </div>
                ))}
                {/* Botón agregar más */}
                <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground mt-1">Agregar</span>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            )}
            {fotos.length === 0 && (
              <label className="flex items-center gap-3 w-full cursor-pointer border-2 border-dashed border-muted-foreground/30 rounded-lg px-4 py-4 hover:border-primary/50 hover:bg-muted/30 transition-colors">
                <Camera className="h-8 w-8 text-muted-foreground/50 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground/80">Agregar fotos</p>
                  <p className="text-xs text-muted-foreground">Tomar foto o seleccionar de la galería</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={createMut.isPending}>
              {createMut.isPending ? "Reportando..." : "Reportar Incidente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
