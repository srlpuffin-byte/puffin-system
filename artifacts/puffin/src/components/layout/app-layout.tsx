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
  Moon,
  Sun,
  Search,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { removeAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";
import { BusquedaGlobalDialog } from "@/components/ui/busqueda-global-dialog";
import { useEffect } from "react";

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
      { icon: Bell, label: "Alertas e Incidentes", href: "/alertas" },
      { icon: Calendar, label: "Calendario", href: "/calendario" },
    ],
  },
  {
    label: "Análisis y Reportes",
    defaultOpen: false,
    items: [
      { icon: TrendingUp, label: "Productividad", href: "/productividad" },
      { icon: BarChart3, label: "Reportes Financieros", href: "/reportes" },
    ],
  },
  {
    label: "Integraciones",
    defaultOpen: false,
    items: [
      { icon: Satellite, label: "Xpert Satcom", href: "/xpert" },
      { icon: Bot, label: "Puffin AI", href: "/ia" },
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
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSuccess: () => {
        removeAuthToken();
        setLocation("/login");
      },
    });
  };

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  
  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  };

  const Sidebar = () => (
    <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0 border-r border-sidebar-border h-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center font-bold text-lg">
          <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mr-2 object-contain" />
          <span className="tracking-wide">PUFFIN SRL</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 text-muted-foreground" onClick={() => setSearchOpen(true)} title="Buscar (Ctrl+K)">
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.filter(group => {
          if (user?.rol === "empleado") {
            // Empleados solo ven Panel y Operación básica
            if (group.label === "Principal") return true;
            if (group.label === "Operación") return true;
            return false;
          }
          return true;
        }).map((group) => {
          let filteredItems = group.items;
          if (user?.rol === "empleado" && group.label === "Operación") {
            // Empleados no ven Operarios ni Maquinaria en el menú
            filteredItems = group.items.filter(item => 
              item.href !== "/operarios" && item.href !== "/maquinas"
            );
          }
          return (
            <NavGroupComponent
              key={group.label}
              group={{ ...group, items: filteredItems }}
              location={location}
            />
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border flex-shrink-0">
        <div className="mb-3 px-2">
          <p className="text-sm font-semibold">{user?.nombre} {user?.apellido}</p>
          <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.rol}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent mb-1"
          onClick={toggleTheme}
        >
          {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {isDark ? "Modo Claro" : "Modo Oscuro"}
        </Button>
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
        <div className="lg:hidden h-14 bg-white border-b flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)} className="mr-2">
              <Menu className="h-5 w-5" />
            </Button>
            <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mx-1 object-contain" />
            <span className="font-bold text-primary ml-1">PUFFIN</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
      </main>

      <BusquedaGlobalDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
