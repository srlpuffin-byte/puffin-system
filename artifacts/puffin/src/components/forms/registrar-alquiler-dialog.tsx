import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/hooks/use-auth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquina: any;
  alquilerActivo?: any;
}

export function RegistrarAlquilerDialog({ open, onOpenChange, maquina, alquilerActivo }: Props) {
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [horometro, setHorometro] = useState(maquina?.horometro?.toString() || "0");
  const [isLoading, setIsLoading] = useState(false);
  
  const queryClient = useQueryClient();

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      if (alquilerActivo) {
        setFecha(new Date().toISOString().split("T")[0]);
        setHorometro(maquina?.horometro?.toString() || "0");
      } else {
        setCliente("");
        setFecha(new Date().toISOString().split("T")[0]);
        setHorometro(maquina?.horometro?.toString() || "0");
      }
    }
  }, [open, maquina, alquilerActivo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (alquilerActivo) {
        // Cerrar alquiler
        const res = await fetch(`/api/alquileres/${maquina.id}/${alquilerActivo.id}/finalizar`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            fecha_fin: fecha,
            horometro_fin: parseFloat(horometro),
          }),
        });

        if (!res.ok) throw new Error("Error al cerrar alquiler");
        toast.success("Alquiler finalizado con éxito");
      } else {
        // Iniciar alquiler
        const res = await fetch(`/api/alquileres/${maquina.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            cliente,
            fecha_inicio: fecha,
            horometro_inicio: parseFloat(horometro),
          }),
        });

        if (!res.ok) throw new Error("Error al iniciar alquiler");
        toast.success("Alquiler iniciado con éxito");
      }

      queryClient.invalidateQueries({ queryKey: ["alquileres", maquina.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/maquinas", maquina.id] });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Ocurrió un error al procesar el alquiler");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alquilerActivo ? "Finalizar Alquiler" : "Nuevo Alquiler"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!alquilerActivo && (
            <div className="space-y-2">
              <Label>Cliente / Proyecto</Label>
              <Input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nombre del cliente o proyecto"
                required
              />
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{alquilerActivo ? "Fecha de Fin" : "Fecha de Inicio"}</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label>{alquilerActivo ? "Horómetro Final" : "Horómetro Inicial"}</Label>
              <Input
                type="number"
                step="0.1"
                value={horometro}
                onChange={(e) => setHorometro(e.target.value)}
                required
              />
            </div>
          </div>
          
          {alquilerActivo && (
            <div className="p-3 bg-muted rounded text-sm text-muted-foreground">
              Horómetro al inicio: <strong>{alquilerActivo.horometro_inicio} h</strong>
              <br />
              Se calcularán las horas automáticamente al confirmar.
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="mr-2">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
