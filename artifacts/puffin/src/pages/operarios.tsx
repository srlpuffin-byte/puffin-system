import React, { useState } from "react";
import { useGetEmpleados } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
import { Link } from "wouter";
import { NuevoOperarioDialog } from "@/components/forms/nuevo-operario-dialog";

export function Operarios() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const { data: operarios, isLoading } = useGetEmpleados({ search: search || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Operarios</h1>
        <Button className="bg-primary" onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Operario
        </Button>
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

          <div className="rounded-md border">
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
                      <TableCell className="font-medium">{op.apellido}, {op.nombre}</TableCell>
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
                        <Link href={`/operarios/${op.id}`} className="text-primary hover:underline font-medium text-sm">
                          Ver perfil
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NuevoOperarioDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
