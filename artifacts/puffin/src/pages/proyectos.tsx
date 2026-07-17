import React, { useState } from "react";
import { useGetProyectos, useDeleteProyecto, type Proyecto } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, MapPin, Users, Tractor, DollarSign, Activity, Pencil, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NuevoProyectoDialog } from "@/components/forms/nuevo-proyecto-dialog";
import { EditarProyectoDialog } from "@/components/forms/editar-proyecto-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

export function Proyectos() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [editProyecto, setEditProyecto] = useState<Proyecto | null>(null);
  const { data: proyectos, isLoading } = useGetProyectos();
  const deleteMut = useDeleteProyecto();
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este proyecto?")) return;
    try {
      await deleteMut.mutateAsync(id);
      toast.success("Proyecto eliminado correctamente");
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar el proyecto");
    }
  };

  const getEmpleadosNames = (ids: number[] | null) => {
    if (!ids || ids.length === 0) return "Sin asignar";
    if (!empleados) return `${ids.length} asignados`;
    return ids.map(id => {
      const emp = empleados.find(e => e.id === id);
      return emp ? `${emp.nombre} ${emp.apellido}` : `ID ${id}`;
    }).join(", ");
  };

  const getMaquinasNames = (ids: number[] | null) => {
    if (!ids || ids.length === 0) return "Sin asignar";
    if (!maquinas) return `${ids.length} asignadas`;
    return ids.map(id => {
      const maq = maquinas.find(m => m.id === id);
      return maq ? `${maq.marca} ${maq.modelo}` : `ID ${id}`;
    }).join(", ");
  };

  const filteredProyectos = proyectos?.filter(p => 
    p.lugar.toLowerCase().includes(search.toLowerCase()) ||
    p.estado.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownloadCSV = () => {
    if (!proyectos || proyectos.length === 0) {
      toast.error("No hay proyectos para exportar");
      return;
    }

    const headers = ["ID", "Lugar del Proyecto", "Hectareas", "Precio por Hectarea", "Ganancia Estimada", "Estado", "Personal Asignado", "Maquinaria e Inventario Asignado", "Fecha de Creacion"];
    
    const rows = proyectos.map(p => {
      // Reemplazamos comas por guiones para no romper el formato CSV
      const personal = getEmpleadosNames(p.empleados_asignados).replace(/,/g, " |");
      const maquinasAsignadas = getMaquinasNames(p.maquinas_asignadas).replace(/,/g, " |");
      
      return [
        p.id,
        `"${p.lugar}"`,
        p.hectareas,
        p.precio_hectarea,
        p.ganancia_estimada || 0,
        p.estado,
        `"${personal}"`,
        `"${maquinasAsignadas}"`,
        format(new Date(p.createdAt), "dd/MM/yyyy")
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Proyectos_Detalles_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel descargado correctamente");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Proyectos</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none border-green-600 text-green-700 hover:bg-green-50" onClick={handleDownloadCSV}>
            <Download className="mr-2 h-4 w-4" />
            Descargar Excel
          </Button>
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Proyecto
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por lugar o estado..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lugar</TableHead>
                  <TableHead>Datos Comerciales</TableHead>
                  <TableHead>Asignaciones</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando proyectos...</TableCell></TableRow>
                ) : filteredProyectos?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No se encontraron resultados.</TableCell></TableRow>
                ) : (
                  filteredProyectos?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-base flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {p.lugar}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Creado: {format(new Date(p.createdAt), "dd/MM/yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="flex items-center gap-1 text-slate-600">
                            <Activity className="h-3 w-3" /> {parseFloat(p.hectareas).toLocaleString('es-AR')} Has. a ${parseFloat(p.precio_hectarea).toLocaleString('es-AR')}
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-green-700">
                            <DollarSign className="h-3 w-3" /> Ganancia Est: ${parseFloat(p.ganancia_estimada || "0").toLocaleString('es-AR', {minimumFractionDigits: 2})}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-start gap-1">
                            <Users className="h-3 w-3 mt-0.5 text-blue-600 flex-shrink-0" />
                            <span className="line-clamp-1 max-w-[200px]" title={getEmpleadosNames(p.empleados_asignados)}>
                              {getEmpleadosNames(p.empleados_asignados)}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <Tractor className="h-3 w-3 mt-0.5 text-amber-600 flex-shrink-0" />
                            <span className="line-clamp-1 max-w-[200px]" title={getMaquinasNames(p.maquinas_asignadas)}>
                              {getMaquinasNames(p.maquinas_asignadas)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.estado === "activo" ? "default" : p.estado === "finalizado" ? "secondary" : "outline"}
                               className={p.estado === "activo" ? "bg-green-600 hover:bg-green-700" : ""}>
                          {p.estado.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditProyecto(p)}
                            className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                            title="Editar proyecto"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title="Eliminar proyecto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NuevoProyectoDialog open={openDialog} onOpenChange={setOpenDialog} />
      <EditarProyectoDialog
        proyecto={editProyecto}
        open={!!editProyecto}
        onOpenChange={(open) => { if (!open) setEditProyecto(null); }}
      />
    </div>
  );
}
