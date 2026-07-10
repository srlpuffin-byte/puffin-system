import React, { useState } from "react";
import { useIniciarJornada, useGetEmpleados, useGetMaquinas, getGetJornadasQueryKey, useUploadFotografia } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "../ui/multi-image-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empleadoIdFijo?: number;
  maquinaIdFija?: number;
}

export function IniciarJornadaDialog({ open, onOpenChange, empleadoIdFijo, maquinaIdFija }: Props) {
  const queryClient = useQueryClient();
  const createMut = useIniciarJornada();
  const uploadMut = useUploadFotografia();
  
  const { data: empleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas } = useGetMaquinas({ estado: "activa" });

  const [currentTab, setCurrentTab] = useState("general");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    horometro_inicio: "",
    km_inicio: "",
    observaciones: "",
    estado_equipo: "",
    ubicacion: "",
    tipo_trabajo: "",
  });

  const [checklist, setChecklist] = useState({
    // Seguridad
    cinturon: false,
    bocina: false,
    luces_delanteras: false,
    luces_traseras: false,
    balizas: false,
    espejos: false,
    matafuego: false,
    // Mecánica
    nivel_aceite: false,
    nivel_combustible: false,
    nivel_refrigerante: false,
    perdidas: false,
    neumaticos: false,
    // Tablero
    luces_advertencia: false,
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));
  const toggleCheck = (field: keyof typeof checklist) => setChecklist(prev => ({ ...prev, [field]: !prev[field] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empleado_id || !form.maquina_id || !form.horometro_inicio) {
      toast.error("Operario, máquina y horómetro son obligatorios");
      return;
    }
    if (!form.estado_equipo) {
      toast.error("Debe seleccionar el estado general del equipo");
      return;
    }

    try {
      // 1. Crear la jornada
      const jornada = await createMut.mutateAsync({
        data: {
          empleado_id: parseInt(form.empleado_id),
          maquina_id: parseInt(form.maquina_id),
          horometro_inicio: parseFloat(form.horometro_inicio),
          km_inicio: form.km_inicio ? parseFloat(form.km_inicio) : undefined,
          observaciones: form.observaciones || undefined,
          checklist_previo: JSON.stringify(checklist),
          estado_equipo_inicio: form.estado_equipo,
          ubicacion: form.ubicacion || undefined,
          tipo_trabajo: form.tipo_trabajo || undefined,
        },
      });

      // 2. Subir fotos si hay
      if (images.length > 0 && jornada.id) {
        toast.loading("Subiendo fotografías...", { id: "uploading-photos" });
        await Promise.all(images.map(img => 
          uploadMut.mutateAsync({
            data: {
              entidad_tipo: "jornada_inicio",
              entidad_id: jornada.id,
              base64Data: img.base64,
              filename: img.file.name,
              descripcion: "Foto preoperacional"
            }
          })
        ));
        toast.dismiss("uploading-photos");
      }

      toast.success("Jornada iniciada correctamente");
      queryClient.invalidateQueries({ queryKey: getGetJornadasQueryKey() });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.dismiss("uploading-photos");
      toast.error("Error al iniciar la jornada");
    }
  };

  const resetForm = () => {
    setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", horometro_inicio: "", km_inicio: "", observaciones: "", estado_equipo: "", ubicacion: "", tipo_trabajo: "" });
    setChecklist({ cinturon: false, bocina: false, luces_delanteras: false, luces_traseras: false, balizas: false, espejos: false, matafuego: false, nivel_aceite: false, nivel_combustible: false, nivel_refrigerante: false, perdidas: false, neumaticos: false, luces_advertencia: false });
    setImages([]);
    setCurrentTab("general");
  };

  const renderSwitch = (id: keyof typeof checklist, label: string) => (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <Label htmlFor={id} className="flex-1 cursor-pointer">{label}</Label>
      <Switch id={id} checked={checklist[id]} onCheckedChange={() => toggleCheck(id)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Iniciar Jornada y Checklist Preoperacional</DialogTitle>
          <DialogDescription>
            Complete los datos y verifique el estado del equipo antes de comenzar.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="py-2">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="general">1. General</TabsTrigger>
              <TabsTrigger value="seguridad">2. Seguridad</TabsTrigger>
              <TabsTrigger value="mecanica">3. Mecánica</TabsTrigger>
              <TabsTrigger value="fotos">4. Fotos/Fin</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              {!empleadoIdFijo && (
                <div className="space-y-1">
                  <Label>Operario *</Label>
                  <Select value={form.empleado_id} onValueChange={v => set("empleado_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar operario" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(empleados) ? empleados : [])?.map(e => (
                        <SelectItem key={e.id} value={e.id.toString()}>
                          {e.apellido}, {e.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!maquinaIdFija && (
                <div className="space-y-1">
                  <Label>Máquina *</Label>
                  <Select value={form.maquina_id} onValueChange={v => set("maquina_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar máquina" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(maquinas) ? maquinas : [])?.map(m => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.nombre} ({m.codigo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Horómetro inicial (h) *</Label>
                  <Input type="number" step="0.1" placeholder="4850" value={form.horometro_inicio} onChange={e => set("horometro_inicio", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Km inicial (si aplica)</Label>
                  <Input type="number" placeholder="89500" value={form.km_inicio} onChange={e => set("km_inicio", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Ubicación / Zona de trabajo</Label>
                  <Input placeholder="Ej. Romedal, Ruta 7 km 45" value={form.ubicacion} onChange={e => set("ubicacion", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo de trabajo</Label>
                  <Select value={form.tipo_trabajo} onValueChange={v => set("tipo_trabajo", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desmonte">Desmonte</SelectItem>
                      <SelectItem value="movimiento_suelo">Movimiento de suelo</SelectItem>
                      <SelectItem value="transporte">Transporte</SelectItem>
                      <SelectItem value="compactacion">Compactación</SelectItem>
                      <SelectItem value="nivelacion">Nivelación</SelectItem>
                      <SelectItem value="excavacion">Excavación</SelectItem>
                      <SelectItem value="mantenimiento_vial">Mantenimiento vial</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="button" onClick={() => setCurrentTab("seguridad")}>Siguiente</Button>
              </div>
            </TabsContent>

            <TabsContent value="seguridad" className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Marque los elementos que verificó y están en orden:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderSwitch("cinturon", "Cinturón de seguridad")}
                {renderSwitch("bocina", "Bocina")}
                {renderSwitch("luces_delanteras", "Luces delanteras")}
                {renderSwitch("luces_traseras", "Luces traseras")}
                {renderSwitch("balizas", "Balizas")}
                {renderSwitch("espejos", "Espejos")}
                {renderSwitch("matafuego", "Matafuego (Presencia)")}
              </div>
              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={() => setCurrentTab("general")}>Atrás</Button>
                <Button type="button" onClick={() => setCurrentTab("mecanica")}>Siguiente</Button>
              </div>
            </TabsContent>

            <TabsContent value="mecanica" className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Verificaciones mecánicas y generales:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderSwitch("nivel_aceite", "Nivel de aceite")}
                {renderSwitch("nivel_combustible", "Nivel de combustible")}
                {renderSwitch("nivel_refrigerante", "Nivel de refrigerante")}
                {renderSwitch("perdidas", "Ausencia de pérdidas (aceite/agua)")}
                {renderSwitch("neumaticos", "Estado de neumáticos / orugas")}
                {renderSwitch("luces_advertencia", "Tablero sin luces de advertencia")}
              </div>
              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={() => setCurrentTab("seguridad")}>Atrás</Button>
                <Button type="button" onClick={() => setCurrentTab("fotos")}>Siguiente</Button>
              </div>
            </TabsContent>

            <TabsContent value="fotos" className="space-y-4">
              <div className="space-y-2">
                <Label>Fotografías (Tablero, Estado General, Daños)</Label>
                <MultiImageUpload images={images} onChange={setImages} maxImages={4} />
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>Resultado de la Inspección *</Label>
                <Select value={form.estado_equipo} onValueChange={v => set("estado_equipo", v)} required>
                  <SelectTrigger className={
                    form.estado_equipo === "apto" ? "border-green-500 text-green-700 bg-green-50" :
                    form.estado_equipo === "apto_observaciones" ? "border-yellow-500 text-yellow-700 bg-yellow-50" :
                    form.estado_equipo === "no_apto" ? "border-red-500 text-red-700 bg-red-50" : ""
                  }>
                    <SelectValue placeholder="Seleccione el estado final..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apto">
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> Equipo apto para trabajar</div>
                    </SelectItem>
                    <SelectItem value="apto_observaciones">
                      <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500"/> Equipo apto con observaciones</div>
                    </SelectItem>
                    <SelectItem value="no_apto">
                      <div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500"/> Equipo NO APTO para trabajar</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {form.estado_equipo === "no_apto" && (
                  <p className="text-sm text-red-600 font-medium mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> ¡Atención! Se generará una alerta roja automáticamente.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Observaciones adicionales</Label>
                <Textarea placeholder="Detalle cualquier novedad encontrada..." value={form.observaciones} onChange={e => set("observaciones", e.target.value)} rows={3} />
              </div>

              <DialogFooter className="pt-4 flex justify-between sm:justify-between w-full">
                <Button type="button" variant="outline" onClick={() => setCurrentTab("mecanica")}>Atrás</Button>
                <Button type="submit" className="bg-primary" disabled={createMut.isPending || uploadMut.isPending}>
                  {(createMut.isPending || uploadMut.isPending) ? "Guardando..." : "Confirmar e Iniciar Jornada"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  );
}
