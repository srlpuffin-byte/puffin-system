import React, { useState } from "react";
import { useGetReportesResumen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, TrendingUp, DollarSign, Clock } from "lucide-react";

export function Reportes() {
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "trimestre">("mes");
  const { data: reporte, isLoading } = useGetReportesResumen({ periodo });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reportes de Operación</h1>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(val: any) => setPeriodo(val)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Última Semana</SelectItem>
              <SelectItem value="mes">Último Mes</SelectItem>
              <SelectItem value="trimestre">Último Trimestre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center p-12">Cargando reporte...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combustible Total</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reporte?.combustible_total || 0} L</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${reporte?.costo_total?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Horas de Operación</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reporte?.maquinaria?.reduce((acc, m) => acc + m.horas, 0) || 0} h
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mantenimientos</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reporte?.mantenimientos || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Rendimiento por Máquina</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Máquina</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right">Consumo (L)</TableHead>
                      <TableHead className="text-right">Disp.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte?.maquinaria?.map((maq) => (
                      <TableRow key={maq.id}>
                        <TableCell className="font-medium">{maq.nombre}</TableCell>
                        <TableCell className="text-right">{maq.horas}</TableCell>
                        <TableCell className="text-right">{maq.consumo}</TableCell>
                        <TableCell className="text-right">{maq.disponibilidad}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rendimiento de Operarios</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operario</TableHead>
                      <TableHead className="text-right">Jornadas</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right">Incidentes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte?.operarios?.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-medium">{op.nombre}</TableCell>
                        <TableCell className="text-right">{op.jornadas}</TableCell>
                        <TableCell className="text-right">{op.horas}</TableCell>
                        <TableCell className="text-right text-red-600">{op.incidentes || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
