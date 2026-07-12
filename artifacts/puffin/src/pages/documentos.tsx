import React, { useState } from "react";
import { useGetDocumentos } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { format } from "date-fns";
import { AñadirDocumentoDialog } from "@/components/forms/aniadir-documento-dialog";
import { ExportButtons } from "@/components/ui/export-buttons";
import { useLocation } from "wouter";

export function Documentos() {
  const [location] = useLocation();

  // Parse query params from the hash-based router (wouter uses hash or path)
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const empleadoIdParam = searchParams.get("empleado_id");
  const empleadoNombreParam = searchParams.get("nombre");
  const empleadoId = empleadoIdParam ? parseInt(empleadoIdParam) : undefined;

  const { data: documentos, isLoading } = useGetDocumentos(
    empleadoId ? ({ entidad_id: empleadoId, entidad_tipo: "empleado" } as any) : undefined
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [, navigate] = useLocation();

  const exportColumns = [
    { header: "Tipo", key: "tipo", formatter: (v: string) => v?.charAt(0).toUpperCase() + v?.slice(1) },
    { header: "Entidad", key: "entidad_nombre" },
    { header: "Descripción", key: "descripcion" },
    { header: "Vencimiento", key: "fecha_vencimiento", formatter: (v: string) => v ? format(new Date(v), "dd/MM/yyyy") : "-" },
    { header: "Días Restantes", key: "dias_restantes" },
    { header: "Estado", key: "estado", formatter: (v: string) => v?.toUpperCase().replace("_", " ") }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Documentación</h1>
          {empleadoId && empleadoNombreParam && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-sm">
                Filtrando por: {decodeURIComponent(empleadoNombreParam)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-muted-foreground"
                onClick={() => navigate("/documentos")}
              >
                <X className="h-3 w-3 mr-1" /> Ver todos
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {documentos && (
            <ExportButtons 
              data={documentos} 
              columns={exportColumns} 
              filename="Reporte_Documentacion" 
              title="Reporte de Documentación" 
            />
          )}
          <Button className="bg-primary flex-1 sm:flex-none" onClick={() => setOpenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir Documento
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Días Restantes</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando documentos...</TableCell></TableRow>
                ) : documentos?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {empleadoId ? "Este operario no tiene documentos registrados." : "No hay documentos registrados."}
                  </TableCell></TableRow>
                ) : (
                  documentos?.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium capitalize">{doc.tipo}</TableCell>
                      <TableCell>{doc.entidad_nombre || "-"}</TableCell>
                      <TableCell>{doc.descripcion || "-"}</TableCell>
                      <TableCell>
                        {doc.fecha_vencimiento ? format(new Date(doc.fecha_vencimiento), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className={
                        (doc.dias_restantes !== undefined && doc.dias_restantes <= 0) ? "text-red-600 font-bold" :
                        (doc.dias_restantes !== undefined && doc.dias_restantes <= 30) ? "text-yellow-600 font-bold" : ""
                      }>
                        {doc.dias_restantes !== undefined
                          ? (doc.dias_restantes <= 0 ? `Vencido hace ${Math.abs(doc.dias_restantes)} días` : `${doc.dias_restantes} días`)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={doc.estado === "vigente" ? "default" : doc.estado === "vencido" ? "destructive" : "outline"}
                          className={
                            doc.estado === "vigente" ? "bg-green-600 hover:bg-green-700" :
                            doc.estado === "proximo_vencimiento" ? "text-yellow-600 border-yellow-600" : ""
                          }
                        >
                          {doc.estado?.toUpperCase().replace("_", " ")}
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

      <AñadirDocumentoDialog open={openDialog} onOpenChange={setOpenDialog} />
    </div>
  );
}
