import React, { useState } from "react";
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
  LogOut,
  MapPin,
  TrendingUp,
  Bot,
  Satellite,
  Map,
  UserCog,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { removeAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principal",
    defaultOpen: true,
    items: [
      { icon: LayoutDashboard, label: "Panel", href: "/panel" },
    ],
  },
  {
    label: "Operación",
    defaultOpen: true,
    items: [
      { icon: Users, label: "Operarios", href: "/operarios" },
      { icon: Truck, label: "Maquinaria", href: "/maquinas" },
      { icon: Clock, label: "Jornadas", href: "/jornadas" },
      { icon: Droplets, label: "Combustible", href: "/combustible" },
      { icon: MapPin, label: "GPS y Rastreo", href: "/gps" },
    ],
  },
  {
    label: "Mantenimiento",
    defaultOpen: true,
    items: [
      { icon: Wrench, label: "Mantenimiento", href: "/mantenimientos" },
      { icon: FileText, label: "Documentación", href: "/documentos" },
    ],
  },
  {
    label: "Control",
    defaultOpen: true,
    items: [
      { icon: Bell, label: "Alertas", href: "/alertas" },
      { icon: AlertTriangle, label: "Incidentes", href: "/incidentes" },
      { icon: Calendar, label: "Calendario", href: "/calendario" },
    ],
  },
  {
    label: "Análisis",
    defaultOpen: false,
    items: [
      { icon: TrendingUp, label: "Productividad", href: "/productividad" },
      { icon: BarChart3, label: "Reportes", href: "/reportes" },
      { icon: Activity, label: "Actividad", href: "/actividad" },
    ],
  },
  {
    label: "Integraciones",
    defaultOpen: false,
    items: [
      { icon: Map, label: "AmericanGIS", href: "/americangis" },
      { icon: Satellite, label: "Xpert Satcom", href: "/xpert" },
      { icon: Bot, label: "Inteligencia Artificial", href: "/ia" },
    ],
  },
  {
    label: "Administración",
    defaultOpen: false,
    items: [
      { icon: UserCog, label: "Usuarios", href: "/usuarios" },
    ],
  },
];

function NavGroupComponent({ group, location }: { group: NavGroup; location: string }) {
  const isActive = group.items.some((i) => location.startsWith(i.href));
  const [open, setOpen] = useState(group.defaultOpen ?? isActive);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
      >
        {group.label}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {group.items.map((item) => {
            const active = location.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                  }`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const logoutMut = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSuccess: () => {
        removeAuthToken();
        setLocation("/login");
      },
    });
  };

  const Sidebar = () => (
    <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0 border-r border-sidebar-border h-full">
      <div className="h-14 flex items-center px-4 font-bold text-lg border-b border-sidebar-border flex-shrink-0">
        <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mr-2 object-contain" />
        <span className="tracking-wide">PUFFIN SRL</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => (
          <NavGroupComponent key={group.label} group={group} location={location} />
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border flex-shrink-0">
        <div className="mb-3 px-2">
          <p className="text-sm font-semibold">{user?.nombre} {user?.apellido}</p>
          <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.rol}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-60">
            <Sidebar />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto bg-slate-50 flex flex-col">
        <div className="lg:hidden h-14 bg-white border-b flex items-center px-4 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mx-3 object-contain" />
          <span className="font-bold text-primary">PUFFIN SRL</span>
        </div>
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
