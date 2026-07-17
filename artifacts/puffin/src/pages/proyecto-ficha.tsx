import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetProyecto } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas, useGetEgresos } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, MapPin, Activity, DollarSign, Users, Tractor, ExternalLink, TrendingDown, TrendingUp, Minus, Receipt, Package } from "lucide-react";
import { format } from "date-fns";

export function ProyectoFicha() {
  const { id } = useParams();
  const proyectoId = parseInt(id || "0", 10);

  const { data: proyecto, isLoading } = useGetProyecto(proyectoId);
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();
  const { data: todosLosEgresos } = useGetEgresos();

  // Tipo de cambio editable (usuario lo puede ajustar)
  const [tipoCambio, setTipoCambio] = useState("1200");

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando proyecto...</div>;
  if (!proyecto) return <div className="p-8 text-center text-red-500">Proyecto no encontrado</div>;

  const assignedEmpleados = empleados?.filter(e => proyecto.empleados_asignados?.includes(e.id)) || [];
  const assignedMaquinas = maquinas?.filter(m => proyecto.maquinas_asignadas?.includes(m.id) && m.categoria !== "inventario") || [];
  const assignedInventario = maquinas?.filter(m => proyecto.maquinas_asignadas?.includes(m.id) && m.categoria === "inventario") || [];

  // Filtrar egresos de este proyecto (por nombre de lugar en centro_costos)
  const egresosProyecto = todosLosEgresos?.filter(eg =>
    eg.centro_costos?.toLowerCase().includes(proyecto.lugar.toLowerCase()) ||
    proyecto.lugar.toLowerCase().includes((eg.centro_costos || "").toLowerCase())
  ) || [];

  // Totales
  const totalGastosARS = egresosProyecto.reduce((sum, eg) => sum + parseFloat(eg.monto?.toString() || "0"), 0);
  const tc = parseFloat(tipoCambio) || 1;
  const gananciaUSD = parseFloat(proyecto.ganancia_estimada || "0");
  const gananciaARS = gananciaUSD * tc;
  const netoARS = gananciaARS - totalGastosARS;
  const netoUSD = netoARS / tc;
  const porcentajeGastado = gananciaARS > 0 ? (totalGastosARS / gananciaARS) * 100 : 0;

  const estadoBadge = (estado: string) => {
    if (estado === "activo") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVO</Badge>;
    if (estado === "finalizado") return <Badge variant="secondary">FINALIZADO</Badge>;
    return <Badge variant="outline">{estado.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/proyectos">
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-3">
            {proyecto.lugar}
            {estadoBadge(proyecto.estado)}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" /> Proyecto ID: {proyecto.id} • Creado el {format(new Date(proyecto.createdAt), "dd/MM/yyyy")}
          </p>
        </div>
      </div>

      {/* Financiero resumen */}
      <Card className="border-2 border-slate-200 bg-slate-50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Resumen Financiero del Proyecto</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Tipo de cambio USD $</Label>
              <Input
                type="number"
                value={tipoCambio}
                onChange={e => setTipoCambio(e.target.value)}
                className="w-32 h-8 text-sm"
                placeholder="1200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Ganancia estimada */}
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-600" /> Ganancia Estimada
              </p>
              <p className="font-bold text-xl text-green-700 mt-1">
                USD ${gananciaUSD.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ ${gananciaARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })} ARS
              </p>
            </div>

            {/* Total gastos */}
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-500" /> Total Gastos
              </p>
              <p className="font-bold text-xl text-red-600 mt-1">
                ${totalGastosARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ USD ${(totalGastosARS / tc).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Neto */}
            <div className={`rounded-lg p-4 border-2 ${netoARS >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Minus className="h-3 w-3" /> Neto (Ganancia - Gastos)
              </p>
              <p className={`font-bold text-xl mt-1 ${netoARS >= 0 ? "text-green-700" : "text-red-600"}`}>
                ${netoARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })} ARS
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ USD ${netoUSD.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* % gastado */}
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground font-medium">% del Presupuesto Gastado</p>
              <p className={`font-bold text-xl mt-1 ${porcentajeGastado > 80 ? "text-red-600" : porcentajeGastado > 50 ? "text-amber-600" : "text-slate-800"}`}>
                {porcentajeGastado.toFixed(1)}%
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full transition-all ${porcentajeGastado > 80 ? "bg-red-500" : porcentajeGastado > 50 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(porcentajeGastado, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: datos + personal + maquinaria */}
        <div className="space-y-6">
          {/* Datos comerciales */}
          <Card>
            <CardHeader><CardTitle>Datos Comerciales</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Hectáreas
                </p>
                <p className="font-medium text-lg">{parseFloat(proyecto.hectareas).toLocaleString("es-AR")} Has.</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Precio por Hectárea
                </p>
                <p className="font-medium text-lg">USD ${parseFloat(proyecto.precio_hectarea).toLocaleString("es-AR")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Personal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-blue-600" /> Personal Asignado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignedEmpleados.length === 0 ? (
                <p className="text-muted-foreground italic text-sm">Sin empleados asignados.</p>
              ) : (
                <div className="space-y-2">
                  {assignedEmpleados.map(e => (
                    <Link key={e.id} href={`/operarios/${e.id}`}>
                      <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group text-sm">
                        <span className="font-medium">{e.nombre} {e.apellido}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maquinaria */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tractor className="h-4 w-4 text-amber-600" /> Maquinaria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignedMaquinas.length === 0 ? (
                <p className="text-muted-foreground italic text-sm">Sin maquinaria asignada.</p>
              ) : (
                <div className="space-y-2">
                  {assignedMaquinas.map(m => (
                    <Link key={m.id} href={`/maquinas/${m.id}`}>
                      <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{m.nombre}</span>
                          <span className="text-xs text-muted-foreground">{m.marca} {m.modelo}</span>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inventario */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-purple-600" /> Inventario
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignedInventario.length === 0 ? (
                <p className="text-muted-foreground italic text-sm">Sin inventario asignado.</p>
              ) : (
                <div className="space-y-2">
                  {assignedInventario.map(m => (
                    <Link key={m.id} href={`/maquinas/${m.id}`}>
                      <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{m.nombre}</span>
                          {(m.marca || m.modelo) && (
                            <span className="text-xs text-muted-foreground">{m.marca} {m.modelo}</span>
                          )}
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: gastos del proyecto */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-red-500" />
                Gastos de este Proyecto
              </CardTitle>
              <CardDescription>
                {egresosProyecto.length === 0
                  ? "No hay gastos registrados para este proyecto todavía."
                  : `${egresosProyecto.length} gasto(s) registrado(s) — Total: $${totalGastosARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {egresosProyecto.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Cuando registres un egreso asignado a <strong>{proyecto.lugar}</strong>, aparecerá acá automáticamente.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Monto ARS</TableHead>
                        <TableHead className="text-right">≈ USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {egresosProyecto.map(eg => {
                        const monto = parseFloat(eg.monto?.toString() || "0");
                        return (
                          <TableRow key={eg.id}>
                            <TableCell className="text-sm">
                              {eg.fecha ? format(new Date(eg.fecha), "dd/MM/yyyy") : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{eg.categoria}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate" title={eg.concepto}>
                              {eg.concepto}
                            </TableCell>
                            <TableCell className="text-right font-medium text-red-600 text-sm">
                              ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              USD ${(monto / tc).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Fila total */}
                      <TableRow className="border-t-2 bg-slate-50 font-bold">
                        <TableCell colSpan={3} className="text-right text-sm">TOTAL GASTOS</TableCell>
                        <TableCell className="text-right text-red-600">
                          ${totalGastosARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          USD ${(totalGastosARS / tc).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
