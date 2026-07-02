import React, { useState } from "react";
import { useFinalizarJornada, getGetJornadasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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
  const [form, setForm] = useState({ horometro_fin: "", km_fin: "", problemas: "" });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.horometro_fin) {
      toast.error("El horómetro final es obligatorio");
      return;
    }
    finalizarMut.mutate(
      {
        id: jornadaId,
        data: {
          horometro_fin: parseFloat(form.horometro_fin),
          km_fin: form.km_fin ? parseFloat(form.km_fin) : undefined,
          problemas: form.problemas || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Jornada finalizada correctamente");
          queryClient.invalidateQueries({ queryKey: getGetJornadasQueryKey() });
          onOpenChange(false);
          setForm({ horometro_fin: "", km_fin: "", problemas: "" });
        },
        onError: () => toast.error("Error al finalizar la jornada"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar Jornada</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground py-1">
          {empleadoNombre && <span>{empleadoNombre}</span>}
          {maquinaNombre && <span> • {maquinaNombre}</span>}
          {horometroInicio != null && <span> • Inicio: {horometroInicio}h</span>}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label>Problemas / Novedades</Label>
            <Textarea placeholder="Describir cualquier problema o novedad..." value={form.problemas} onChange={e => set("problemas", e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={finalizarMut.isPending}>
              {finalizarMut.isPending ? "Finalizando..." : "Finalizar Jornada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
