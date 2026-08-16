import React, { useState } from "react";
import { useGetEgresos, useCreateEgreso, useGetEmpleados, useGetMaquinas, getGetEgresosQueryKey } from "@workspace/api-client-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { TableSkeleton, CardSkeleton } from "@/components/ui/table-skeleton";
import { useGetProyectos } from "@/hooks/use-proyectos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Plus, Download, RefreshCw, Users, Tractor, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIAS = ["Combustible", "Mantenimiento", "Sueldos", "Repuestos", "Servicios", "Impuestos", "Otros"];

export function Egresos() {
  const { data: proyectos } = useGetProyectos();
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();
  const [openDialog, setOpenDialog] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const queryClient = useQueryClient();
  const createMut = useCreateEgreso();
  const updateMut = import("@workspace/api-client-react").then(m => m.useUpdateEgreso ? m.useUpdateEgreso() : null);
  // As a workaround since useUpdateEgreso might need manual import or fallback
  const { mutate: updateEgresoMut, isPending: isUpdating } = (import("@workspace/api-client-react") as any)?.useUpdateEgreso ? (import("@workspace/api-client-react") as any).useUpdateEgreso() : { mutate: (a: any, b: any) => {}, isPending: false };
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que querés eliminar este egreso? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/egresos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("puffin_token")}` }
      });
      if (!res.ok) throw new Error("Error al eliminar");
      toast.success("Egreso eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: getGetEgresosQueryKey() });
    } catch (e) {
      toast.error("Error al eliminar el egreso");
    } finally {
      setDeletingId(null);
    }
  };

  const [page, setPage] = useState(1);
  // Filtros (client-side para metodo_pago y proyecto; server-side para categoria y search)
  const [filterProyecto, setFilterProyecto] = useState("todos");
  const [filterCategoria, setFilterCategoria] = useState("todos");
  const [filterMetodo, setFilterMetodo] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");

  const { data: egresosResp, isLoading } = useGetEgresos({
    page,
    limit: 50,
    ...(filterCategoria !== "todos" ? { categoria: filterCategoria } : {}),
    ...(filterSearch ? { search: filterSearch } : {}),
  });
  const egresos = egresosResp?.data;
  const paginationMeta = egresosResp?.meta;

  // Aplicar filtros restantes (metodo y proyecto) en el cliente sobre la página actual
  const egresosFiltrados = (egresos || []).filter((eg: any) => {
    if (filterProyecto !== "todos" && eg.centro_costos !== filterProyecto) return false;
    if (filterMetodo !== "todos" && eg.metodo_pago !== filterMetodo) return false;
    return true;
  });
  const hasFilters = filterProyecto !== "todos" || filterCategoria !== "todos" || filterMetodo !== "todos" || filterSearch !== "";
  const clearFilters = () => { setFilterProyecto("todos"); setFilterCategoria("todos"); setFilterMetodo("todos"); setFilterSearch(""); setPage(1); };

  // Helper: fecha local sin conversión UTC
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [openFotoDialog, setOpenFotoDialog] = useState(false);
  const [fotoUrlToView, setFotoUrlToView] = useState<string | null>(null);

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);

  const [form, setForm] = useState({
    fecha: localToday(),
    concepto: "",
    categoria: "Otros",
    monto: "",
    metodo_pago: "Efectivo",
    centro_costos: "General",
    observaciones: "",
    comprobante: false
  });

  const set = (field: string, val: any) => setForm(prev => ({ ...prev, [field]: val }));

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      setForm(prev => ({ ...prev, comprobante: true }));
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFotoBase64(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openEdit = (egreso: any) => {
    setEditingId(egreso.id);
    setForm({
      fecha: (egreso.fecha || "").substring(0, 10),
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
    setFotoFile(null);
    setFotoBase64(null);
    setForm({ fecha: localToday(), concepto: "", categoria: "Otros", monto: "", metodo_pago: "Efectivo", centro_costos: "General", observaciones: "", comprobante: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concepto || !form.monto) {
      toast.error("Concepto y monto son obligatorios");
      return;
    }
    
    const payload = {
      // Enviamos mediodía UTC para evitar cruzar la medianoche en cualquier zona horaria
      fecha: form.fecha + "T12:00:00.000Z",
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
          api.updateEgreso(editingId, payload as any).then(async () => {
            if (fotoBase64) {
              await fetch("/api/fotografias", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("puffin_token")}` },
                body: JSON.stringify({ entidad_tipo: "egreso", entidad_id: editingId, filename: fotoFile?.name, base64Data: fotoBase64, descripcion: "Comprobante web" })
              });
            }
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
          onSuccess: async (data: any) => {
            // El backend devuelve el egreso creado. Si hay foto, la subimos
            if (fotoBase64 && data && data.id) {
              try {
                await fetch("/api/fotografias", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("puffin_token")}` },
                  body: JSON.stringify({ entidad_tipo: "egreso", entidad_id: data.id, filename: fotoFile?.name, base64Data: fotoBase64, descripcion: "Comprobante web" })
                });
              } catch (e) {
                console.error("Error subiendo foto", e);
                toast.error("El gasto se guardó, pero hubo un error al subir la foto.");
              }
            }
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

  const total = egresosFiltrados.reduce((acc, curr: any) => acc + Number(curr.monto || 0), 0);

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

  const handleVerFoto = async (egresoId: number) => {
    try {
      const res = await fetch(`/api/fotografias?entidad_tipo=egreso&entidad_id=${egresoId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("puffin_token")}` }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        setFotoUrlToView(data[0].url);
        setOpenFotoDialog(true);
      } else {
        toast.info("Este egreso está marcado con comprobante pero no se encontró la imagen en el servidor.");
      }
    } catch (e) {
      toast.error("Error al obtener la imagen");
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Gastos / Egresos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50" onClick={handleSyncSheets}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sincronizar Sheets
          </Button>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {hasFilters ? "Total Filtrado" : "Total Egresos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ${total.toLocaleString("es-AR")}
            </div>
            {hasFilters && (
              <p className="text-xs text-muted-foreground mt-1">{egresosFiltrados.length} de {egresos?.length || 0} registros</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <input
                type="search"
                placeholder="Buscar concepto..."
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
              />
            </div>
            <Select value={filterProyecto} onValueChange={setFilterProyecto}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Proyecto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los proyectos</SelectItem>
                <SelectItem value="General">General (sin proyecto)</SelectItem>
                {proyectos?.map(p => <SelectItem key={p.id} value={p.lugar}>{p.lugar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las categorías</SelectItem>
                {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMetodo} onValueChange={setFilterMetodo}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Método de pago" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los métodos</SelectItem>
                <SelectItem value="Efectivo">Efectivo</SelectItem>
                <SelectItem value="Transferencia">Transferencia</SelectItem>
                <SelectItem value="Tarjeta">Tarjeta</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-9">
                ✕ Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="rounded-md border overflow-hidden">
            {/* Vista Desktop (Tabla) */}
            <div className="hidden md:block overflow-x-auto">
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
                    <TableSkeleton cols={8} rows={5} />
                  ) : egresosFiltrados.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay egresos con los filtros seleccionados.</TableCell></TableRow>
                  ) : (
                    egresosFiltrados.map((eg: any) => (
                      <TableRow key={eg.id}>
                        <TableCell className="font-medium">
                          {(eg.fecha || "").substring(0, 10).split("-").reverse().join("/")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{eg.categoria}</Badge>
                        </TableCell>
                        <TableCell>{eg.concepto}</TableCell>
                        <TableCell>
                          {eg.centro_costos ? (
                            (() => {
                              const p = proyectos?.find(p => p.lugar === eg.centro_costos);
                              if (!p) {
                                return <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{eg.centro_costos}</span>;
                              }
                              
                              const asigEmpleados = empleados?.filter((e: any) => p.empleados_asignados?.includes(e.id)) || [];
                              const asigMaquinas = maquinas?.filter((m: any) => p.maquinas_asignadas?.includes(m.id)) || [];
                              
                              return (
                                <HoverCard openDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full cursor-help hover:bg-blue-100 transition-colors">
                                      {eg.centro_costos}
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent side="top" className="w-80 p-3 shadow-xl z-[100] bg-white border-2">
                                    <h4 className="font-bold text-sm border-b pb-2 mb-2 text-primary">{p.lugar}</h4>
                                    <div className="space-y-3">
                                      <div>
                                        <h5 className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                                          <Users className="h-3 w-3" /> Empleados ({asigEmpleados.length})
                                        </h5>
                                        {asigEmpleados.length > 0 ? (
                                          <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5">
                                            {asigEmpleados.map((e: any) => <li key={e.id}>{e.nombre} {e.apellido}</li>)}
                                          </ul>
                                        ) : <p className="text-xs text-slate-400 italic">Ninguno asignado</p>}
                                      </div>
                                      <div>
                                        <h5 className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                                          <Tractor className="h-3 w-3" /> Maquinaria e Inventario ({asigMaquinas.length})
                                        </h5>
                                        {asigMaquinas.length > 0 ? (
                                          <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5">
                                            {asigMaquinas.map((m: any) => <li key={m.id}>{m.nombre}</li>)}
                                          </ul>
                                        ) : <p className="text-xs text-slate-400 italic">Ninguna asignada</p>}
                                      </div>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{eg.metodo_pago || "-"}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          ${eg.monto.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell>
                          {eg.comprobante ? (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 cursor-pointer" onClick={() => handleVerFoto(eg.id)}>Ver Foto</Badge>
                          ) : (
                            <Badge variant="secondary">NO</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(eg)}>Editar</Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(eg.id)} disabled={deletingId === eg.id} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden divide-y">
              {isLoading ? (
                <CardSkeleton rows={4} />
              ) : egresosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay egresos con los filtros seleccionados.</div>
              ) : (
                egresosFiltrados.map((eg: any) => (
                  <div key={eg.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-red-600">${eg.monto.toLocaleString("es-AR")}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(eg.fecha), "dd/MM/yyyy", { locale: es })}</span>
                      </div>
                      <Badge variant="outline">{eg.categoria}</Badge>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-sm leading-snug">{eg.concepto}</span>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Comprobante:</span>
                        {eg.comprobante ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700 cursor-pointer text-[10px] px-1 py-0" onClick={() => handleVerFoto(eg.id)}>Ver Foto</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">NO</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {eg.centro_costos && (
                          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            {eg.centro_costos}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">Medio: {eg.metodo_pago || "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => openEdit(eg)} className="h-8 text-xs">
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(eg.id)} disabled={deletingId === eg.id} className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {paginationMeta && (
            <PaginationControls
              page={paginationMeta.page}
              lastPage={paginationMeta.lastPage}
              total={paginationMeta.total}
              limit={50}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={open => {
        setOpenDialog(open);
        if (!open) {
          resetForm();
          setHoveredProject(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Egreso" : "Registrar Nuevo Egreso"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Adjuntar Comprobante (Opcional)</Label>
                  <div className="text-xs text-muted-foreground">Subí una foto del ticket o factura.</div>
                </div>
                <Switch checked={form.comprobante} onCheckedChange={c => set("comprobante", c)} />
              </div>
              <div className="flex items-center gap-3">
                <input type="file" accept="image/*" onChange={handleFotoChange} className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
              {fotoBase64 && (
                <div className="mt-2 h-32 relative rounded-md overflow-hidden border">
                  <img src={fotoBase64} alt="Vista previa" className="object-contain w-full h-full bg-slate-50" />
                </div>
              )}
            </div>
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
              <Select
                value={form.centro_costos}
                onValueChange={v => { set("centro_costos", v); setHoveredProject(null); }}
                onOpenChange={() => setHoveredProject(null)}
              >
                <SelectTrigger className="h-auto min-h-10 py-2">
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General" onPointerMove={() => setHoveredProject(null)}>General (sin proyecto específico)</SelectItem>
                  {proyectos?.map(p => {
                    return (
                      <SelectItem
                        key={p.id}
                        value={p.lugar}
                        onPointerMove={(e) => {
                          setHoveredProject(p);
                          setMousePos({ x: e.clientX, y: e.clientY });
                        }}
                        onPointerLeave={() => setHoveredProject(null)}
                      >
                        {p.lugar}
                      </SelectItem>
                    );
                  })}
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary" disabled={createMut.isPending || isUpdating}>
                {createMut.isPending || isUpdating ? "Guardando..." : (editingId ? "Guardar Cambios" : "Registrar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Custom Tooltip that escapes Radix UI traps */}
      {hoveredProject && openDialog && (
        <div 
          style={{ position: 'fixed', left: mousePos.x + 20, top: mousePos.y - 40, zIndex: 999999 }}
          className="bg-white border-2 border-slate-200 shadow-2xl p-4 w-72 rounded-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100"
        >
          <h4 className="font-bold text-sm border-b pb-2 mb-3 text-primary">{hoveredProject.lugar}</h4>
          
          <div className="space-y-4">
            <div>
              <h5 className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                <Users className="h-3 w-3" /> Empleados
              </h5>
              <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5">
                {(() => {
                  const asigEmpleados = empleados?.filter((e: any) => hoveredProject.empleados_asignados?.includes(e.id)) || [];
                  if (asigEmpleados.length === 0) return <li className="text-slate-400 italic list-none -ml-4">Ninguno asignado</li>;
                  return asigEmpleados.map((e: any) => <li key={e.id}>{e.nombre} {e.apellido}</li>);
                })()}
              </ul>
            </div>
            
            <div>
              <h5 className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                <Tractor className="h-3 w-3" /> Maquinaria
              </h5>
              <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5">
                {(() => {
                  const asigMaquinas = maquinas?.filter((m: any) => hoveredProject.maquinas_asignadas?.includes(m.id)) || [];
                  if (asigMaquinas.length === 0) return <li className="text-slate-400 italic list-none -ml-4">Ninguna asignada</li>;
                  return asigMaquinas.map((m: any) => <li key={m.id}>{m.nombre}</li>);
                })()}
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* Dialog para Ver Foto */}
      <Dialog open={openFotoDialog} onOpenChange={setOpenFotoDialog}>
        <DialogContent className="sm:max-w-[600px] bg-white p-1">
          <div className="relative bg-slate-950 flex items-center justify-center min-h-[300px] rounded-md overflow-hidden">
            {fotoUrlToView ? (
              <img src={fotoUrlToView} alt="Comprobante" className="max-w-full max-h-[80vh] object-contain" />
            ) : (
              <div className="text-slate-400">Cargando...</div>
            )}
            <Button variant="ghost" className="absolute top-2 right-2 text-white bg-black/50 hover:bg-black/80" onClick={() => setOpenFotoDialog(false)}>
              ✕ Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
