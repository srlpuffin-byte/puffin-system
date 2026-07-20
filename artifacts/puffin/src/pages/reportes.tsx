import React, { useState } from "react";
import { useGetReportesResumen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "@/components/ui/export-buttons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart3, TrendingUp, DollarSign, Clock, Download, FileText, Printer } from "lucide-react";

function disponibilidadColor(d: number) {
  if (d >= 80) return "text-green-600 font-bold";
  if (d >= 50) return "text-yellow-600 font-bold";
  return "text-red-600 font-bold";
}

function puntajeColor(p: number) {
  if (p >= 80) return "bg-green-100 text-green-800";
  if (p >= 60) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

// Función eliminada, usando ExportButtons

const COLORS_CHART = ["#1B2B5E", "#4A7A2B", "#2563eb", "#7c3aed", "#dc2626", "#d97706"];

export function Reportes() {
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "trimestre">("mes");
  const { data: reporte, isLoading } = useGetReportesResumen({ periodo });

  const maquinaria = reporte?.maquinaria || [];
  const operarios = reporte?.operarios || [];

  const totalHorasMaquinas = maquinaria.reduce((a: number, m: any) => a + (m.horas || 0), 0);

  const chartMaquinasHoras = maquinaria.slice(0, 8).map((m: any) => ({ nombre: m.nombre, horas: m.horas || 0 }));
  const chartOperariosJornadas = operarios.slice(0, 8).map((o: any) => ({ nombre: o.nombre?.split(" ")[0] || "—", jornadas: o.jornadas || 0, horas: o.horas || 0 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reportes de Operación</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={periodo} onValueChange={(val: any) => setPeriodo(val)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Última Semana</SelectItem>
              <SelectItem value="mes">Último Mes</SelectItem>
              <SelectItem value="trimestre">Último Trimestre</SelectItem>
            </SelectContent>
          </Select>
// Botón general removido, ahora está en cada tabla
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-muted-foreground">Cargando reporte...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combustible Total</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reporte?.combustible_total ?? 0} L</div>
                <p className="text-xs text-muted-foreground mt-1">Período: {periodo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${(reporte?.costo_total ?? 0).toLocaleString("es-AR")}</div>
                <p className="text-xs text-muted-foreground mt-1">Combustible</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Horas de Operación</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalHorasMaquinas.toFixed(1)} h</div>
                <p className="text-xs text-muted-foreground mt-1">{maquinaria.length} máquinas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mantenimientos</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reporte?.mantenimientos ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Realizados</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {chartMaquinasHoras.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horas por Máquina</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartMaquinasHoras} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="nombre" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v} h`, "Horas"]} />
                      <Bar dataKey="horas" radius={[3, 3, 0, 0]}>
                        {chartMaquinasHoras.map((_, i) => (
                          <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {chartOperariosJornadas.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Jornadas por Operario</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartOperariosJornadas} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="nombre" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [`${v}`, "Jornadas"]} />
                      <Bar dataKey="jornadas" radius={[3, 3, 0, 0]}>
                        {chartOperariosJornadas.map((_, i) => (
                          <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Rendimiento por Máquina</CardTitle>
                <ExportButtons 
                  data={maquinaria} 
                  columns={[
                    { header: "Máquina", key: "nombre" },
                    { header: "Horas", key: "horas" },
                    { header: "Km", key: "kilometros" },
                    { header: "Consumo (L)", key: "consumo" },
                    { header: "Disponibilidad (%)", key: "disponibilidad" }
                  ]}
                  filename={`Maquinaria_${periodo}`} 
                  title={`Rendimiento por Máquina - ${periodo}`} 
                />
              </CardHeader>
              <CardContent>
                {maquinaria.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">Sin datos para el período</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    {/* Vista Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Máquina</TableHead>
                            <TableHead className="text-right">Horas</TableHead>
                            <TableHead className="text-right">Km</TableHead>
                            <TableHead className="text-right">Consumo (L)</TableHead>
                            <TableHead className="text-right">Disp.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {maquinaria.map((maq) => (
                            <TableRow key={maq.id}>
                              <TableCell className="font-medium text-sm">{maq.nombre}</TableCell>
                              <TableCell className="text-right">{maq.horas ?? 0}</TableCell>
                              <TableCell className="text-right">{maq.kilometros ?? 0}</TableCell>
                              <TableCell className="text-right">{maq.consumo ?? 0}</TableCell>
                              <TableCell className={`text-right font-medium ${disponibilidadColor(maq.disponibilidad ?? 0)}`}>
                                {maq.disponibilidad ?? 0}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Vista Mobile */}
                    <div className="md:hidden divide-y">
                      {maquinaria.map((maq) => (
                        <div key={maq.id} className="p-3 flex flex-col gap-2 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-primary">{maq.nombre}</span>
                            <Badge variant="outline" className={maq.disponibilidad ?? 0 >= 80 ? "border-green-200 text-green-700 bg-green-50" : (maq.disponibilidad ?? 0) >= 50 ? "border-yellow-200 text-yellow-700 bg-yellow-50" : "border-red-200 text-red-700 bg-red-50"}>
                              {maq.disponibilidad ?? 0}% Disp.
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm bg-slate-50 p-2 rounded border mt-1">
                            <div className="flex flex-col">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Horas</span>
                              <span className="font-medium">{maq.horas ?? 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Km</span>
                              <span className="font-medium">{maq.kilometros ?? 0}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Consumo</span>
                              <span className="font-medium">{maq.consumo ?? 0} L</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Rendimiento de Operarios</CardTitle>
                <ExportButtons 
                  data={operarios} 
                  columns={[
                    { header: "Operario", key: "nombre" },
                    { header: "Jornadas", key: "jornadas" },
                    { header: "Horas", key: "horas" },
                    { header: "Incidentes", key: "incidentes" },
                    { header: "Puntaje", key: "puntaje" }
                  ]}
                  filename={`Operarios_${periodo}`} 
                  title={`Rendimiento de Operarios - ${periodo}`} 
                />
              </CardHeader>
              <CardContent>
                {operarios.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">Sin datos para el período</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    {/* Vista Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operario</TableHead>
                            <TableHead className="text-right">Jornadas</TableHead>
                            <TableHead className="text-right">Horas</TableHead>
                            <TableHead className="text-right">Incidentes</TableHead>
                            <TableHead className="text-right">Puntaje</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {operarios.map((op) => (
                            <TableRow key={op.id}>
                              <TableCell className="font-medium text-sm">{op.nombre}</TableCell>
                              <TableCell className="text-right">{op.jornadas ?? 0}</TableCell>
                              <TableCell className="text-right">{op.horas ?? 0}</TableCell>
                              <TableCell className={`text-right ${(op.incidentes ?? 0) > 0 ? "text-red-600 font-bold" : ""}`}>
                                {op.incidentes ?? 0}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${puntajeColor(op.puntaje ?? 0)}`}>
                                  {op.puntaje ?? 100}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Vista Mobile */}
                    <div className="md:hidden divide-y">
                      {operarios.map((op) => (
                        <div key={op.id} className="p-3 flex flex-col gap-2 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-primary">{op.nombre}</span>
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${puntajeColor(op.puntaje ?? 0)}`}>
                              Puntaje: {op.puntaje ?? 100}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 text-sm bg-slate-50 p-2 rounded border mt-1">
                            <div className="flex flex-col">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Jornadas</span>
                              <span className="font-medium">{op.jornadas ?? 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Horas</span>
                              <span className="font-medium">{op.horas ?? 0}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="uppercase text-muted-foreground text-[10px] font-semibold">Incidentes</span>
                              <span className={(op.incidentes ?? 0) > 0 ? "text-red-600 font-bold" : "font-medium"}>
                                {op.incidentes ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
