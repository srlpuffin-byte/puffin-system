import React, { useState } from "react";
import { useGetMaquinas } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
import { Link } from "wouter";
import { NuevaMaquinaDialog } from "@/components/forms/nueva-maquina-dialog";

const estadoBadge = (estado: string) => {
  if (estado === "activa") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVA</Badge>;
  if (estado === "detenida") return <Badge variant="destructive">DETENIDA</Badge>;
  if (estado === "mantenimiento") return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-transparent">MANTENIMIENTO</Badge>;
  return <Badge variant="secondary">{estado.toUpperCase()}</Badge>;
};

export function Maquinas() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const { data: maquinas, isLoading } = useGetMaquinas({ search: search || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Maquinaria</h1>
        <Button className="bg-primary" onClick={() => setOpenDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Máquina
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por código, nombre o patente..."
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
                        <Link href={`/maquinas/${maq.id}`} className="text-primary hover:underline font-medium text-sm">
                          Ver ficha
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

      <NuevaMaquinaDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
