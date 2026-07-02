import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Truck,
  Clock,
  Droplets,
  Wrench,
  FileText,
  Bell,
  Calendar,
  BarChart3,
  AlertTriangle,
  Activity,
  LogOut
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { removeAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const logoutMut = useLogout();

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSuccess: () => {
        removeAuthToken();
        setLocation("/login");
      }
    });
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Panel", href: "/panel" },
    { icon: Users, label: "Operarios", href: "/operarios" },
    { icon: Truck, label: "Maquinaria", href: "/maquinas" },
    { icon: Clock, label: "Jornadas", href: "/jornadas" },
    { icon: Droplets, label: "Combustible", href: "/combustible" },
    { icon: Wrench, label: "Mantenimiento", href: "/mantenimientos" },
    { icon: FileText, label: "Documentación", href: "/documentos" },
    { icon: Bell, label: "Alertas", href: "/alertas" },
    { icon: Calendar, label: "Calendario", href: "/calendario" },
    { icon: BarChart3, label: "Reportes", href: "/reportes" },
    { icon: AlertTriangle, label: "Incidentes", href: "/incidentes" },
    { icon: Activity, label: "Actividad", href: "/actividad" },
  ];

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0 border-r border-sidebar-border">
        <div className="h-16 flex items-center px-6 font-bold text-xl border-b border-sidebar-border">
          <img src={logoUrl} alt="PUFFIN SRL" className="h-8 w-auto mr-3 object-contain" />
          PUFFIN
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    location.startsWith(item.href)
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium">{user?.nombre} {user?.apellido}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.rol}</p>
          </div>
          <Button variant="outline" className="w-full justify-start text-black" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
