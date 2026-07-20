import React, { useState } from "react";
import { useGetEmpleados } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, RefreshCw, User } from "lucide-react";
import { Link } from "wouter";
import { NuevoOperarioDialog } from "@/components/forms/nuevo-operario-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { apiFetch } from "@/lib/api";

export function Operarios() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const { data: operarios, isLoading } = useGetEmpleados({ search: search || undefined });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este operario?")) return;
    try {
      await apiFetch(`/empleados/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["getEmpleados"] });
      toast({ title: "Operario eliminado" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "Error al eliminar el operario" });
    }
  };

  const exportColumns = [
    { header: "Apellido", key: "apellido" },
    { header: "Nombre", key: "nombre" },
    { header: "DNI", key: "dni" },
    { header: "Cargo", key: "cargo" },
    { header: "Estado", key: "estado", formatter: (v: string) => v?.toUpperCase() }
  ];

  const handleSyncSheets = async () => {
    try {
      sonnerToast.info("Sincronizando Operarios con Google Sheets...");
      const res = await fetch("/api/empleados/sync-sheet", {
        headers: { Authorization: `Bearer ${localStorage.getItem("puffin_token")}` }
      });
      const data = await res.json();
      if (data.success) {
        sonnerToast.success(`Google Sheets actualizado con ${data.rowsCount} operarios`);
      } else {
        sonnerToast.error(data.error || "Error al sincronizar");
      }
    } catch {
      sonnerToast.error("Error de conexión al sincronizar");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Operarios</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {operarios && (
            <ExportButtons 
              data={operarios} 
              columns={exportColumns} 
              filename="Reporte_Operarios" 
              title="Reporte de Operarios" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Operario
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
                placeholder="Buscar por nombre, DNI..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            {/* Vista Desktop (Tabla) */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>DNI</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Jornada</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando operarios...</TableCell></TableRow>
                  ) : operarios?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No se encontraron resultados.</TableCell></TableRow>
                  ) : (
                    operarios?.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            {(op as any).foto_perfil ? (
                              <img src={(op as any).foto_perfil} alt="Perfil" className="w-8 h-8 rounded-full object-cover border" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                            )}
                            <span>{op.apellido}, {op.nombre}</span>
                          </div>
                        </TableCell>
                        <TableCell>{op.dni}</TableCell>
                        <TableCell>{op.cargo || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={op.estado === "activo" ? "default" : "secondary"}
                                className={op.estado === "activo" ? "bg-green-600 hover:bg-green-700" : ""}>
                            {op.estado.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {op.jornada_activa
                            ? <Badge variant="outline" className="text-blue-600 border-blue-600">EN CURSO</Badge>
                            : <span className="text-muted-foreground text-sm">Sin jornada</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            {(!op.dni || op.dni === "COMPLETAR" || !op.telefono || !op.fecha_ingreso || !op.contacto_familiar_nombre || !op.contacto_familiar_telefono || !(op as any).contacto_familiar_relacion) && (
                              <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                                <AlertTriangle className="w-3 h-3" /> Faltan datos
                              </Badge>
                            )}
                            <Link href={`/operarios/${op.id}`} className="text-primary hover:underline font-medium text-sm">
                              Ver perfil
                            </Link>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(op.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
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

            {/* Vista Mobile (Tarjetas) */}
            <div className="md:hidden divide-y">
              {isLoading ? (
                <div className="text-center py-8">Cargando operarios...</div>
              ) : operarios?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No se encontraron resultados.</div>
              ) : (
                operarios?.map((op) => (
                  <div key={op.id} className="p-4 bg-card flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      {(op as any).foto_perfil ? (
                        <img src={(op as any).foto_perfil} alt="Perfil" className="w-12 h-12 rounded-full object-cover border" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex flex-shrink-0 items-center justify-center border">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-base truncate">{op.apellido}, {op.nombre}</h4>
                        <p className="text-sm text-muted-foreground truncate">{op.dni} • {op.cargo || "Operario General"}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={op.estado === "activo" ? "default" : "secondary"} className={op.estado === "activo" ? "bg-green-600" : ""}>
                        {op.estado.toUpperCase()}
                      </Badge>
                      {op.jornada_activa && <Badge variant="outline" className="text-blue-600 border-blue-600">EN CURSO</Badge>}
                      {(!op.dni || op.dni === "COMPLETAR" || !op.telefono || !op.fecha_ingreso || !op.contacto_familiar_nombre || !op.contacto_familiar_telefono || !(op as any).contacto_familiar_relacion) && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Faltan datos
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Link href={`/operarios/${op.id}`} className="flex-1">
                        <Button variant="outline" className="w-full h-9 text-primary border-primary/20 hover:bg-primary/5">
                          Ver perfil
                        </Button>
                      </Link>
                      <Button variant="outline" onClick={() => handleDelete(op.id)} className="h-9 w-12 p-0 text-destructive border-destructive/20 hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <NuevoOperarioDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
