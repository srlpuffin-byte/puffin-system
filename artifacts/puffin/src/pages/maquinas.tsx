import React, { useState, useEffect } from "react";
import { useGetMaquinas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, X, RefreshCw } from "lucide-react";
import { Link, useSearch } from "wouter";
import { ExportButtons } from "@/components/ui/export-buttons";
import { NuevaMaquinaDialog } from "@/components/forms/nueva-maquina-dialog";
import { AlertTriangle, Package, Truck } from "lucide-react";
import { toast } from "sonner";

const TIPOS_MAQUINA = ["Retroexcavadora", "Niveladora", "Compactadora", "Camión", "Camión Cisterna", "Grúa", "Pala Cargadora", "Minicargadora", "Bulldozer", "Motoniveladora", "Otro"];
const TIPOS_INVENTARIO = ["Casilla Rodante", "Tanque de Agua", "Tanque de Combustible", "Herramienta Manual", "Herramienta Eléctrica", "Repuesto", "Otro"];

const estadoBadge = (estado: string) => {
  if (estado === "activa") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVA</Badge>;
  if (estado === "detenida") return <Badge variant="destructive">DETENIDA</Badge>;
  if (estado === "mantenimiento") return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-transparent">MANTENIMIENTO</Badge>;
  return <Badge variant="secondary">{estado.toUpperCase()}</Badge>;
};

