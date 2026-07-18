import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { Login } from "@/pages/login";
import { Panel } from "@/pages/panel";
import { Maquinas } from "@/pages/maquinas";
import { MaquinaFicha } from "@/pages/maquina-ficha";
import { Operarios } from "@/pages/operarios";
import { OperarioFicha } from "@/pages/operario-ficha";
import { Jornadas } from "@/pages/jornadas";
import { Combustible } from "@/pages/combustible";
import { Mantenimientos } from "@/pages/mantenimientos";
import { Documentos } from "@/pages/documentos";
import { Alertas } from "@/pages/alertas";
import { Calendario } from "@/pages/calendario";
import { Reportes } from "@/pages/reportes";
import { Incidentes } from "@/pages/incidentes";
import { Actividad } from "@/pages/actividad";
import { Usuarios } from "@/pages/usuarios";
import { Gps } from "@/pages/gps";
import { Productividad } from "@/pages/productividad";
import { Ia } from "@/pages/ia";
import { Americangis } from "@/pages/americangis";
import { Egresos } from "@/pages/egresos";
import { Xpert } from "@/pages/xpert";
import { Cierres } from "@/pages/cierres";
import { MisDatos } from "@/pages/mis-datos";
import { Proyectos } from "@/pages/proyectos";
import { ProyectoFicha } from "@/pages/proyecto-ficha";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { getAuthToken } from "@/hooks/use-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

import { useGetMe } from "@workspace/api-client-react";
import { useGetEmpleadosMe } from "@/hooks/use-get-empleados-me";

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const [location, setLocation] = useLocation();
  const token = getAuthToken();
  const { data: user, isLoading: userLoading } = useGetMe();
  
  const isEmpleado = user?.rol?.toLowerCase() === "empleado";
  const { data: operario, isLoading: operarioLoading } = useGetEmpleadosMe({
    enabled: isEmpleado && !userLoading
  });

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }

    // Wait for all data to load before deciding to redirect
    if (isEmpleado && !operarioLoading && operario) {
      const isFaltante = !operario.dni || operario.dni === "COMPLETAR" || !operario.telefono || !operario.contacto_familiar_telefono;
      if (isFaltante && location !== "/mis-datos") {
        setLocation("/mis-datos");
      }
    }
  }, [token, location, setLocation, isEmpleado, operario, operarioLoading]);

  if (!token) return null;

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === "/") {
      if (getAuthToken()) {
        setLocation("/panel");
      } else {
        setLocation("/login");
      }
    }
  }, [location, setLocation]);

  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/panel"><ProtectedRoute component={Panel} /></Route>
        <Route path="/mis-datos"><ProtectedRoute component={MisDatos} /></Route>
        <Route path="/maquinas"><ProtectedRoute component={Maquinas} /></Route>
        <Route path="/maquinas/:id"><ProtectedRoute component={MaquinaFicha} /></Route>
        <Route path="/operarios"><ProtectedRoute component={Operarios} /></Route>
        <Route path="/operarios/:id"><ProtectedRoute component={OperarioFicha} /></Route>
        <Route path="/jornadas"><ProtectedRoute component={Jornadas} /></Route>
        <Route path="/combustible"><ProtectedRoute component={Combustible} /></Route>
        <Route path="/mantenimientos"><ProtectedRoute component={Mantenimientos} /></Route>
        <Route path="/documentos"><ProtectedRoute component={Documentos} /></Route>
        <Route path="/alertas"><ProtectedRoute component={Alertas} /></Route>
        <Route path="/calendario"><ProtectedRoute component={Calendario} /></Route>
        <Route path="/egresos"><ProtectedRoute component={Egresos} /></Route>
        <Route path="/cierres"><ProtectedRoute component={Cierres} /></Route>
        <Route path="/reportes"><ProtectedRoute component={Reportes} /></Route>
        <Route path="/incidentes"><ProtectedRoute component={Incidentes} /></Route>
        <Route path="/actividad"><ProtectedRoute component={Actividad} /></Route>
        <Route path="/usuarios"><ProtectedRoute component={Usuarios} /></Route>
        <Route path="/gps"><ProtectedRoute component={Gps} /></Route>
        <Route path="/productividad"><ProtectedRoute component={Productividad} /></Route>
        <Route path="/ia"><ProtectedRoute component={Ia} /></Route>
        <Route path="/americangis"><ProtectedRoute component={Americangis} /></Route>
        <Route path="/xpert"><ProtectedRoute component={Xpert} /></Route>
        <Route path="/proyectos"><ProtectedRoute component={Proyectos} /></Route>
        <Route path="/proyectos/:id"><ProtectedRoute component={ProyectoFicha} /></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { OfflineBadge } from "@/components/ui/offline-badge";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <SonnerToaster />
        <OfflineBadge />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
