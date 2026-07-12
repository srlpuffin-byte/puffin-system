import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUploadFotografia, useGetFotografias } from "@workspace/api-client-react";
import { useGetEmpleadosMe } from "@/hooks/use-get-empleados-me";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MultiImageUpload, UploadedImage } from "@/components/ui/multi-image-upload";
import { apiFetch } from "@/lib/api";
import { Loader2, Save } from "lucide-react";

export function MisDatos() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const uploadMut = useUploadFotografia();
  const { data: operario, isLoading } = useGetEmpleadosMe();
  
  const { data: fotografias } = useGetFotografias(
    { entidad_tipo: "empleado", entidad_id: operario?.id ?? 0 }, 
    { query: { enabled: !!operario?.id } as any }
  );

  const fotoPerfilExistente = fotografias?.find(f => f.descripcion === "Foto de perfil" || f.descripcion?.toLowerCase().includes("perfil"));
  const fotoCarnetExistente = fotografias?.find(f => f.descripcion === "Carnet de conducir" || f.descripcion?.toLowerCase().includes("carnet"));

  const [fotoPerfil, setFotoPerfil] = useState<UploadedImage[]>([]);
  const [fotoCarnet, setFotoCarnet] = useState<UploadedImage[]>([]);

  const [form, setForm] = useState({
    nombre: "", apellido: "", dni: "", telefono: "",
    contacto_familiar_nombre: "", contacto_familiar_telefono: "", contacto_familiar_relacion: ""
  });

  useEffect(() => {
    if (operario) {
      setForm({
        nombre: operario.nombre || "",
        apellido: operario.apellido || "",
        dni: operario.dni === "COMPLETAR" ? "" : (operario.dni || ""),
        telefono: operario.telefono || "",
        contacto_familiar_nombre: operario.contacto_familiar_nombre || "",
        contacto_familiar_telefono: operario.contacto_familiar_telefono || "",
        contacto_familiar_relacion: (operario as any).contacto_familiar_relacion || ""
      });
      setFotoPerfil([]);
      setFotoCarnet([]);
    }
  }, [operario]);

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.apellido || !form.dni) {
      toast.error("Nombre, apellido y DNI son obligatorios");
      return;
    }
    if (!operario) return;

    setIsPending(true);
    try {
      await apiFetch(`/empleados/${operario.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nombre: form.nombre,
          apellido: form.apellido,
          dni: form.dni,
          telefono: form.telefono || null,
          contacto_familiar_nombre: form.contacto_familiar_nombre || null,
          contacto_familiar_telefono: form.contacto_familiar_telefono || null,
          contacto_familiar_relacion: form.contacto_familiar_relacion || null,
        }),
      });

      // Subir fotos si hay
      if (fotoPerfil.length > 0 || fotoCarnet.length > 0) {
        try {
          const uploads = [];
          if (fotoPerfil.length > 0) {
            uploads.push(uploadMut.mutateAsync({
              data: { entidad_tipo: "empleado", entidad_id: operario.id, base64Data: fotoPerfil[0].base64, filename: fotoPerfil[0].file.name, descripcion: "Foto de perfil" }
            }));
          }
          if (fotoCarnet.length > 0) {
            uploads.push(uploadMut.mutateAsync({
              data: { entidad_tipo: "empleado", entidad_id: operario.id, base64Data: fotoCarnet[0].base64, filename: fotoCarnet[0].file.name, descripcion: "Carnet de conducir" }
            }));
          }
          await Promise.all(uploads);
        } catch {
          toast.error("Datos guardados, pero hubo un error al subir las fotos");
        }
      }

      toast.success("Tus datos han sido guardados correctamente");
      queryClient.invalidateQueries({ queryKey: ["/api/empleados/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/fotografias`] });
      setFotoPerfil([]);
      setFotoCarnet([]);
    } catch (err: any) {
      toast.error(err?.message || "Error al guardar tus datos");
    } finally {
      setIsPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!operario) {
    return (
      <div className="text-center text-red-500 mt-10">
        Error: No se encontró tu perfil de empleado.
      </div>
    );
  }

  const isFaltante = !operario.dni || operario.dni === "COMPLETAR" || !operario.telefono || !operario.contacto_familiar_telefono;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Mis Datos Personales</h1>
        <p className="text-muted-foreground">Actualiza tu información de contacto y legajo.</p>
      </div>

      {isFaltante && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
          <div className="bg-red-100 p-2 rounded-full mt-1">
            <span className="text-xl">🔴</span>
          </div>
          <div>
            <h3 className="font-semibold text-red-800">Falta Información</h3>
            <p className="text-sm text-red-700">Por favor completa tus datos personales, DNI, teléfono y contacto de emergencia para tener tu legajo al día.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Información del Legajo</CardTitle>
          <CardDescription>Esta información es requerida por administración.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input value={form.nombre} onChange={e => set("nombre", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Apellido *</Label>
                <Input value={form.apellido} onChange={e => set("apellido", e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>DNI *</Label>
                <Input value={form.dni} onChange={e => set("dni", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Teléfono Celular *</Label>
                <Input value={form.telefono} onChange={e => set("telefono", e.target.value)} required placeholder="Ej. +54 9 11 1234-5678" />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Contacto de Emergencia</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Nombre del Familiar *</Label>
                  <Input value={form.contacto_familiar_nombre} onChange={e => set("contacto_familiar_nombre", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono de Emergencia *</Label>
                  <Input value={form.contacto_familiar_telefono} onChange={e => set("contacto_familiar_telefono", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Relación / Parentesco</Label>
                  <Input value={form.contacto_familiar_relacion} onChange={e => set("contacto_familiar_relacion", e.target.value)} placeholder="Ej. Esposa, Madre" />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Documentación y Fotos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <Label className="font-semibold text-primary">Foto de Perfil</Label>
                  <p className="text-xs text-muted-foreground mb-2">Sube una foto clara de tu rostro.</p>
                  
                  {fotoPerfilExistente && fotoPerfil.length === 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-green-700 mb-2 flex items-center">✓ Foto actual guardada</p>
                      <img src={fotoPerfilExistente.url} alt="Foto de perfil actual" className="w-32 h-32 object-cover rounded-lg border border-slate-200" />
                      <p className="text-xs text-muted-foreground mt-2">Sube una nueva imagen abajo si deseas reemplazarla.</p>
                    </div>
                  )}
                  
                  <MultiImageUpload images={fotoPerfil} onChange={setFotoPerfil} maxImages={1} />
                </div>
                
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <Label className="font-semibold text-primary">Carnet de Conducir / Operador</Label>
                  <p className="text-xs text-muted-foreground mb-2">Sube una foto legible de tu carnet.</p>

                  {fotoCarnetExistente && fotoCarnet.length === 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-green-700 mb-2 flex items-center">✓ Carnet actual guardado</p>
                      <img src={fotoCarnetExistente.url} alt="Carnet actual" className="max-w-full h-auto max-h-40 object-cover rounded-lg border border-slate-200" />
                      <p className="text-xs text-muted-foreground mt-2">Sube una nueva imagen abajo si deseas reemplazarla.</p>
                    </div>
                  )}

                  <MultiImageUpload images={fotoCarnet} onChange={setFotoCarnet} maxImages={1} />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isPending} className="w-full md:w-auto">
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isPending ? "Guardando..." : "Guardar Mis Datos"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
