import React, { useState } from "react";
import { useIniciarJornada, useGetEmpleados, useGetMaquinas, getGetJornadasQueryKey, useUploadFotografia, useGetMe } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "../ui/multi-image-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { MobilePickerSheet } from "@/components/ui/mobile-picker-sheet";

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
  
  const { data: empleados, isLoading: loadingEmpleados } = useGetEmpleados({ estado: "activo" });
  const { data: maquinas, isLoading: loadingMaquinas } = useGetMaquinas({});
  const { data: proyectos } = useGetProyectos();
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";

  const [currentTab, setCurrentTab] = useState("general");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string[] | null>(null);
  const [form, setForm] = useState({
    empleado_id: empleadoIdFijo?.toString() || "",
    maquina_id: maquinaIdFija?.toString() || "",
    horometro_inicio: "",
    km_inicio: "",
    observaciones: "",
    estado_equipo: "",
    ubicacion: "",
    tipo_trabajo: "",
    nombre_obra: "",
    descripcion_trabajo: "",
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

  const doSubmit = async (confirmarDuplicado = false) => {
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
          nombre_obra: form.nombre_obra || undefined,
          descripcion_trabajo: form.descripcion_trabajo || undefined,
          ...(confirmarDuplicado ? { confirmar_duplicado: true } : {}),
        } as any,
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
    } catch (error: any) {
      toast.dismiss("uploading-photos");
      // Check if it's a duplicate conflict (409)
      const body = error?.response?.data || error?.data;
      if (body?.error === "conflict" && body?.conflictos?.length > 0) {
        setConflictWarning(body.conflictos);
      } else {
        toast.error("Error al iniciar la jornada");
      }
    }
  };

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
    await doSubmit(false);
  };

  const resetForm = () => {
    setForm({ empleado_id: empleadoIdFijo?.toString() || "", maquina_id: maquinaIdFija?.toString() || "", horometro_inicio: "", km_inicio: "", observaciones: "", estado_equipo: "", ubicacion: "", tipo_trabajo: "", nombre_obra: "", descripcion_trabajo: "" });
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
    <>
      {/* Conflict warning AlertDialog */}
      <AlertDialog open={!!conflictWarning} onOpenChange={(v) => { if (!v) setConflictWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> ¡Atención! Jornada ya en curso
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-1">
              <p className="text-sm font-medium text-slate-700">Se detectaron las siguientes jornadas activas:</p>
              {conflictWarning?.map((c, i) => (
                <p key={i} className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">⚠️ {c}</p>
              ))}
              <p className="text-sm text-slate-600 pt-1">¿Querés crear una nueva jornada igual?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflictWarning(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => { setConflictWarning(null); doSubmit(true); }}
            >
              Sí, crear igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }} modal={false}>
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
                  <MobilePickerSheet
                    value={form.empleado_id}
                    onChange={v => set("empleado_id", v)}
                    placeholder="Seleccionar operario"
                    searchPlaceholder="Buscar operario..."
                    recentStorageKey="puffin_recent_operarios"
                    disabled={isEmpleado}
                    isLoading={loadingEmpleados}
                    options={Array.isArray(empleados) ? empleados.map((e: any) => ({
                      value: e.id.toString(),
                      label: `${e.apellido}, ${e.nombre}`,
                      sublabel: e.cargo || undefined,
                      avatarUrl: e.foto_perfil || null,
                      initials: `${e.nombre?.[0] || ""}${e.apellido?.[0] || ""}`,
                    })) : []}
                  />
                </div>
              )}
              {!maquinaIdFija && (
                <div className="space-y-1">
                  <Label>Máquina *</Label>
                  <MobilePickerSheet
                    value={form.maquina_id}
                    onChange={v => set("maquina_id", v)}
                    placeholder="Seleccionar máquina"
                    searchPlaceholder="Buscar máquina..."
                    recentStorageKey="puffin_recent_maquinas"
                    isLoading={loadingMaquinas}
                    options={Array.isArray(maquinas) ? maquinas
                      .map((m: any) => ({
                        value: m.id.toString(),
                        label: m.nombre,
                        sublabel: [m.patente || m.dominio, m.marca, m.modelo].filter(Boolean).join(" · ") || undefined,
                        avatarUrl: m.imagen_url || null,
                        initials: m.nombre?.slice(0, 2).toUpperCase(),
                      })) : []}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Horómetro inicial (h) *</Label>
                  <Input type="text" inputMode="decimal" placeholder="4850" value={form.horometro_inicio} onChange={e => set("horometro_inicio", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Km inicial (si aplica)</Label>
                  <Input type="text" inputMode="numeric" placeholder="89500" value={form.km_inicio} onChange={e => set("km_inicio", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Nombre de la Obra</Label>
                  <Input placeholder="Ej. El Romedal" value={form.nombre_obra} onChange={e => set("nombre_obra", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Ubicación / Zona de trabajo</Label>
                  <Input placeholder="Ej. Ruta 7 km 45" value={form.ubicacion} onChange={e => set("ubicacion", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Descripción del Trabajo</Label>
                <Textarea placeholder="Describa brevemente el trabajo a realizar..." value={form.descripcion_trabajo} onChange={e => set("descripcion_trabajo", e.target.value)} rows={2} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Tipo de trabajo</Label>
                  <select
                    value={form.tipo_trabajo}
                    onChange={e => set("tipo_trabajo", e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="desmonte">Desmonte</option>
                    <option value="movimiento_suelo">Movimiento de suelo</option>
                    <option value="transporte">Transporte</option>
                    <option value="compactacion">Compactación</option>
                    <option value="nivelacion">Nivelación</option>
                    <option value="excavacion">Excavación</option>
                    <option value="mantenimiento_vial">Mantenimiento vial</option>
                    <option value="otro">Otro</option>
                  </select>
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
                <select
                  value={form.estado_equipo}
                  onChange={e => set("estado_equipo", e.target.value)}
                  required
                  className={`w-full h-10 px-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                    form.estado_equipo === "apto" ? "border-green-500 text-green-700 bg-green-50" :
                    form.estado_equipo === "apto_observaciones" ? "border-yellow-500 text-yellow-700 bg-yellow-50" :
                    form.estado_equipo === "no_apto" ? "border-red-500 text-red-700 bg-red-50" :
                    "border-input bg-background"
                  }`}
                >
                  <option value="">Seleccione el estado final...</option>
                  <option value="apto">✅ Equipo apto para trabajar</option>
                  <option value="apto_observaciones">⚠️ Equipo apto con observaciones</option>
                  <option value="no_apto">❌ Equipo NO APTO para trabajar</option>
                </select>
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
    </>
  );
}