export function Maquinas() {
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"maquinaria" | "inventario">("maquinaria");
  const [filterEstado, setFilterEstado] = useState(urlParams.get("estado") || "todos");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [openDialog, setOpenDialog] = useState(false);
  const { data: maquinasRaw, isLoading } = useGetMaquinas({ search: search || undefined, categoria: activeTab });

  const maquinas = (maquinasRaw || []).filter(m => {
    if (filterEstado !== "todos" && m.estado !== filterEstado) return false;
    if (filterTipo !== "todos" && m.tipo !== filterTipo) return false;
    return true;
  });

  const hasFilters = search !== "" || filterEstado !== "todos" || filterTipo !== "todos";

  const handleSyncSheets = async () => {
    try {
      toast.info("Sincronizando Maquinarias con Google Sheets...");
      const res = await fetch("/api/maquinas/sync-sheet", {
        headers: { Authorization: `Bearer ${localStorage.getItem("puffin_token")}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Google Sheets actualizado con ${data.rowsCount} maquinarias/inventario`);
      } else {
        toast.error(data.error || "Error al sincronizar");
      }
    } catch {
      toast.error("Error de conexión al sincronizar");
    }
  };

  const clearFilters = () => { setSearch(""); setFilterEstado("todos"); setFilterTipo("todos"); };

  const exportColumns = [
    { header: "Código", key: "codigo" },
    { header: "Nombre", key: "nombre" },
    { header: "Tipo", key: "tipo" },
    { header: "Marca", key: "marca" },
    { header: "Modelo", key: "modelo" },
    { header: "Patente/Dominio", key: "patente" },
    { header: "Horómetro", key: "horometro" },
    { header: "Estado", key: "estado", formatter: (v: string) => v?.toUpperCase() }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Maquinaria</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {maquinas && (
            <ExportButtons 
              data={maquinas} 
              columns={exportColumns} 
              filename={activeTab === "maquinaria" ? "Reporte_Maquinaria" : "Reporte_Inventario"} 
              title={activeTab === "maquinaria" ? "Reporte de Maquinaria" : "Reporte de Inventario"} 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {activeTab === "maquinaria" ? "Nueva Máquina" : "Nuevo Ítem"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-fit mb-4">
        <button
          onClick={() => { setActiveTab("maquinaria"); setFilterTipo("todos"); }}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-3 rounded-lg text-sm font-semibold transition-all border-2 ${
            activeTab === "maquinaria"
              ? "bg-primary text-primary-foreground border-primary shadow-md"
              : "bg-white text-slate-600 border-slate-200 hover:border-primary/50 hover:bg-slate-50"
          }`}
        >
          <Truck className="w-5 h-5" />
          <span>Maquinaria Pesada</span>
        </button>
        <button
          onClick={() => { setActiveTab("inventario"); setFilterTipo("todos"); }}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-3 rounded-lg text-sm font-semibold transition-all border-2 ${
            activeTab === "inventario"
              ? "bg-primary text-primary-foreground border-primary shadow-md"
              : "bg-white text-slate-600 border-slate-200 hover:border-primary/50 hover:bg-slate-50"
          }`}
        >
          <Package className="w-5 h-5" />
          <span>Inventario / Herramientas</span>
        </button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Nombre, código, motor, chasis..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="detenida">Detenida</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {(activeTab === "maquinaria" ? TIPOS_MAQUINA : TIPOS_INVENTARIO).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Limpiar
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-hidden">
            {/* Vista Desktop (Tabla) */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    {activeTab === "maquinaria" && <TableHead>Horómetro/Km</TableHead>}
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando maquinaria...</TableCell></TableRow>
                  ) : maquinas?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No se encontraron resultados.</TableCell></TableRow>
                  ) : (
                    maquinas?.map((maq) => (
                      <TableRow key={maq.id}>
                        <TableCell className="font-medium">{maq.codigo || "-"}</TableCell>
                        <TableCell>{maq.nombre}</TableCell>
                        <TableCell className="capitalize">{maq.tipo}</TableCell>
                        {activeTab === "maquinaria" && (
                          <TableCell>
                            {maq.horometro ? `${maq.horometro} h` : "-"}
                            {maq.horometro && maq.kilometros ? " / " : ""}
                            {maq.kilometros ? `${maq.kilometros} km` : ""}
                          </TableCell>
                        )}
                        <TableCell>{estadoBadge(maq.estado)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            {activeTab === "maquinaria" && (!maq.marca || !maq.modelo || !maq.anio || (!maq.patente && !maq.dominio) || !maq.motor || !maq.chasis || !maq.filtro_tipo || !maq.filtro_codigo) && (
                              <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                                <AlertTriangle className="w-3 h-3" /> Faltan datos
                              </Badge>
                            )}
                            <Link href={`/maquinas/${maq.id}`} className="text-primary hover:underline font-medium text-sm">
                              Ver ficha
                            </Link>
                          </div>
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
                <div className="text-center py-8">Cargando maquinaria...</div>
              ) : maquinas?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No se encontraron resultados.</div>
              ) : (
                maquinas?.map((maq) => (
                  <div key={maq.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base leading-tight">{maq.nombre}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">{maq.codigo || "Sin código"} • <span className="capitalize">{maq.tipo}</span></span>
                      </div>
                      {estadoBadge(maq.estado)}
                    </div>
                    
                    {activeTab === "maquinaria" && (
                      <div className="flex items-center gap-4 text-sm bg-slate-50 p-2 rounded border mt-1">
                        {maq.horometro && (
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Horómetro</span>
                            <span className="font-medium">{maq.horometro} h</span>
                          </div>
                        )}
                        {maq.kilometros && (
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Kilometraje</span>
                            <span className="font-medium">{maq.kilometros} km</span>
                          </div>
                        )}
                        {!maq.horometro && !maq.kilometros && (
                          <span className="text-xs text-muted-foreground">Sin registros de uso</span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                      {activeTab === "maquinaria" && (!maq.marca || !maq.modelo || !maq.anio || (!maq.patente && !maq.dominio) || !maq.motor || !maq.chasis || !maq.filtro_tipo || !maq.filtro_codigo) && (
                        <Badge variant="destructive" className="flex items-center gap-1 text-[10px] px-1.5 py-0">
                          <AlertTriangle className="w-3 h-3" /> Faltan datos
                        </Badge>
                      )}
                      <Link href={`/maquinas/${maq.id}`} className={activeTab === "inventario" || !(!maq.marca || !maq.modelo || !maq.anio || (!maq.patente && !maq.dominio) || !maq.motor || !maq.chasis || !maq.filtro_tipo || !maq.filtro_codigo) ? "ml-auto" : ""}>
                        <Button variant="outline" size="sm" className="h-8">
                          Ver ficha
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <NuevaMaquinaDialog open={openDialog} onOpenChange={setOpenDialog} defaultCategoria={activeTab} />
    </div>
  );
}
