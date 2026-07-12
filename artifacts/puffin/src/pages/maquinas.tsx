import React, { useState, useEffect } from "react";
import { useGetMaquinas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, X } from "lucide-react";
import { Link, useSearch } from "wouter";
import { ExportButtons } from "@/components/ui/export-buttons";
import { NuevaMaquinaDialog } from "@/components/forms/nueva-maquina-dialog";
import { AlertTriangle } from "lucide-react";

const TIPOS_MAQUINA = ["Retroexcavadora", "Niveladora", "Compactadora", "Camión", "Camión Cisterna", "Grúa", "Pala Cargadora", "Minicargadora", "Bulldozer", "Motoniveladora", "Otro"];

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
  const [filterEstado, setFilterEstado] = useState(urlParams.get("estado") || "todos");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [openDialog, setOpenDialog] = useState(false);
  const { data: maquinasRaw, isLoading } = useGetMaquinas({ search: search || undefined });

  const maquinas = (maquinasRaw || []).filter(m => {
    if (filterEstado !== "todos" && m.estado !== filterEstado) return false;
    if (filterTipo !== "todos" && m.tipo !== filterTipo) return false;
    return true;
  });

  const hasFilters = search || filterEstado !== "todos" || filterTipo !== "todos";
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
              filename="Reporte_Maquinaria" 
              title="Reporte de Maquinaria" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Máquina
          </Button>
        </div>
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
                {TIPOS_MAQUINA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Limpiar
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Horómetro/Km</TableHead>
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
                      <TableCell>
                        {maq.horometro ? `${maq.horometro} h` : "-"}
                        {maq.horometro && maq.kilometros ? " / " : ""}
                        {maq.kilometros ? `${maq.kilometros} km` : ""}
                      </TableCell>
                      <TableCell>{estadoBadge(maq.estado)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          {(!maq.marca || !maq.modelo || !maq.anio || (!maq.patente && !maq.dominio) || !maq.motor || !maq.chasis || !maq.filtro_tipo || !maq.filtro_codigo) && (
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
        </CardContent>
      </Card>

      <NuevaMaquinaDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
