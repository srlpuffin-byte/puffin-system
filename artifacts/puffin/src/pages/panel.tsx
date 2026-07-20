import React from "react";
import { Link } from "wouter";
import { useGetDashboardResumen, useGetAlertas, useGetActividad, useGetMe, useGetCalendarioEventos } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Droplets,
  HardHat,
  Settings,
  Truck,
  FileText,
  Bell,
  ArrowRight,
  Satellite,
  Activity,
  TrendingUp,
  Calendar,
  Wrench,
  MapPin,
  User,
  Package,
} from "lucide-react";

function prioridadColor(p: string) {
  if (p === "roja") return "bg-red-100 border-red-300 text-red-800";
  if (p === "amarilla") return "bg-yellow-100 border-yellow-300 text-yellow-800";
  return "bg-blue-100 border-blue-300 text-blue-800";
}

function prioridadDot(p: string) {
  if (p === "roja") return "bg-red-500";
  if (p === "amarilla") return "bg-yellow-500";
  return "bg-blue-500";
}

function diasRestantesBadge(dias: number) {
  if (dias <= 0) return <Badge variant="destructive">Vencido</Badge>;
  if (dias <= 7) return <Badge className="bg-red-600 text-white">{dias} d</Badge>;
  if (dias <= 30) return <Badge className="bg-yellow-600 text-white">{dias} d</Badge>;
  return <Badge className="bg-green-600 text-white">{dias} d</Badge>;
}

function formatFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatFechaCorta(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function Panel() {
  const { data: user } = useGetMe();
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";

  const { data: resumen, isLoading } = useGetDashboardResumen();
  const { data: alertasData } = useGetAlertas({ estado: "activa" });
  const { data: actividadData } = useGetActividad({ limit: 8 });
  
  const currentDate = new Date();
  const { data: eventosData } = useGetCalendarioEventos({ 
    mes: currentDate.getMonth() + 1, 
    anio: currentDate.getFullYear() 
  });

  const alertas = (alertasData as any[]) || [];
  const actividad = (actividadData as any[]) || [];
  const vencimientos = resumen?.proximos_vencimientos || [];
  const maquinasResumen = (resumen?.maquinas_resumen as any[]) || [];

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const upcomingEvents = ((eventosData as any[]) || [])
    .filter(e => {
      // Fix timezone parsing by appending T12:00:00 if it's a date-only string
      // or parsing local date correctly
      const dateStr = e.fecha.includes('T') ? e.fecha : `${e.fecha}T12:00:00`;
      const eDate = new Date(dateStr);
      eDate.setHours(0,0,0,0);
      return eDate >= todayStart;
    })
    .sort((a, b) => {
      const dateA = a.fecha.includes('T') ? a.fecha : `${a.fecha}T12:00:00`;
      const dateB = b.fecha.includes('T') ? b.fecha : `${b.fecha}T12:00:00`;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    })
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Cargando panel...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Panel de Control</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {!isEmpleado && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Link href="/maquinas?estado=activa">
            <Card className="border-l-4 border-l-green-600 cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Máquinas activas</p>
                    <div className="text-2xl font-bold text-green-600">{resumen?.maquinas_activas ?? 0}</div>
                  </div>
                  <Truck className="h-7 w-7 text-green-600 opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/maquinas?estado=detenida">
            <Card className="border-l-4 border-l-yellow-600 cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Detenidas</p>
                    <div className="text-2xl font-bold text-yellow-600">{resumen?.maquinas_detenidas ?? 0}</div>
                  </div>
                  <Settings className="h-7 w-7 text-yellow-600 opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/maquinas?estado=mantenimiento">
            <Card className="border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Mantenimiento</p>
                    <div className="text-2xl font-bold text-orange-500">{resumen?.maquinas_mantenimiento ?? 0}</div>
                  </div>
                  <Wrench className="h-7 w-7 text-orange-500 opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/maquinas">
            <Card className="border-l-4 border-l-purple-600 cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Inventario</p>
                    <div className="text-2xl font-bold text-purple-600">{(resumen as any)?.inventario_activo ?? 0}</div>
                  </div>
                  <Package className="h-7 w-7 text-purple-600 opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/operarios">
            <Card className="border-l-4 border-l-primary cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Operarios activos</p>
                    <div className="text-2xl font-bold text-primary">{resumen?.empleados_activos ?? 0}</div>
                  </div>
                  <HardHat className="h-7 w-7 text-primary opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/alertas">
            <Card className="border-l-4 border-l-red-600 cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Alertas activas</p>
                    <div className="text-2xl font-bold text-red-600">{resumen?.alertas_activas ?? 0}</div>
                  </div>
                  <AlertCircle className="h-7 w-7 text-red-600 opacity-70" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {isEmpleado && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6 pb-6 flex items-center gap-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">¡Hola, {user?.nombre}!</h2>
              <p className="text-sm text-muted-foreground mt-1">Este es tu panel personal. Aquí verás el resumen de tu actividad, horas trabajadas y combustible registrado este mes.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-5 text-center">
            <Droplets className="h-7 w-7 text-blue-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{resumen?.litros_mes ?? 0} L</div>
            <p className="text-xs text-muted-foreground mt-1">Combustible del mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5 text-center">
            <Clock className="h-7 w-7 text-orange-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{resumen?.horas_mes ?? 0} h</div>
            <p className="text-xs text-muted-foreground mt-1">Horas trabajadas</p>
          </CardContent>
        </Card>
        {!isEmpleado && (
          <>
            <Card>
              <CardContent className="pt-5 pb-5 text-center">
                <Settings className="h-7 w-7 text-slate-500 mx-auto mb-1" />
                <div className="text-2xl font-bold">{resumen?.mantenimientos_mes ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Mantenimientos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5 text-center">
                <CheckCircle2 className="h-7 w-7 text-green-500 mx-auto mb-1" />
                <div className="text-2xl font-bold">{resumen?.disponibilidad ?? 0}%</div>
                <p className="text-xs text-muted-foreground mt-1">Disponibilidad</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          {!isEmpleado && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Estado de la Flota
                </CardTitle>
                <Link href="/maquinas">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    Ver todas <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {maquinasResumen.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">No hay maquinaria registrada</p>
                ) : (
                  <div className="space-y-2">
                    {maquinasResumen.slice(0, 6).map((maq: any) => (
                      <div key={maq.id} className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                            maq.estado === "activa" ? "bg-green-500" :
                            maq.estado === "mantenimiento" ? "bg-yellow-500" : "bg-red-500"
                          }`} />
                          <div>
                            <p className="text-sm font-medium">{maq.nombre}</p>
                            <p className="text-xs text-muted-foreground">{maq.tipo}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{Number(maq.horometro).toFixed(0)} h</span>
                          <span>{Number(maq.kilometros).toFixed(0)} km</span>
                          <Badge
                            className={`text-xs ${
                              maq.estado === "activa" ? "bg-green-600 text-white" :
                              maq.estado === "mantenimiento" ? "bg-yellow-600 text-white" :
                              "bg-red-600 text-white"
                            }`}
                          >
                            {maq.estado === "activa" ? "Activa" : maq.estado === "mantenimiento" ? "Mantenimiento" : "Detenida"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!isEmpleado && (
            <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Actividad Reciente
              </CardTitle>
              <Link href="/actividad">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Ver todo <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {actividad.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">Sin actividad registrada</p>
              ) : (
                <div className="space-y-3">
                  {actividad.slice(0, 6).map((ev: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{ev.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.usuario_nombre && `${ev.usuario_nombre} · `}{formatFecha(ev.fecha || ev.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Próximos Eventos
              </CardTitle>
              <Link href="/calendario">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Ver calendario <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">No hay eventos próximos para este mes</p>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((ev: any, i: number) => {
                    const dateStr = ev.fecha.includes('T') ? ev.fecha : `${ev.fecha}T12:00:00`;
                    const eDate = new Date(dateStr);
                    const isToday = eDate.toDateString() === new Date().toDateString();
                    return (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isToday ? 'bg-blue-50 border-blue-200' : 'bg-card hover:bg-slate-50 transition-colors'}`}>
                        <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${isToday ? 'bg-blue-500' : 'bg-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isToday ? 'text-blue-900' : ''}`}>
                            {ev.titulo}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatFechaCorta(dateStr)} {ev.entidad_nombre ? `· ${ev.entidad_nombre}` : ''}
                          </p>
                        </div>
                        {isToday && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] uppercase">
                            Hoy
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!isEmpleado && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Alertas Activas
              </CardTitle>
              <Link href="/alertas">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {alertas.length === 0 ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <p className="text-sm text-muted-foreground">Sin alertas activas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alertas.slice(0, 5).map((al: any) => (
                    <div key={al.id} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${prioridadColor(al.prioridad)}`}>
                      <div className={`h-2 w-2 rounded-full mt-0.5 flex-shrink-0 ${prioridadDot(al.prioridad)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{al.tipo}</p>
                        <p className="truncate opacity-80">{al.descripcion}</p>
                      </div>
                    </div>
                  ))}
                  {alertas.length > 5 && (
                    <Link href="/alertas">
                      <p className="text-xs text-center text-muted-foreground pt-1 hover:text-primary cursor-pointer">
                        +{alertas.length - 5} alertas más
                      </p>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Próximos Vencimientos
              </CardTitle>
              <Link href="/documentos">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {vencimientos.length === 0 ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <p className="text-sm text-muted-foreground">Sin vencimientos próximos</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vencimientos.slice(0, 5).map((v: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{v.tipo}</p>
                        <p className="text-xs text-muted-foreground truncate">{v.descripcion}</p>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        {diasRestantesBadge(v.dias_restantes)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!isEmpleado && (
          <Card className="border-2 border-dashed border-slate-200">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-full bg-slate-100 p-3">
                  <Satellite className="h-8 w-8 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">Mapa GPS</p>
                  <p className="text-xs text-slate-500 mt-0.5">Visualización en tiempo real</p>
                </div>
                <Link href="/gps">
                  <Button size="sm" variant="outline" className="text-xs">
                    <MapPin className="h-3 w-3 mr-1" /> Ver GPS
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      {!isEmpleado && (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/jornadas">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Jornadas</p>
                <p className="text-xs text-muted-foreground">Iniciar / Finalizar</p>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/combustible">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Droplets className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-semibold">Combustible</p>
                <p className="text-xs text-muted-foreground">Registrar carga</p>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/reportes">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-semibold">Reportes</p>
                <p className="text-xs text-muted-foreground">Ver indicadores</p>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/calendario">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-purple-500">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-semibold">Calendario</p>
                <p className="text-xs text-muted-foreground">Ver eventos</p>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
      )}
    </div>
  );
}
