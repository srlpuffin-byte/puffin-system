import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  MessageSquare,
  Send,
  Search,
  Bot,
  User,
  Pause,
  Play,
  RefreshCw,
  Plus,
  ExternalLink,
  Shield,
  Sparkles,
  CheckCheck,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

interface ChatItem {
  phone: string;
  nombre: string;
  cargo?: string;
  empleado_id?: number | null;
  foto_perfil?: string | null;
  ultimoMensaje: string;
  ultimaFecha: string;
  totalMensajes: number;
  botPausado: boolean;
  esAdmin: boolean;
}

interface ChatDetail {
  phone: string;
  nombre: string;
  cargo?: string;
  empleado_id?: number | null;
  foto_perfil?: string | null;
  messages: any[];
  botPausado: boolean;
  esAdmin: boolean;
  updated_at: string;
}

interface ContactoDisponible {
  id: number;
  nombre: string;
  cargo: string;
  telefono: string;
}

export function WhatsAppChats() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Redirigir a empleados no autorizados
  useEffect(() => {
    if (user && user.rol?.toLowerCase() === "empleado") {
      setLocation("/");
    }
  }, [user, setLocation]);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "operarios" | "admins" | "pausados">("todos");
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [modalNuevoChat, setModalNuevoChat] = useState(false);
  const [nuevoChatTelefono, setNuevoChatTelefono] = useState("");
  const [nuevoChatMensaje, setNuevoChatMensaje] = useState("");

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  // 1. Query: Lista de chats
  const { data: chats = [], isLoading: loadingChats, refetch: refetchChats } = useQuery<ChatItem[]>({
    queryKey: ["whatsapp-chats"],
    queryFn: () => apiFetch<ChatItem[]>("/whatsapp-chats"),
    refetchInterval: 5000,
  });

  // 2. Query: Detalle del chat seleccionado
  const { data: chatActivo, isLoading: loadingDetalle, refetch: refetchDetalle } = useQuery<ChatDetail>({
    queryKey: ["whatsapp-chat-detail", selectedPhone],
    queryFn: () => apiFetch<ChatDetail>(`/whatsapp-chats/${encodeURIComponent(selectedPhone!)}`),
    enabled: !!selectedPhone,
    refetchInterval: 3000,
  });

  // 3. Query: Contactos para nuevo chat
  const { data: contactos = [] } = useQuery<ContactoDisponible[]>({
    queryKey: ["whatsapp-contactos-disponibles"],
    queryFn: () => apiFetch<ContactoDisponible[]>("/whatsapp-chats/contactos-disponibles"),
  });

  // Auto-scroll al fondo al cambiar de chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    prevMsgCountRef.current = chatActivo?.messages?.length || 0;
  }, [selectedPhone]);

  // Scroll suave al fondo al llegar mensajes nuevos (solo si está cerca del fondo para no interrumpir lectura arriba)
  useEffect(() => {
    const count = chatActivo?.messages?.length || 0;
    if (count > prevMsgCountRef.current && chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 250;
      if (isNearBottom || prevMsgCountRef.current === 0) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }
    prevMsgCountRef.current = count;
  }, [chatActivo?.messages?.length]);

  // Mutación: Enviar mensaje manual
  const sendMutation = useMutation({
    mutationFn: ({ phone, text }: { phone: string; text: string }) =>
      apiFetch<{ success: boolean }>(`/whatsapp-chats/${encodeURIComponent(phone)}/send`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      setMensajeTexto("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chat-detail", selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chats"] });
      toast.success("Mensaje enviado por WhatsApp");
      // Scroll al fondo tras enviar mensaje propio
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
    },
    onError: (err: any) => {
      toast.error(`Error al enviar mensaje: ${err?.message || "Revisar conexión con WhatsApp API"}`);
    },
  });

  // Mutación: Alternar pausa del bot
  const toggleBotMutation = useMutation({
    mutationFn: (phone: string) =>
      apiFetch<{ success: boolean; botPausado: boolean }>(`/whatsapp-chats/${encodeURIComponent(phone)}/toggle-bot`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chat-detail", selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chats"] });
      if (data.botPausado) {
        toast.info("Asistente pausado. Modo manual activado para este chat.");
      } else {
        toast.success("Asistente reanudado. Responderá automáticamente con IA.");
      }
    },
    onError: (err: any) => {
      toast.error(`Error cambiando estado: ${err?.message}`);
    },
  });

  // Enviar mensaje
  const handleEnviar = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPhone || !mensajeTexto.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ phone: selectedPhone, text: mensajeTexto.trim() });
  };

  // Iniciar nuevo chat desde el modal
  const handleIniciarNuevoChat = () => {
    if (!nuevoChatTelefono.trim()) {
      toast.error("Seleccioná un contacto o ingresá un número de teléfono");
      return;
    }
    const phoneClean = nuevoChatTelefono.replace(/[^0-9]/g, "");
    setSelectedPhone(phoneClean);
    setModalNuevoChat(false);

    if (nuevoChatMensaje.trim()) {
      sendMutation.mutate({ phone: phoneClean, text: nuevoChatMensaje.trim() });
      setNuevoChatMensaje("");
    }
    setNuevoChatTelefono("");
  };

  if (user && user.rol?.toLowerCase() === "empleado") {
    return null;
  }

  // Filtrado de lista de chats
  const chatsFiltrados = chats.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      c.nombre.toLowerCase().includes(term) ||
      c.phone.includes(term) ||
      (c.cargo && c.cargo.toLowerCase().includes(term)) ||
      (c.ultimoMensaje && c.ultimoMensaje.toLowerCase().includes(term));

    if (!matchSearch) return false;

    if (filtroTipo === "admins") return c.esAdmin;
    if (filtroTipo === "operarios") return !c.esAdmin;
    if (filtroTipo === "pausados") return c.botPausado;
    return true;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] max-w-7xl mx-auto space-y-2 overflow-hidden">
      {/* Barra superior de título y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Centro de WhatsApp
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium py-0">
                En vivo
              </Badge>
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Monitoreo en tiempo real, auditoría de mensajes y respuestas manuales desde el servidor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchChats();
              if (selectedPhone) refetchDetalle();
            }}
            className="h-8 gap-1.5 text-xs"
            title="Refrescar lista y mensajes"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </Button>

          <Button
            size="sm"
            onClick={() => setModalNuevoChat(true)}
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo Chat
          </Button>
        </div>
      </div>

      {/* Contenedor principal estilo WhatsApp Web: flex-1 + min-h-0 para garantizar scroll vertical sin saltos */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden border shadow-sm rounded-xl bg-card">
        {/* COLUMNA IZQUIERDA: Lista de conversaciones */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 border-r bg-slate-50/50 dark:bg-slate-900/30 flex-shrink-0">
          {/* Buscador */}
          <div className="p-2.5 border-b space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, teléfono o mensaje..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Filtros rápidos */}
            <div className="flex gap-1 overflow-x-auto pb-0.5 text-xs">
              {(
                [
                  { id: "todos", label: "Todos" },
                  { id: "operarios", label: "Operarios" },
                  { id: "admins", label: "Admins" },
                  { id: "pausados", label: "Modo Manual" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltroTipo(f.id)}
                  className={`px-2 py-0.5 rounded-full font-medium transition-colors text-[11px] whitespace-nowrap ${
                    filtroTipo === f.id
                      ? "bg-emerald-600 text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista scrolleable de chats */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/40">
            {loadingChats ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground/60" />
                <p>Cargando conversaciones...</p>
              </div>
            ) : chatsFiltrados.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                <MessageSquare className="h-7 w-7 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-foreground">No hay chats para mostrar</p>
                <p>Iniciá un nuevo chat con el botón de arriba.</p>
              </div>
            ) : (
              chatsFiltrados.map((c) => {
                const isSelected = selectedPhone === c.phone;
                const formattedDate = new Date(c.ultimaFecha).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={c.phone}
                    onClick={() => setSelectedPhone(c.phone)}
                    className={`p-3 cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-l-emerald-600"
                        : "hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Avatar con foto de perfil o iniciales */}
                    <div className="relative flex-shrink-0">
                      {c.foto_perfil ? (
                        <img
                          src={c.foto_perfil}
                          alt={c.nombre}
                          className="h-11 w-11 rounded-full object-cover shadow-sm border border-border/80"
                        />
                      ) : (
                        <div
                          className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-sm ${
                            c.esAdmin
                              ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                              : "bg-gradient-to-br from-emerald-500 to-teal-600"
                          }`}
                        >
                          {c.nombre
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase() || <User className="h-5 w-5" />}
                        </div>
                      )}
                      {c.botPausado && (
                        <div
                          className="absolute -bottom-1 -right-1 h-4 w-4 bg-amber-500 rounded-full border-2 border-background flex items-center justify-center"
                          title="Bot pausado (Modo manual)"
                        >
                          <Pause className="h-2 w-2 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Información del chat */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-sm truncate text-foreground">
                          {c.nombre}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formattedDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] text-muted-foreground truncate">
                          {c.phone.startsWith("54") ? `+${c.phone}` : c.phone}
                        </span>
                        {c.cargo && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 font-normal max-w-[120px] truncate"
                          >
                            {c.cargo}
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground/90 truncate flex items-center gap-1">
                        {c.ultimoMensaje}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Conversación activa */}
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
          {selectedPhone && chatActivo ? (
            <>
              {/* Cabecera del chat seleccionado (fija arriba) */}
              <div className="p-3 border-b flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/40 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Foto de perfil o iniciales */}
                  {chatActivo.foto_perfil ? (
                    <img
                      src={chatActivo.foto_perfil}
                      alt={chatActivo.nombre}
                      className="h-10 w-10 rounded-full object-cover shadow-sm border border-border/80 flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${
                        chatActivo.esAdmin
                          ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                          : "bg-gradient-to-br from-emerald-500 to-teal-600"
                      }`}
                    >
                      {chatActivo.nombre
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || <User className="h-5 w-5" />}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-sm text-foreground truncate">
                        {chatActivo.nombre}
                      </h2>
                      {chatActivo.esAdmin ? (
                        <Badge variant="outline" className="text-[10px] border-indigo-500/40 text-indigo-600 dark:text-indigo-400 py-0">
                          <Shield className="h-2.5 w-2.5 mr-1" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {chatActivo.cargo || "Operario"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{chatActivo.phone.startsWith("54") ? `+${chatActivo.phone}` : chatActivo.phone}</span>
                      <span>•</span>
                      <a
                        href={`https://wa.me/${chatActivo.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        Abrir en WhatsApp <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Control de Modo Manual / Bot Automático */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant={chatActivo.botPausado ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleBotMutation.mutate(selectedPhone)}
                    disabled={toggleBotMutation.isPending}
                    className={`h-8 gap-1.5 text-xs font-medium ${
                      chatActivo.botPausado
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "text-slate-700 dark:text-slate-200 border-slate-300"
                    }`}
                    title={
                      chatActivo.botPausado
                        ? "Hacé clic para reactivar las respuestas automáticas de IA"
                        : "Hacé clic para pausar el bot y atender este chat manualmente"
                    }
                  >
                    {chatActivo.botPausado ? (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Reanudar Bot
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 text-amber-500" />
                        Pausar Bot (Modo Manual)
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Banner informativo si el bot está pausado */}
              {chatActivo.botPausado && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-1.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between flex-shrink-0">
                  <span className="flex items-center gap-1.5">
                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                    <strong>Modo Manual Activo:</strong> El asistente de IA no responderá automáticamente en este chat.
                  </span>
                  <span className="text-[11px] opacity-80">Tus respuestas desde la web van directo al WhatsApp del destinatario.</span>
                </div>
              )}

              {/* Flujo de mensajes con scroll vertical garantizado */}
              <div
                ref={chatContainerRef}
                className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-100/40 dark:bg-slate-950/40"
              >
                {loadingDetalle ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Cargando mensajes...
                  </div>
                ) : chatActivo.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-xs space-y-1">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="font-medium text-foreground">No hay mensajes en esta conversación</p>
                    <p>Escribí un mensaje abajo para enviar el primer WhatsApp desde el servidor.</p>
                  </div>
                ) : (
                  chatActivo.messages.map((m: any, idx: number) => {
                    const isUser = m.role === "user";
                    const isTool = m.role === "tool";
                    if (isTool) return null; // Omitir tool_results internos

                    let textContent = "";
                    let hasImage = false;

                    if (typeof m.content === "string") {
                      textContent = m.content;
                    } else if (Array.isArray(m.content)) {
                      const textObj = m.content.find((c: any) => c.type === "text");
                      const imgObj = m.content.find((c: any) => c.type === "image_url");
                      textContent = textObj?.text || "";
                      hasImage = !!imgObj;
                    }

                    const timeStr = m.created_at
                      ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "";

                    return (
                      <div
                        key={idx}
                        className={`flex ${isUser ? "justify-start" : "justify-end"} items-end gap-1.5`}
                      >
                        {isUser && (
                          chatActivo.foto_perfil ? (
                            <img
                              src={chatActivo.foto_perfil}
                              alt={chatActivo.nombre}
                              className="h-6 w-6 rounded-full object-cover mb-1 border border-border/60 flex-shrink-0"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-[10px] text-foreground flex-shrink-0 mb-1">
                              <User className="h-3 w-3" />
                            </div>
                          )
                        )}

                        <div
                          className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm ${
                            isUser
                              ? "bg-white dark:bg-slate-800 text-foreground border rounded-bl-sm"
                              : m.manual
                              ? "bg-emerald-600 text-white rounded-br-sm shadow-emerald-600/10"
                              : m.is_warning
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300/40 rounded-br-sm"
                              : "bg-slate-800 dark:bg-slate-700 text-white rounded-br-sm"
                          }`}
                        >
                          {/* Etiqueta del remitente */}
                          <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-black/10 dark:border-white/10 text-[10px] font-semibold opacity-75">
                            <span>
                              {isUser
                                ? chatActivo.nombre
                                : m.manual
                                ? `Admin Web (${m.admin_user || "Carlos"})`
                                : m.is_warning
                                ? "Aviso Automático (No Admin)"
                                : "Asistente Digital (IA)"}
                            </span>
                            {!isUser && !m.manual && !m.is_warning && (
                              <span className="flex items-center gap-0.5 text-[9px] opacity-80">
                                <Sparkles className="h-2.5 w-2.5" /> IA
                              </span>
                            )}
                          </div>

                          {/* Imagen adjunta si existe */}
                          {hasImage && (
                            <div className="mb-2 p-1.5 bg-black/10 rounded-lg flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              <span className="text-[11px] font-medium">Comprobante / Foto adjunto</span>
                            </div>
                          )}

                          {/* Contenido del texto */}
                          <p className="whitespace-pre-wrap select-text font-normal">{textContent}</p>

                          {/* Hora y tilde */}
                          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-60">
                            {timeStr && <span>{timeStr}</span>}
                            {!isUser && <CheckCheck className="h-3 w-3 inline" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Barra inferior para redactar y enviar (fija abajo) */}
              <form onSubmit={handleEnviar} className="p-2.5 border-t bg-background flex items-end gap-2 flex-shrink-0">
                <div className="flex-1 relative">
                  <textarea
                    rows={2}
                    placeholder="Escribí un mensaje para enviar por WhatsApp... (Shift+Enter para salto de línea)"
                    value={mensajeTexto}
                    onChange={(e) => setMensajeTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEnviar();
                      }
                    }}
                    className="w-full resize-none p-2 text-xs rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!mensajeTexto.trim() || sendMutation.isPending}
                  className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold shadow-sm flex-shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendMutation.isPending ? "Enviando..." : "Enviar"}
                </Button>
              </form>
            </>
          ) : (
            /* Estado vacío cuando no hay conversación seleccionada */
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Bandeja de Mensajes WhatsApp</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Seleccioná una conversación de la columna izquierda para leer el historial completo, ver lo que el asistente responde o enviar un mensaje manual directamente desde el sistema.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalNuevoChat(true)}
                className="gap-1.5 text-xs mt-2"
              >
                <Plus className="h-3.5 w-3.5" />
                Iniciar nueva conversación
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Iniciar Nuevo Chat */}
      <Dialog open={modalNuevoChat} onOpenChange={setModalNuevoChat}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              Iniciar Nueva Conversación de WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Elegí un empleado activo o ingresá un número con código de área para abrir el chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Selector de empleado registrado */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Seleccionar Empleado Registrado
              </label>
              <select
                className="w-full h-9 rounded-md border text-xs px-2 bg-background"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) setNuevoChatTelefono(val);
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  -- Elegir de la lista ({contactos.length} disponibles) --
                </option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.telefono}>
                    {c.nombre} ({c.cargo}) — {c.telefono}
                  </option>
                ))}
              </select>
            </div>

            {/* O ingreso manual de número */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                O ingresar teléfono manualmente
              </label>
              <Input
                placeholder="Ej: 3472629600 o 5493472629600"
                value={nuevoChatTelefono}
                onChange={(e) => setNuevoChatTelefono(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Mensaje opcional inicial */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Mensaje inicial (opcional)
              </label>
              <textarea
                rows={3}
                placeholder="Escribí el mensaje para enviar al abrir el chat..."
                value={nuevoChatMensaje}
                onChange={(e) => setNuevoChatMensaje(e.target.value)}
                className="w-full resize-none p-2.5 text-xs rounded-lg border bg-background"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setModalNuevoChat(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleIniciarNuevoChat}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              Abrir Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
