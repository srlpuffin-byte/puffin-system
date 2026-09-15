import React, { useState, useMemo } from "react";
import { useParams, useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetProyecto, useDeletePago } from "@/hooks/use-proyectos";
import { useGetEmpleados, useGetMaquinas, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Activity, 
  DollarSign, 
  Users, 
  Tractor, 
  ExternalLink, 
  TrendingDown, 
  TrendingUp, 
  Minus, 
  Receipt, 
  Package, 
  Trash2, 
  RefreshCw, 
  AlertCircle,
  Search,
  Filter,
  Wrench,
  Fuel,
  Briefcase,
  X,
  CreditCard,
  Building2,
  FileCheck,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

function formatDateSafe(dateStr: any) {
  if (!dateStr) return "-";
  try {
    const str = typeof dateStr === "string" ? dateStr.replace(" ", "T") : dateStr;
    const d = new Date(str);
    if (isNaN(d.getTime())) return "-";
    return format(d, "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

function getCategoriaVisual(categoria: string) {
  const cat = (categoria || "").toLowerCase().trim();
  if (cat.includes("mant") || cat.includes("taller") || cat.includes("service")) {
    return {
      icon: Wrench,
      bg: "bg-sky-50 text-sky-700 border-sky-200/80",
      badge: "bg-sky-50 text-sky-700 border-sky-200",
      label: categoria || "Mantenimiento"
    };
  }
  if (cat.includes("combus") || cat.includes("nafta") || cat.includes("gasoil")) {
    return {
      icon: Fuel,
      bg: "bg-amber-50 text-amber-700 border-amber-200/80",
      badge: "bg-amber-50 text-amber-700 border-amber-200",
      label: categoria || "Combustible"
    };
  }
  if (cat.includes("repuesto") || cat.includes("pieza")) {
    return {
      icon: Package,
      bg: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
      label: categoria || "Repuestos"
    };
  }
  if (cat.includes("servicio") || cat.includes("honorario") || cat.includes("profesional")) {
    return {
      icon: Briefcase,
      bg: "bg-purple-50 text-purple-700 border-purple-200/80",
      badge: "bg-purple-50 text-purple-700 border-purple-200",
      label: categoria || "Servicios"
    };
  }
  if (cat.includes("sueldo") || cat.includes("salario") || cat.includes("jornal") || cat.includes("adelanto") || cat.includes("personal")) {
    return {
      icon: Users,
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      label: categoria || "Personal"
    };
  }
  return {
    icon: Receipt,
    bg: "bg-slate-100 text-slate-700 border-slate-200",
    badge: "bg-slate-50 text-slate-700 border-slate-200",
    label: categoria || "Otros"
  };
}

function getInitials(nombre?: string, apellido?: string) {
  const n = (nombre || "").trim().charAt(0).toUpperCase();
  const a = (apellido || "").trim().charAt(0).toUpperCase();
  return `${n}${a}` || "OP";
}

export function ProyectoFicha({ params: propParams }: { params?: { id?: string } } = {}) {
  const hookParams = useParams<{ id?: string }>();
  const [, matchParams] = useRoute("/proyectos/:id");
  const [loc] = useLocation();

  // Múltiples fuentes de respaldo para resolver el ID del proyecto
  const urlMatch = loc.match(/\/proyectos\/([^\/\?#]+)/) || 
    (typeof window !== "undefined" ? window.location.pathname.match(/\/proyectos\/([^\/\?#]+)/) : null);

  const rawId = propParams?.id || hookParams?.id || matchParams?.id || (urlMatch ? urlMatch[1] : undefined);
  const proyectoId = parseInt(rawId || "0", 10);

  const { data: proyecto, isLoading, isError, refetch } = useGetProyecto(proyectoId);
  const { data: empleados } = useGetEmpleados();
  const { data: maquinas } = useGetMaquinas();
  const { data: me } = useGetMe();
  const isEmpleado = me?.rol?.toLowerCase() === "empleado";
  const deletePagoMut = useDeletePago();

  // Consulta directa de TODOS los egresos de este proyecto al servidor (sin recorte de 50)
  const { data: egresosProyectoResp } = useQuery<{ data: any[]; meta?: { total: number; total_suma: number } }>({
    queryKey: ["/api/proyectos", proyectoId, "egresos"],
    queryFn: async () => {
      const token = localStorage.getItem("puffin_token");
      const res = await fetch(`/api/proyectos/${proyectoId}/egresos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Error al obtener egresos del proyecto");
      return res.json();
    },
    enabled: !!proyectoId && !isEmpleado,
  });

  const handleDeletePago = async (pagoId: string) => {
    if (!confirm("¿Estás seguro de eliminar este cobro/pago?")) return;
    try {
      await deletePagoMut.mutateAsync({ id: proyectoId, pagoId });
      toast.success("Pago eliminado correctamente");
    } catch (e) {
      toast.error("Error al eliminar el pago");
    }
  };

  // Tipo de cambio editable (usuario lo puede ajustar)
  const [tipoCambio, setTipoCambio] = useState("1200");

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-sm font-medium">Cargando datos del proyecto...</p>
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className="p-6 max-w-md mx-auto my-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg text-slate-800">Proyecto no encontrado</h3>
          <p className="text-sm text-muted-foreground">
            No se pudo cargar la información del proyecto solicitado (ID: {rawId || "no especificado"}).
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/proyectos">
            <Button variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" /> Volver a Proyectos
            </Button>
          </Link>
          <Button variant="default" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const assignedEmpleados = empleados?.filter(e => proyecto.empleados_asignados?.includes(e.id)) || [];
  const assignedMaquinas = maquinas?.filter(m => proyecto.maquinas_asignadas?.includes(m.id) && m.categoria !== "inventario") || [];
  const assignedInventario = maquinas?.filter(m => proyecto.maquinas_asignadas?.includes(m.id) && m.categoria === "inventario") || [];

  // Egresos del proyecto obtenidos de la base de datos
  const egresosProyecto = egresosProyectoResp?.data || [];

  // Totales reales del proyecto
  const totalGastosARS = egresosProyectoResp?.meta?.total_suma ?? egresosProyecto.reduce((sum: number, eg: any) => sum + parseFloat(eg.monto?.toString() || "0"), 0);
  const tc = parseFloat(tipoCambio) || 1;
  const gananciaUSD = parseFloat(proyecto.ganancia_estimada || "0");
  const gananciaARS = gananciaUSD * tc;
  const netoARS = gananciaARS - totalGastosARS;
  const netoUSD = netoARS / tc;
  const porcentajeGastado = gananciaARS > 0 ? (totalGastosARS / gananciaARS) * 100 : 0;

  // Estados para control y visualización profesional de gastos
  const [busquedaGasto, setBusquedaGasto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [ordenGasto, setOrdenGasto] = useState<"recientes" | "antiguos" | "mayor" | "menor">("recientes");
  const [paginaGasto, setPaginaGasto] = useState(1);
  const [itemsPorPagina, setItemsPorPagina] = useState(8);
  const [gastoExpandidoId, setGastoExpandidoId] = useState<number | null>(null);

  // Estados para Recursos Asignados (Personal, Maquinaria, Inventario)
  const [busquedaRecurso, setBusquedaRecurso] = useState("");
  const [paginaPersonal, setPaginaPersonal] = useState(1);
  const [paginaMaquinas, setPaginaMaquinas] = useState(1);
  const [paginaInventario, setPaginaInventario] = useState(1);
  const itemsPorPaginaRecursos = 6;

  // Filtrado de empleados asignados
  const empleadosFiltrados = useMemo(() => {
    if (!busquedaRecurso.trim()) return assignedEmpleados;
    const q = busquedaRecurso.toLowerCase().trim();
    return assignedEmpleados.filter(e => 
      `${e.nombre} ${e.apellido}`.toLowerCase().includes(q) ||
      (e.cargo || "").toLowerCase().includes(q) ||
      (e.dni || "").includes(q)
    );
  }, [assignedEmpleados, busquedaRecurso]);

  // Filtrado de máquinas asignadas
  const maquinasFiltradas = useMemo(() => {
    if (!busquedaRecurso.trim()) return assignedMaquinas;
    const q = busquedaRecurso.toLowerCase().trim();
    return assignedMaquinas.filter(m => 
      (m.nombre || "").toLowerCase().includes(q) ||
      (m.marca || "").toLowerCase().includes(q) ||
      (m.modelo || "").toLowerCase().includes(q) ||
      (m.tipo || "").toLowerCase().includes(q)
    );
  }, [assignedMaquinas, busquedaRecurso]);

  // Filtrado de inventario asignado
  const inventarioFiltrado = useMemo(() => {
    if (!busquedaRecurso.trim()) return assignedInventario;
    const q = busquedaRecurso.toLowerCase().trim();
    return assignedInventario.filter(m => 
      (m.nombre || "").toLowerCase().includes(q) ||
      (m.marca || "").toLowerCase().includes(q) ||
      (m.modelo || "").toLowerCase().includes(q)
    );
  }, [assignedInventario, busquedaRecurso]);

  // Paginaciones de recursos
  const totalPaginasPersonal = Math.max(1, Math.ceil(empleadosFiltrados.length / itemsPorPaginaRecursos));
  const empleadosPaginados = useMemo(() => {
    const i = (paginaPersonal - 1) * itemsPorPaginaRecursos;
    return empleadosFiltrados.slice(i, i + itemsPorPaginaRecursos);
  }, [empleadosFiltrados, paginaPersonal]);

  const totalPaginasMaquinas = Math.max(1, Math.ceil(maquinasFiltradas.length / itemsPorPaginaRecursos));
  const maquinasPaginadas = useMemo(() => {
    const i = (paginaMaquinas - 1) * itemsPorPaginaRecursos;
    return maquinasFiltradas.slice(i, i + itemsPorPaginaRecursos);
  }, [maquinasFiltradas, paginaMaquinas]);

  const totalPaginasInventario = Math.max(1, Math.ceil(inventarioFiltrado.length / itemsPorPaginaRecursos));
  const inventarioPaginado = useMemo(() => {
    const i = (paginaInventario - 1) * itemsPorPaginaRecursos;
    return inventarioFiltrado.slice(i, i + itemsPorPaginaRecursos);
  }, [inventarioFiltrado, paginaInventario]);

  const totalRecursos = assignedEmpleados.length + assignedMaquinas.length + assignedInventario.length;

  // Conteo de categorías para filtros
  const categoriasDisponibles = useMemo(() => {
    const map: Record<string, number> = {};
    egresosProyecto.forEach((eg: any) => {
      const cat = eg.categoria || "Otros";
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [egresosProyecto]);

  // Filtrado y ordenamiento
  const egresosFiltrados = useMemo(() => {
    return egresosProyecto
      .filter((eg: any) => {
        if (filtroCategoria !== "todas" && (eg.categoria || "").toLowerCase() !== filtroCategoria.toLowerCase()) {
          return false;
        }
        if (busquedaGasto.trim()) {
          const q = busquedaGasto.toLowerCase().trim();
          const matchConcepto = (eg.concepto || "").toLowerCase().includes(q);
          const matchProveedor = (eg.proveedor || "").toLowerCase().includes(q);
          const matchObs = (eg.observaciones || "").toLowerCase().includes(q);
          const matchMonto = (eg.monto || "").toString().includes(q);
          if (!matchConcepto && !matchProveedor && !matchObs && !matchMonto) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const montoA = parseFloat(a.monto?.toString() || "0");
        const montoB = parseFloat(b.monto?.toString() || "0");
        const fechaA = new Date(a.fecha || 0).getTime();
        const fechaB = new Date(b.fecha || 0).getTime();
        if (ordenGasto === "mayor") return montoB - montoA;
        if (ordenGasto === "menor") return montoA - montoB;
        if (ordenGasto === "antiguos") return fechaA - fechaB;
        return fechaB - fechaA; // recientes por defecto
      });
  }, [egresosProyecto, filtroCategoria, busquedaGasto, ordenGasto]);

  const totalPaginas = Math.max(1, Math.ceil(egresosFiltrados.length / itemsPorPagina));
  const egresosPaginados = useMemo(() => {
    const inicio = (paginaGasto - 1) * itemsPorPagina;
    return egresosFiltrados.slice(inicio, inicio + itemsPorPagina);
  }, [egresosFiltrados, paginaGasto, itemsPorPagina]);

  const gastoMayor = useMemo(() => {
    if (egresosProyecto.length === 0) return 0;
    return Math.max(...egresosProyecto.map((e: any) => parseFloat(e.monto?.toString() || "0")));
  }, [egresosProyecto]);

  const estadoBadge = (estado: string) => {
    const est = (estado || "activo").toLowerCase();
    if (est === "activo") return <Badge className="bg-green-600 hover:bg-green-700">ACTIVO</Badge>;
    if (est === "finalizado") return <Badge variant="secondary">FINALIZADO</Badge>;
    return <Badge variant="outline">{est.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/proyectos">
          <Button variant="outline" size="icon" className="flex-shrink-0"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-primary flex flex-wrap items-center gap-2">
            {proyecto.lugar || "Sin nombre"}
            {estadoBadge(proyecto.estado)}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1 text-xs sm:text-sm">
            <MapPin className="h-3 w-3 flex-shrink-0" /> Proyecto ID: {proyecto.id} • Creado el {formatDateSafe(proyecto.createdAt)}
          </p>
        </div>
      </div>

      {/* Financiero resumen - Solo admin */}
      {!isEmpleado && (
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
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: datos + personal + maquinaria */}
        <div className="space-y-6">
          {/* Datos comerciales - Solo admin */}
          {!isEmpleado && (
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
          )}

          {/* Recursos Asignados: Personal, Maquinaria e Inventario unificados en Tabs ejecutivos */}
          <Card className="border shadow-sm overflow-hidden">
            <Tabs defaultValue="personal" className="w-full">
              <CardHeader className="pb-3 border-b bg-card">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Users className="h-4 w-4" />
                    </div>
                    Recursos del Proyecto
                  </CardTitle>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {totalRecursos} en total
                  </span>
                </div>

                {/* Switcher de Tabs compacto */}
                <TabsList className="grid grid-cols-3 mt-3 w-full h-9 p-1 bg-slate-100/80">
                  <TabsTrigger value="personal" className="text-xs gap-1.5 data-[state=active]:bg-white data-[state=active]:text-primary font-medium">
                    <Users className="h-3.5 w-3.5" />
                    Personal ({assignedEmpleados.length})
                  </TabsTrigger>
                  <TabsTrigger value="maquinas" className="text-xs gap-1.5 data-[state=active]:bg-white data-[state=active]:text-primary font-medium">
                    <Tractor className="h-3.5 w-3.5" />
                    Equipos ({assignedMaquinas.length})
                  </TabsTrigger>
                  <TabsTrigger value="inventario" className="text-xs gap-1.5 data-[state=active]:bg-white data-[state=active]:text-primary font-medium">
                    <Package className="h-3.5 w-3.5" />
                    Inventario ({assignedInventario.length})
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              {/* Buscador interno rápido si hay elementos */}
              {totalRecursos > 4 && (
                <div className="p-2.5 bg-slate-50/50 border-b relative">
                  <Search className="absolute left-4.5 top-4 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar en recursos..."
                    value={busquedaRecurso}
                    onChange={(e) => {
                      setBusquedaRecurso(e.target.value);
                      setPaginaPersonal(1);
                      setPaginaMaquinas(1);
                      setPaginaInventario(1);
                    }}
                    className="pl-8 h-8 text-xs bg-white"
                  />
                  {busquedaRecurso && (
                    <button
                      onClick={() => {
                        setBusquedaRecurso("");
                        setPaginaPersonal(1);
                        setPaginaMaquinas(1);
                        setPaginaInventario(1);
                      }}
                      className="absolute right-4.5 top-4 text-muted-foreground hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              <CardContent className="p-0">
                {/* TAB 1: PERSONAL ASIGNADO */}
                <TabsContent value="personal" className="m-0 focus-visible:outline-none">
                  {assignedEmpleados.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      Sin personal asignado a esta obra.
                    </div>
                  ) : empleadosFiltrados.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      No se encontraron operarios con "{busquedaRecurso}".
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100">
                        {empleadosPaginados.map(e => (
                          <Link key={e.id} href={isEmpleado ? "#" : `/operarios/${e.id}`}>
                            <div className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                                  {getInitials(e.nombre, e.apellido)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate capitalize">
                                    {e.nombre} {e.apellido}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {e.cargo || "Operario"} {e.dni ? `• DNI ${e.dni}` : ""}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all flex-shrink-0" />
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Paginador de Personal si supera 6 */}
                      {totalPaginasPersonal > 1 && (
                        <div className="p-2.5 bg-slate-50 border-t flex items-center justify-between text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            {paginaPersonal} de {totalPaginasPersonal} ({empleadosFiltrados.length} miembros)
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaPersonal === 1}
                              onClick={() => setPaginaPersonal(p => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="h-3 w-3 mr-0.5" /> Ant.
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaPersonal === totalPaginasPersonal}
                              onClick={() => setPaginaPersonal(p => Math.min(totalPaginasPersonal, p + 1))}
                            >
                              Sig. <ChevronRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* TAB 2: MAQUINARIA ASIGNADA */}
                <TabsContent value="maquinas" className="m-0 focus-visible:outline-none">
                  {assignedMaquinas.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      Sin maquinaria asignada a esta obra.
                    </div>
                  ) : maquinasFiltradas.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      No se encontraron equipos con "{busquedaRecurso}".
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100">
                        {maquinasPaginadas.map(m => (
                          <Link key={m.id} href={`/maquinas/${m.id}`}>
                            <div className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 flex-shrink-0">
                                  <Tractor className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                                    {m.nombre}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate mt-0.5">
                                    <span>{m.marca || "Maquinaria"} {m.modelo ? `• ${m.modelo}` : ""}</span>
                                    {m.estado && (
                                      <span className={`text-[9px] px-1 py-0 rounded font-medium ${
                                        m.estado === "activa" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                        m.estado === "mantenimiento" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                        "bg-slate-100 text-slate-600"
                                      }`}>
                                        {m.estado}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all flex-shrink-0" />
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Paginador de Maquinaria si supera 6 */}
                      {totalPaginasMaquinas > 1 && (
                        <div className="p-2.5 bg-slate-50 border-t flex items-center justify-between text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            {paginaMaquinas} de {totalPaginasMaquinas} ({maquinasFiltradas.length} equipos)
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaMaquinas === 1}
                              onClick={() => setPaginaMaquinas(p => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="h-3 w-3 mr-0.5" /> Ant.
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaMaquinas === totalPaginasMaquinas}
                              onClick={() => setPaginaMaquinas(p => Math.min(totalPaginasMaquinas, p + 1))}
                            >
                              Sig. <ChevronRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* TAB 3: INVENTARIO ASIGNADO */}
                <TabsContent value="inventario" className="m-0 focus-visible:outline-none">
                  {assignedInventario.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      Sin inventario asignado a esta obra.
                    </div>
                  ) : inventarioFiltrado.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-xs">
                      No se encontraron herramientas o inventario con "{busquedaRecurso}".
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100">
                        {inventarioPaginado.map(m => (
                          <Link key={m.id} href={`/maquinas/${m.id}`}>
                            <div className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-700 flex-shrink-0">
                                  <Package className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                                    {m.nombre}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {m.marca || m.modelo ? `${m.marca || ""} ${m.modelo || ""}`.trim() : "Herramienta / Inventario menor"}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all flex-shrink-0" />
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Paginador de Inventario si supera 6 */}
                      {totalPaginasInventario > 1 && (
                        <div className="p-2.5 bg-slate-50 border-t flex items-center justify-between text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            {paginaInventario} de {totalPaginasInventario} ({inventarioFiltrado.length} items)
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaInventario === 1}
                              onClick={() => setPaginaInventario(p => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="h-3 w-3 mr-0.5" /> Ant.
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={paginaInventario === totalPaginasInventario}
                              onClick={() => setPaginaInventario(p => Math.min(totalPaginasInventario, p + 1))}
                            >
                              Sig. <ChevronRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        {/* Columna derecha: gastos del proyecto - Solo admin */}
        {!isEmpleado && (
          <div className="lg:col-span-2">
            <Card className="border shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b bg-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                        <Receipt className="h-4 w-4" />
                      </div>
                      Gastos de este Proyecto
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      {egresosProyecto.length === 0
                        ? "No hay gastos registrados para este proyecto todavía."
                        : `${egresosProyecto.length} gasto(s) imputado(s) • Total: $${totalGastosARS.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS`}
                    </CardDescription>
                  </div>

                  {egresosProyecto.length > 0 && (
                    <Link href={`/egresos?proyecto=${encodeURIComponent(proyecto.lugar || "")}`}>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full sm:w-auto font-medium">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver en Módulo Egresos
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>

              {egresosProyecto.length === 0 ? (
                <CardContent className="p-8 text-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <Receipt className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Sin gastos imputados</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Cuando registres un egreso asignado a <strong>{proyecto.lugar}</strong>, aparecerá acá automáticamente.
                  </p>
                </CardContent>
              ) : (
                <CardContent className="p-0">
                  {/* Cinta de Micro-KPIs Financieros */}
                  <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/60 border-b border-slate-100 text-center py-2.5">
                    <div className="px-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">Total Invertido</span>
                      <span className="font-bold text-sm sm:text-base text-red-600 block mt-0.5 tabular-nums">
                        ${totalGastosARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        ≈ USD ${(totalGastosARS / tc).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                    </div>

                    <div className="px-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">Registros</span>
                      <span className="font-bold text-sm sm:text-base text-slate-800 block mt-0.5">
                        {egresosProyecto.length} <span className="text-xs font-normal text-muted-foreground">gastos</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {Object.keys(categoriasDisponibles).length} categorías
                      </span>
                    </div>

                    <div className="px-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">Gasto Mayor</span>
                      <span className="font-bold text-sm sm:text-base text-slate-800 block mt-0.5 tabular-nums">
                        ${gastoMayor.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        Prom: ${(totalGastosARS / (egresosProyecto.length || 1)).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Filtros, Búsqueda y Ordenamiento */}
                  <div className="p-3 bg-white border-b flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                    {/* Buscador */}
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar concepto o proveedor..."
                        value={busquedaGasto}
                        onChange={(e) => {
                          setBusquedaGasto(e.target.value);
                          setPaginaGasto(1);
                        }}
                        className="pl-8 h-9 text-xs sm:text-sm bg-slate-50/50"
                      />
                      {busquedaGasto && (
                        <button
                          onClick={() => {
                            setBusquedaGasto("");
                            setPaginaGasto(1);
                          }}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-slate-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Filtro de Categoría y Orden */}
                    <div className="flex items-center gap-2">
                      <Select value={filtroCategoria} onValueChange={(val) => {
                        setFiltroCategoria(val);
                        setPaginaGasto(1);
                      }}>
                        <SelectTrigger className="h-9 text-xs sm:text-sm min-w-[130px] bg-slate-50/50">
                          <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas ({egresosProyecto.length})</SelectItem>
                          {Object.entries(categoriasDisponibles).map(([cat, count]) => (
                            <SelectItem key={cat} value={cat}>
                              {cat} ({count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={ordenGasto} onValueChange={(val: any) => {
                        setOrdenGasto(val);
                        setPaginaGasto(1);
                      }}>
                        <SelectTrigger className="h-9 text-xs sm:text-sm min-w-[125px] bg-slate-50/50">
                          <SelectValue placeholder="Ordenar por" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recientes">Más recientes</SelectItem>
                          <SelectItem value="antiguos">Más antiguos</SelectItem>
                          <SelectItem value="mayor">Mayor monto</SelectItem>
                          <SelectItem value="menor">Menor monto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {egresosFiltrados.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No se encontraron gastos con los filtros aplicados.</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBusquedaGasto("");
                          setFiltroCategoria("todas");
                          setPaginaGasto(1);
                        }}
                        className="mt-2 text-xs text-primary"
                      >
                        Limpiar filtros
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Vista Desktop (Tabla Optimizada) */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                              <TableHead className="w-[110px]">Fecha</TableHead>
                              <TableHead className="w-[140px]">Categoría</TableHead>
                              <TableHead>Concepto / Detalle</TableHead>
                              <TableHead>Proveedor</TableHead>
                              <TableHead className="text-right">Monto ARS</TableHead>
                              <TableHead className="text-right">≈ USD</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {egresosPaginados.map((eg: any) => {
                              const visual = getCategoriaVisual(eg.categoria);
                              const IconComponent = visual.icon;
                              const monto = parseFloat(eg.monto?.toString() || "0");
                              return (
                                <TableRow key={eg.id} className="hover:bg-slate-50/80 transition-colors">
                                  <TableCell className="text-xs font-medium text-slate-600">
                                    {formatDateSafe(eg.fecha)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`text-xs gap-1 py-0.5 px-2 font-medium ${visual.badge}`}>
                                      <IconComponent className="h-3 w-3" />
                                      {eg.categoria}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm font-medium text-slate-900 max-w-[240px]">
                                    <div className="truncate" title={eg.concepto}>
                                      {eg.concepto}
                                    </div>
                                    {eg.observaciones && (
                                      <p className="text-[11px] text-muted-foreground truncate" title={eg.observaciones}>
                                        {eg.observaciones}
                                      </p>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-600 truncate max-w-[130px]">
                                    {eg.proveedor || "-"}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-slate-900 text-sm tabular-nums">
                                    ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                    USD ${(monto / tc).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Vista Mobile (Fintech Compact Rows - Adiós fila interminable) */}
                      <div className="md:hidden divide-y divide-slate-100">
                        {egresosPaginados.map((eg: any) => {
                          const visual = getCategoriaVisual(eg.categoria);
                          const IconComponent = visual.icon;
                          const monto = parseFloat(eg.monto?.toString() || "0");
                          const isExpanded = gastoExpandidoId === eg.id;

                          return (
                            <div key={eg.id} className="transition-colors hover:bg-slate-50/60">
                              <div
                                onClick={() => setGastoExpandidoId(isExpanded ? null : eg.id)}
                                className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none active:bg-slate-100/70"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {/* Icono de Categoría */}
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${visual.bg}`}>
                                    <IconComponent className="h-4 w-4" />
                                  </div>

                                  {/* Concepto y Metadata */}
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm text-slate-900 truncate leading-snug">
                                      {eg.concepto || "Sin concepto"}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                      <span className="font-medium text-slate-600">{formatDateSafe(eg.fecha)}</span>
                                      <span>•</span>
                                      <span className="text-[11px] font-medium text-slate-600">{eg.categoria}</span>
                                      {eg.proveedor && (
                                        <>
                                          <span>•</span>
                                          <span className="truncate max-w-[110px] text-slate-500">{eg.proveedor}</span>
                                        </>
                                      )}
                                      {eg.comprobante && (
                                        <span className="text-[9px] px-1 py-0 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 font-medium">
                                          Doc
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Monto */}
                                <div className="text-right flex-shrink-0">
                                  <span className="font-semibold text-sm text-slate-900 tabular-nums block">
                                    ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums block">
                                    USD ${(monto / tc).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>

                              {/* Acordeón de detalles al tocar la fila */}
                              {isExpanded && (
                                <div className="px-4 pb-3 pt-1.5 bg-slate-50 border-t border-dashed border-slate-200 text-xs space-y-1.5 animate-in fade-in-50 duration-150">
                                  {eg.concepto && (
                                    <div className="text-slate-800">
                                      <span className="font-semibold text-slate-600">Detalle completo: </span>
                                      {eg.concepto}
                                    </div>
                                  )}
                                  {eg.observaciones && (
                                    <div className="text-slate-600">
                                      <span className="font-semibold text-slate-600">Observaciones: </span>
                                      {eg.observaciones}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
                                    {eg.proveedor && <span><strong>Proveedor:</strong> {eg.proveedor}</span>}
                                    {eg.metodo_pago && <span><strong>Pago:</strong> {eg.metodo_pago}</span>}
                                    <span><strong>Facturado:</strong> {eg.facturado ? "Sí (Con factura)" : "No"}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer de Paginación y Totales */}
                      <div className="p-3 bg-slate-50/90 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground text-center sm:text-left">
                          Mostrando <strong>{egresosFiltrados.length === 0 ? 0 : (paginaGasto - 1) * itemsPorPagina + 1}</strong> a{" "}
                          <strong>{Math.min(paginaGasto * itemsPorPagina, egresosFiltrados.length)}</strong> de{" "}
                          <strong>{egresosFiltrados.length}</strong> gastos filtrados
                        </div>

                        {totalPaginas > 1 && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              disabled={paginaGasto === 1}
                              onClick={() => setPaginaGasto((p) => Math.max(1, p - 1))}
                            >
                              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                            </Button>

                            <span className="text-xs font-medium px-2 text-slate-700">
                              {paginaGasto} / {totalPaginas}
                            </span>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              disabled={paginaGasto === totalPaginas}
                              onClick={() => setPaginaGasto((p) => Math.min(totalPaginas, p + 1))}
                            >
                              Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              )}
            </Card>

          {/* Tarjeta de Pagos Recibidos */}
          <Card className="mt-6 border-2 border-green-100">
            <CardHeader className="bg-green-50/50 pb-4">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <DollarSign className="h-5 w-5 text-green-600" />
                Historial de Cobros y Pagos Recibidos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                let pagos: any[] = [];
                try {
                  if (Array.isArray(proyecto.pagos_historial)) {
                    pagos = proyecto.pagos_historial;
                  } else if (typeof proyecto.pagos_historial === 'string') {
                    pagos = proyecto.pagos_historial ? JSON.parse(proyecto.pagos_historial) : [];
                  }
                } catch (e) {
                  console.error("Error parsing pagos:", e);
                }

                if (pagos.length === 0) {
                  return (
                    <div className="p-6 text-center text-muted-foreground">
                      <p className="text-sm">Aún no se han registrado cobros para este proyecto.</p>
                    </div>
                  );
                }

                return (
                  <div className="rounded-md overflow-hidden border-t">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead>Fecha</TableHead>
                            <TableHead>Forma de Pago</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right">Monto (USD)</TableHead>
                            <TableHead className="text-center">Comprobante</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagos.map((pago: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="text-sm">
                                {formatDateSafe(pago.fecha)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize bg-slate-50">
                                  {pago.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate" title={pago.descripcion}>
                                {pago.descripcion || "-"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-700 text-sm">
                                {pago.monto && pago.monto !== "0" && pago.monto !== 0 ? `USD $${parseFloat(pago.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                              </TableCell>
                              <TableCell className="text-center">
                                {pago.comprobante_url ? (
                                  <a href={pago.comprobante_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center justify-center gap-1">
                                    <ExternalLink className="h-3 w-3" /> Ver Adjunto
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {pago.id ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeletePago(pago.id)}
                                    title="Eliminar este cobro"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground" title="Este pago antiguo no se puede eliminar">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </div>
  );
}
