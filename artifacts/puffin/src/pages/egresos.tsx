import React, { useState } from "react";
import { useGetEgresos, useCreateEgreso } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIAS = ["Combustible", "Mantenimiento", "Sueldos", "Repuestos", "Servicios", "Impuestos", "Otros"];

export function Egresos() {
  const { data: egresos, isLoading } = useGetEgresos();
  const [openDialog, setOpenDialog] = useState(false);
  const queryClient = useQueryClient();
  const createMut = useCreateEgreso();

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    concepto: "",
    categoria: "Otros",
    monto: "",
    metodo_pago: "Efectivo",
    observaciones: ""
  });

  const set = (field: string, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concepto || !form.monto) {
      toast.error("Concepto y monto son obligatorios");
      return;
    }
    createMut.mutate(
      {
        data: {
          fecha: new Date(form.fecha).toISOString(),
          concepto: form.concepto,
          categoria: form.categoria,
          monto: parseFloat(form.monto),
          metodo_pago: form.metodo_pago,
          observaciones: form.observaciones || undefined
        } as any
      },
      {
        onSuccess: () => {
          toast.success("Egreso registrado y sincronizado con Google Sheets");
          queryClient.invalidateQueries({ queryKey: ["getEgresos"] });
          setOpenDialog(false);
          setForm({ fecha: new Date().toISOString().split("T")[0], concepto: "", categoria: "Otros", monto: "", metodo_pago: "Efectivo", observaciones: "" });
        },
        onError: () => {
          toast.error("Error al registrar egreso");
        }
      }
    );
  };

  const total = egresos?.reduce((acc, curr) => acc + curr.monto, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Gastos / Egresos</h1>
        <Button className="bg-primary" onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar Egreso
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Egresos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ${total.toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Comprobante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando egresos...</TableCell></TableRow>
                ) : egresos?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay egresos registrados.</TableCell></TableRow>
                ) : (
                  egresos?.map((eg: any) => (
                    <TableRow key={eg.id}>
                      <TableCell className="font-medium">
                        {format(new Date(eg.fecha), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{eg.categoria}</Badge>
                      </TableCell>
                      <TableCell>{eg.concepto}</TableCell>
                      <TableCell>{eg.metodo_pago || "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        ${eg.monto.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={eg.comprobante ? "default" : "secondary"}>
                          {eg.comprobante ? "SI" : "NO"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Nuevo Egreso</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Monto ($) *</Label>
                <Input type="number" step="0.01" value={form.monto} onChange={e => set("monto", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select value={form.categoria} onValueChange={v => set("categoria", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Concepto *</Label>
              <Input placeholder="Ej. Compra de repuestos" value={form.concepto} onChange={e => set("concepto", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Observaciones / Ref</Label>
                <Input placeholder="Ticket Nro..." value={form.observaciones} onChange={e => set("observaciones", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Método de Pago</Label>
                <Select value={form.metodo_pago} onValueChange={v => set("metodo_pago", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary" disabled={createMut.isPending}>
                {createMut.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
