import React, { useState } from "react";
import { useGetEgresos, useCreateEgreso } from "@workspace/api-client-react";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIAS = ["Combustible", "Mantenimiento", "Sueldos", "Repuestos", "Servicios", "Impuestos", "Otros"];

export function Egresos() {
  const { data: egresos, isLoading } = useGetEgresos();
  const { data: proyectos } = useGetProyectos();
  const [openDialog, setOpenDialog] = useState(false);
  const queryClient = useQueryClient();
  const createMut = useCreateEgreso();
  const updateMut = import("@workspace/api-client-react").then(m => m.useUpdateEgreso ? m.useUpdateEgreso() : null);
  // As a workaround since useUpdateEgreso might need manual import or fallback
  const { mutate: updateEgresoMut, isPending: isUpdating } = (import("@workspace/api-client-react") as any)?.useUpdateEgreso ? (import("@workspace/api-client-react") as any).useUpdateEgreso() : { mutate: (a: any, b: any) => {}, isPending: false };
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    concepto: "",
    categoria: "Otros",
    monto: "",
    metodo_pago: "Efectivo",
    centro_costos: "General",
    observaciones: "",
    comprobante: false
  });

  const set = (field: string, val: any) => setForm(prev => ({ ...prev, [field]: val }));

  const openEdit = (egreso: any) => {
    setEditingId(egreso.id);
    setForm({
      fecha: new Date(egreso.fecha).toISOString().split("T")[0],
      concepto: egreso.concepto || "",
      categoria: egreso.categoria || "Otros",
      monto: egreso.monto?.toString() || "",
      metodo_pago: egreso.metodo_pago || "Efectivo",
      centro_costos: egreso.centro_costos || "General",
      observaciones: egreso.observaciones || "",
      comprobante: egreso.comprobante || false
    });
    setOpenDialog(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ fecha: new Date().toISOString().split("T")[0], concepto: "", categoria: "Otros", monto: "", metodo_pago: "Efectivo", centro_costos: "General", observaciones: "", comprobante: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concepto || !form.monto) {
      toast.error("Concepto y monto son obligatorios");
      return;
    }
    
    const payload = {
      fecha: new Date(form.fecha).toISOString(),
      concepto: form.concepto,
      categoria: form.categoria,
      monto: parseFloat(form.monto),
      metodo_pago: form.metodo_pago,
      centro_costos: form.centro_costos === "General" ? undefined : form.centro_costos,
      observaciones: form.observaciones || undefined,
      comprobante: form.comprobante
    };

    if (editingId) {
      // Import dinámico porque lo agregamos manual
      import("@workspace/api-client-react").then(api => {
        if (api.updateEgreso) {
          api.updateEgreso(editingId, payload as any).then(() => {
            toast.success("Egreso actualizado");
            queryClient.invalidateQueries({ queryKey: ["getEgresos"] });
            setOpenDialog(false);
            resetForm();
          }).catch(() => toast.error("Error al actualizar egreso"));
        }
      });
    } else {
      createMut.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            toast.success("Egreso registrado y sincronizado con Google Sheets");
            queryClient.invalidateQueries({ queryKey: ["getEgresos"] });
            setOpenDialog(false);
            resetForm();
          },
          onError: () => toast.error("Error al registrar egreso")
        }
      );
    }
  };

  const total = egresos?.reduce((acc, curr) => acc + curr.monto, 0) || 0;

  const handleSyncSheets = async () => {
    try {
      toast.info("Sincronizando con Google Sheets...");
      const res = await fetch("/api/egresos/sync-sheet", {
        headers: { Authorization: `Bearer ${localStorage.getItem("puffin_token")}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Google Sheets actualizado con ${data.rowsCount} registros`);
      } else {
        toast.error(data.error || "Error al sincronizar");
      }
    } catch {
      toast.error("Error de conexión al sincronizar");
    }
  };

  const handleExportCSV = () => {
    if (!egresos || egresos.length === 0) { toast.error("No hay egresos para exportar"); return; }
    const headers = ["ID", "Fecha", "Categoría", "Concepto", "Proveedor", "Monto", "Método de Pago", "Comprobante", "Proyecto", "Observaciones"];
    const rows = egresos.map(e => [
      e.id,
      format(new Date(e.fecha), "dd/MM/yyyy", { locale: es }),
      e.categoria,
      `"${e.concepto}"`,
      e.proveedor || "",
      e.monto,
      e.metodo_pago || "",
      e.comprobante ? "SI" : "NO",
      e.centro_costos || "",
      `"${e.observaciones || ""}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Egresos_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel descargado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Gastos / Egresos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="border-green-600 text-green-700 hover:bg-green-50" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Descargar Excel
          </Button>
          <Button className="bg-primary" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar Egreso
          </Button>
        </div>
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
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando egresos...</TableCell></TableRow>
                ) : egresos?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay egresos registrados.</TableCell></TableRow>
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
                      <TableCell>
                        {eg.centro_costos ? (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{eg.centro_costos}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{eg.metodo_pago || "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        ${eg.monto.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={eg.comprobante ? "default" : "secondary"}>
                          {eg.comprobante ? "SI" : "NO"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(eg)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={open => {
        setOpenDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Egreso" : "Registrar Nuevo Egreso"}</DialogTitle>
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
            <div className="space-y-1">
              <Label>Proyecto / Lugar del Gasto</Label>
              <Select value={form.centro_costos} onValueChange={v => set("centro_costos", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General (sin proyecto específico)</SelectItem>
                  {proyectos?.map(p => (
                    <SelectItem key={p.id} value={p.lugar}>{p.lugar}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="flex items-center space-x-2 pt-2">
              <Switch 
                id="comprobante" 
                checked={form.comprobante} 
                onCheckedChange={v => set("comprobante", v)} 
              />
              <Label htmlFor="comprobante">¿Tiene comprobante?</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary" disabled={createMut.isPending || isUpdating}>
                {createMut.isPending || isUpdating ? "Guardando..." : (editingId ? "Guardar Cambios" : "Registrar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
