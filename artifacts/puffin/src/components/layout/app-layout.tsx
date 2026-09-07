import React, { useState, useEffect, useRef } from "react";
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
  MessageSquare,
  Map,
  Compass,
  UserCog,
  BellRing,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Moon,
  Sun,
  Search,
  HelpCircle,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { removeAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";
import { BusquedaGlobalDialog } from "@/components/ui/busqueda-global-dialog";
import { TutorialDialog } from "@/components/ui/tutorial-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePWAUpdate } from "@/hooks/use-pwa-update";
import { NotificationBell } from "@/components/ui/notification-bell";
import { PushNotificationBanner } from "@/components/ui/push-notification-banner";
import { JornadaAlertaBanner } from "@/components/ui/jornada-alerta-banner";
import { useGlobalNotifications } from "@/hooks/use-global-notifications";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: boolean;
  badgeCount?: number;
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
      { icon: Map, label: "Proyectos", href: "/proyectos" },
      { icon: Compass, label: "Trazado y Calles A-B", href: "/americangis" },
      { icon: MapPin, label: "Mapa de Flota GPS", href: "/gps" },
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
      { icon: Bell, label: "Notificaciones", href: "/alertas" },
      { icon: AlertTriangle, label: "Incidentes", href: "/incidentes" },
      { icon: Calendar, label: "Calendario", href: "/calendario" },
    ],
  },
  {
    label: "Análisis y Reportes",
    defaultOpen: false,
    items: [
      { icon: FileText, label: "Egresos", href: "/egresos" },
      { icon: TrendingUp, label: "Productividad", href: "/productividad" },
      { icon: BarChart3, label: "Reportes Financieros", href: "/reportes" },
      { icon: Calendar, label: "Cierre Mensual", href: "/cierres" },
    ],
  },
  {
    label: "Integraciones",
    defaultOpen: false,
    items: [
      { icon: Satellite, label: "Xpert Satcom", href: "/xpert" },
      { icon: Bot, label: "Puffin AI", href: "/ia" },
      { icon: MessageSquare, label: "WhatsApp Chats", href: "/whatsapp" },
    ],
  },
  {
    label: "Administración",
    defaultOpen: false,
    items: [
      { icon: UserCog, label: "Usuarios", href: "/usuarios" },
      { icon: BellRing, label: "Notificaciones", href: "/admin-notificaciones" },
    ],
  },
];

