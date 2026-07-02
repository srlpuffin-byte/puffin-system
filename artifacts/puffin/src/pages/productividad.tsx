import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Users, Truck, Star, AlertTriangle } from "lucide-react";

interface OperarioMetric {
  id: number;
  nombre: string;
  cargo: string;
  estado: string;
  jornadas: number;
  horas: number;
  incidentes: number;
  alertas: number;
  score: number;
  calificacion: string;
}

interface MaquinaMetric {
  id: number;
  nombre: string;
  tipo: string;
  estado: string;
  horas: number;
  kilometros: number;
  consumo: number;
  costo: number;
  fallas: number;
  disponibilidad: number;
}

interface Productividad {
  periodo: string;
  operarios: OperarioMetric[];
  maquinas: MaquinaMetric[];
}

function calificacionColor(cal: string) {
  if (cal === "Excelente") return "bg-green-600";
  if (cal === "Bueno") return "bg-blue-600";
  if (cal === "Regular") return "bg-yellow-600";
  return "bg-red-600";
}

function scoreColor(score: number) {
  if (score >= 90) return "bg-green-600";
  if (score >= 75) return "bg-blue-600";
  if (score >= 60) return "bg-yellow-600";
  return "bg-red-600";
}

function estadoBadge(estado: string) {
  const map: Record<string, { label: string; cls: string }> = {
    activa: { label: "Activa", cls: "bg-green-600" },
    detenida: { label: "Detenida", cls: "bg-red-600" },
    mantenimiento: { label: "Mantenimiento", cls: "bg-yellow-600" },
  };
  const m = map[estado] || { label: estado, cls: "bg-slate-600" };
  return <Badge className={`${m.cls} text-white text-xs`}>{m.label}</Badge>;
}

export function Productividad() {
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "trimestre">("mes");

  const { data, isLoading } = useQuery<Productividad>({
    queryKey: ["productividad", periodo],
    queryFn: () => apiFetch(`/productividad?periodo=${periodo}`),
  });

  const operarios = data?.operarios || [];
  const maquinas = data?.maquinas || [];

  const avgScore = operarios.length > 0
    ? Math.round(operarios.reduce((a, o) => a + o.score, 0) / operarios.length)
    : 0;

  const totalHoras = operarios.reduce((a, o) => a + o.horas, 0);
  const totalIncidentes = operarios.reduce((a, o) => a + o.incidentes, 0);
  const fleetDisponibilidad = maquinas.length > 0
    ? Math.round(maquinas.reduce((a, m) => a + m.disponibilidad, 0) / maquinas.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-primary">Productividad</h1>
        </div>
        <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Última Semana</SelectItem>
            <SelectItem value="mes">Último Mes</SelectItem>
            <SelectItem value="trimestre">Último Trimestre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Star className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-3xl font-bold">{avgScore}</div>
                <p className="text-xs text-muted-foreground">Puntaje promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-3xl font-bold">{totalHoras.toFixed(0)}</div>
                <p className="text-xs text-muted-foreground">Horas operarios</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <div className="text-3xl font-bold">{totalIncidentes}</div>
                <p className="text-xs text-muted-foreground">Incidentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Truck className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-3xl font-bold">{fleetDisponibilidad}%</div>
                <p className="text-xs text-muted-foreground">Disponibilidad flota</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Calculando indicadores...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Rendimiento de Operarios
              </CardTitle>
            </CardHeader>
            <CardContent>
              {operarios.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay datos de operarios para el período seleccionado</p>
              ) : (
                <div className="space-y-4">
                  {operarios.map((op) => (
                    <div key={op.id} className="space-y-2 p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{op.nombre}</p>
                          <p className="text-xs text-muted-foreground">{op.cargo || "Sin cargo"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{op.score}/100</span>
                          <Badge className={`${calificacionColor(op.calificacion)} text-white text-xs`}>
                            {op.calificacion}
                          </Badge>
                        </div>
                      </div>
                      <Progress value={op.score} className="h-2" />
                      <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                        <div className="text-center">
                          <div className="font-bold text-foreground">{op.jornadas}</div>
                          <div>Jornadas</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-foreground">{op.horas}</div>
                          <div>Horas</div>
                        </div>
                        <div className="text-center">
                          <div className={`font-bold ${op.incidentes > 0 ? "text-red-600" : "text-foreground"}`}>{op.incidentes}</div>
                          <div>Incidentes</div>
                        </div>
                        <div className="text-center">
                          <div className={`font-bold ${op.alertas > 0 ? "text-yellow-600" : "text-foreground"}`}>{op.alertas}</div>
                          <div>Alertas</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" /> Rendimiento de Maquinaria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {maquinas.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay maquinaria registrada</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Máquina</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right">Consumo (L)</TableHead>
                      <TableHead className="text-right">Fallas</TableHead>
                      <TableHead className="text-right">Disp.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maquinas.map((maq) => (
                      <TableRow key={maq.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{maq.nombre}</div>
                          <div className="text-xs text-muted-foreground">{maq.tipo}</div>
                        </TableCell>
                        <TableCell className="text-right">{maq.horas}</TableCell>
                        <TableCell className="text-right">{maq.consumo}</TableCell>
                        <TableCell className="text-right">
                          <span className={maq.fallas > 0 ? "text-red-600 font-bold" : ""}>{maq.fallas}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={maq.disponibilidad >= 80 ? "text-green-600 font-bold" : maq.disponibilidad >= 50 ? "text-yellow-600 font-bold" : "text-red-600 font-bold"}>
                            {maq.disponibilidad}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {maquinas.length > 0 && (
                <div className="mt-4 text-xs text-muted-foreground bg-slate-50 p-3 rounded">
                  Puntaje calculado en base a jornadas registradas, incidentes y alertas del período seleccionado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
