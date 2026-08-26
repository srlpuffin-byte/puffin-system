import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreatePago, type Proyecto } from "@/hooks/use-proyectos";
import { useUploadFotografia } from "@workspace/api-client-react";
import imageCompression from 'browser-image-compression';
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";

interface RegistrarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyecto: Proyecto | null;
}

export function RegistrarPagoDialog({ open, onOpenChange, proyecto }: RegistrarPagoDialogProps) {
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const [fecha, setFecha] = useState(localToday());
  const [tipo, setTipo] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [addToInventory, setAddToInventory] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createPagoMut = useCreatePago();
  const uploadMut = useUploadFotografia();

  if (!proyecto) return null;

  const handleUploadClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf';
    fileInput.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        // Comprimir imagen si no es PDF
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1280,
            useWebWorker: false, // false para compatibilidad con Safari iOS / Android Chrome en modo PWA
          };
          fileToUpload = await imageCompression(file, options);
        }

        const reader = new FileReader();
        reader.onload = async () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          
          const res = await uploadMut.mutateAsync({
            data: {
              entidad_tipo: "proyecto",
              entidad_id: proyecto.id,
              base64Data: base64,
              filename: file.name,
              descripcion: "Comprobante de pago"
            }
          });
          
          setComprobanteUrl(res.url);
          toast.success("Comprobante subido");
          setIsUploading(false);
        };
        reader.readAsDataURL(fileToUpload);
      } catch (err) {
        toast.error("Error al subir el comprobante");
        setIsUploading(false);
      }
    };
    fileInput.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createPagoMut.mutateAsync({
        id: proyecto.id,
        data: {
          fecha,
          tipo,
          monto_monetario: monto,
          descripcion,
          comprobante_url: comprobanteUrl,
          addToInventory: tipo === "especie" ? addToInventory : false
        }
      });
      toast.success("Pago registrado con éxito");
      onOpenChange(false);
      // Reset
      setMonto("");
      setDescripcion("");
      setComprobanteUrl("");
      setIsSubmitting(false);
    } catch (err: any) {
      toast.error(err?.message || "Error al registrar el pago");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Pago / Cobro</DialogTitle>
          <DialogDescription>
            Agregá un nuevo pago al historial del proyecto {proyecto.lugar}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pago</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="especie">Vehículo / Especie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {tipo !== "especie" && (
              <div className="space-y-2">
                <Label>Monto ($)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  placeholder="Ej: 500000" 
                  value={monto} 
                  onChange={e => setMonto(e.target.value)} 
                  required 
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Detalles / Descripción</Label>
              <Textarea 
                placeholder={tipo === "especie" ? "Ej: Camioneta Ford Ranger 2018, patente AB123CD..." : "Ej: Cheque N° 1234, Banco Galicia"} 
                value={descripcion} 
                onChange={e => setDescripcion(e.target.value)} 
                required 
              />
            </div>

            {tipo === "especie" && (
              <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded-lg border">
                <Checkbox id="inventory" checked={addToInventory} onCheckedChange={(c) => setAddToInventory(c === true)} />
                <Label htmlFor="inventory" className="text-sm cursor-pointer font-medium">
                  Añadir automáticamente a mi Inventario
                </Label>
              </div>
            )}

            <div className="space-y-2">
              <Label>Comprobante (Opcional)</Label>
              {comprobanteUrl ? (
                <div className="relative rounded border bg-slate-50 p-2 text-sm flex items-center justify-between">
                  <span className="truncate max-w-[250px]">{comprobanteUrl}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setComprobanteUrl("")}>Quitar</Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full border-dashed" onClick={handleUploadClick} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                  Subir foto de cheque o comprobante
                </Button>
              )}
            </div>

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting || isUploading}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