function NavGroupComponent({ group, location, onNavigate }: { group: NavGroup; location: string, onNavigate?: () => void }) {
  const isActive = group.items.some((i) => location.startsWith(i.href));
  const [open, setOpen] = useState(group.defaultOpen ?? isActive);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground/90 transition-colors"
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
                  className={`flex items-center justify-between px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/90"
                  }`}
                  onClick={() => onNavigate?.()}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {item.label}
                  </div>
                  {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm">
                      {item.badgeCount}
                    </span>
                  ) : item.badge ? (
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" title="Falta información"></div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useGetEmpleados, useGetMaquinas } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const logoutMut = useLogout();
  const { unreadWhatsAppCount, recentNotifications, totalBadges } = useGlobalNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { data: empleados } = useGetEmpleados();
  const hasIncompleteOperarios = Array.isArray(empleados) ? empleados.some(e => 
    !e.dni || e.dni === "COMPLETAR" || !e.telefono || !e.fecha_ingreso || 
    !e.contacto_familiar_nombre || !e.contacto_familiar_telefono || !(e as any).contacto_familiar_relacion
  ) : false;

  const { data: maquinas } = useGetMaquinas();
  const hasIncompleteMaquinas = Array.isArray(maquinas) ? maquinas.some(m => 
    !m.marca || !m.modelo || !m.anio || (!m.patente && !m.dominio) || 
    !m.motor || !m.chasis || !m.filtro_tipo || !m.filtro_codigo
  ) : false;

  // Detectar actualizaciones de Vercel en todos los celulares (iOS + Android)
  usePWAUpdate();

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

  const queryClient = useQueryClient();

  const handleLogout = () => {
    logoutMut.mutate(undefined, {
      onSuccess: () => {
        removeAuthToken();
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      return true;
    } else if (saved === "light") {
      document.documentElement.classList.remove("dark");
      return false;
    }
    // Default: seguir preferencia del sistema operativo
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) document.documentElement.classList.add("dark");
    return prefersDark;
  });
  
  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  // Bloquear scroll de fondo cuando el menú lateral móvil está abierto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [mobileOpen]);

  // Gestos táctiles: deslizar desde el borde izquierdo para abrir
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;

    const handleWindowTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleWindowTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Deslizar desde el borde izquierdo hacia la derecha (borde <= 35px, avance >= 50px)
        if (touchStartX <= 35 && deltaX > 50 && Math.abs(deltaY) < 60 && !mobileOpen) {
          setMobileOpen(true);
        }
      }
    };

    window.addEventListener("touchstart", handleWindowTouchStart, { passive: true });
    window.addEventListener("touchend", handleWindowTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleWindowTouchStart);
      window.removeEventListener("touchend", handleWindowTouchEnd);
    };
  }, [mobileOpen]);

  // Gestos táctiles: deslizar hacia la izquierda en el menú para cerrarlo
  const sidebarTouchRef = useRef<{ startX: number; startY: number }>({ startX: 0, startY: 0 });

  const handleSidebarTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      sidebarTouchRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
      };
    }
  };

  const handleSidebarTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - sidebarTouchRef.current.startX;
      const deltaY = e.changedTouches[0].clientY - sidebarTouchRef.current.startY;
      // Si desliza hacia la izquierda al menos 40px
      if (deltaX < -40 && Math.abs(deltaY) < 80) {
        setMobileOpen(false);
      }
    }
  };

  const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
    <aside className="w-64 sm:w-60 bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0 border-r border-sidebar-border h-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center font-bold text-lg min-w-0">
          <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mr-2 object-contain shrink-0" />
          <span className="tracking-wide truncate">PUFFIN SRL</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSearchOpen(true)} title="Buscar (Ctrl+K)">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground lg:hidden" onClick={() => onNavigate?.()} title="Cerrar menú">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <nav
        className="flex-1 overflow-y-auto py-3 px-2"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehaviorY: 'contain' }}
      >
        {NAV_GROUPS.filter(group => {
          if (user?.rol?.toLowerCase() === "empleado") {
            // Empleados solo ven Principal, Operación y Control
            if (group.label === "Principal") return true;
            if (group.label === "Operación") return true;
            if (group.label === "Mantenimiento") return true;
            if (group.label === "Control") return true;
            return false;
          }
          return true;
        }).map((group) => {
          let filteredItems = group.items;
          if (user?.rol?.toLowerCase() === "empleado") {
            if (group.label === "Operación") {
              filteredItems = group.items.filter(item => 
                item.href !== "/operarios" && item.href !== "/maquinas" && item.href !== "/gps"
              );
            } else if (group.label === "Mantenimiento") {
              filteredItems = group.items.filter(item =>
                item.href === "/mantenimientos"
              );
            } else if (group.label === "Control") {
              filteredItems = group.items.filter(item => 
                item.href === "/incidentes"
              );
            } else if (group.label === "Principal") {
              filteredItems = [
                ...group.items,
                { icon: Map, label: "Mi Proyecto", href: "/proyectos" },
                { icon: UserCog, label: "Mis Datos", href: "/mis-datos" }
              ];
            }
          }
          
          return (
            <NavGroupComponent
              key={group.label}
              group={{ 
                ...group, 
                items: filteredItems.map(item => {
                  if (item.href === "/operarios") return { ...item, badge: hasIncompleteOperarios };
                  if (item.href === "/maquinas") return { ...item, badge: hasIncompleteMaquinas };
                  
                  // For the employee themselves
                  if (item.href === "/mis-datos") {
                    const isFaltante = empleados?.find(e => e.nombre === user?.nombre && e.apellido === user?.apellido);
                    let badge = false;
                    if (isFaltante) {
                      badge = !isFaltante.dni || isFaltante.dni === "COMPLETAR" || !isFaltante.telefono || !isFaltante.contacto_familiar_telefono;
                    }
                    return { ...item, badge };
                  }

                  if (item.href === "/whatsapp") {
                    return { ...item, badgeCount: unreadWhatsAppCount };
                  }

                  if (item.href === "/alertas") {
                    return { ...item, badgeCount: recentNotifications.length };
                  }

                  return item;
                }) 
              }}
              location={location}
              onNavigate={onNavigate}
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
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent mb-1"
          onClick={() => setTutorialOpen(true)}
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          Cómo usar el sistema
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
    <div
      className="flex bg-background w-full max-w-[100vw] overflow-hidden"
      style={{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', maxWidth: '100vw', width: '100%' }}
    >
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Drawer móvil animado con gestos táctiles */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
          mobileOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-64 max-w-[85vw] transform transition-transform duration-300 ease-out shadow-2xl ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onTouchStart={handleSidebarTouchStart}
          onTouchEnd={handleSidebarTouchEnd}
        >
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      <main
        className="flex-1 bg-background flex flex-col min-w-0 w-full max-w-full overflow-x-hidden"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehaviorY: 'contain',
          maxWidth: '100vw',
          width: '100%',
        }}
      >
        <div className="lg:hidden h-14 bg-card border-b border-border flex items-center justify-between px-3 sm:px-4 flex-shrink-0 w-full max-w-full">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)} className="relative mr-1 sm:mr-2">
              <Menu className="h-5 w-5" />
              {totalBadges > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-card animate-pulse" />
              )}
            </Button>
            <img src={logoUrl} alt="PUFFIN SRL" className="h-7 w-auto mx-1 object-contain" />
            <span className="font-bold text-primary ml-1">PUFFIN</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSearchOpen(true)}>
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <PushNotificationBanner />
        <JornadaAlertaBanner />
        <div className="flex-1 p-2 md:p-4 lg:p-8 w-full max-w-full min-w-0">
          {children}
        </div>
      </main>

      <BusquedaGlobalDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <TutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  );
}
