import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, User, Sparkles, Loader2 } from "lucide-react";

interface Mensaje {
  tipo: "usuario" | "ia";
  texto: string;
  timestamp: Date;
}

const CONSULTAS_RAPIDAS = [
  "¿Qué empleado tuvo más alertas este mes?",
  "¿Qué máquina consumió más combustible?",
  "¿Qué vencimientos tengo en los próximos 30 días?",
  "¿Cuántas alertas activas hay?",
  "¿Qué máquinas están detenidas?",
  "¿Cuántas horas trabajó cada operario este mes?",
  "¿Cuántos incidentes hubo este mes?",
  "¿Cuál es el estado de la flota?",
];

export function Ia() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      tipo: "ia",
      texto: "Hola. Soy el asistente de PUFFIN SRL. Puedo responder consultas sobre el estado operativo de la empresa: alertas, combustible, vencimientos de documentos, productividad de operarios, estado de maquinaria y más. ¿En qué puedo ayudarte?",
      timestamp: new Date(),
    },
  ]);
  const [pregunta, setPregunta] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const consulta = useMutation({
    mutationFn: (p: string) =>
      apiFetch<{ respuesta: string }>("/ia/consulta", {
        method: "POST",
        body: JSON.stringify({ pregunta: p }),
      }),
    onSuccess: (data, variables) => {
      setMensajes((prev) => [
        ...prev,
        { tipo: "ia", texto: data.respuesta, timestamp: new Date() },
      ]);
    },
    onError: () => {
      setMensajes((prev) => [
        ...prev,
        { tipo: "ia", texto: "No pude procesar la consulta. Intentá de nuevo.", timestamp: new Date() },
      ]);
    },
  });

  const enviar = (texto: string) => {
    if (!texto.trim() || consulta.isPending) return;
    setMensajes((prev) => [...prev, { tipo: "usuario", texto, timestamp: new Date() }]);
    setPregunta("");
    consulta.mutate(texto);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary p-2">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Inteligencia Artificial</h1>
          <p className="text-sm text-muted-foreground">Consultas sobre datos operativos en tiempo real</p>
        </div>
        <Badge variant="secondary" className="ml-auto">Beta</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Consultas rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CONSULTAS_RAPIDAS.map((q) => (
                <button
                  key={q}
                  onClick={() => enviar(q)}
                  disabled={consulta.isPending}
                  className="w-full text-left text-xs p-2 rounded-lg border hover:bg-slate-50 hover:border-primary transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-3">
          <Card className="flex flex-col" style={{ height: 560 }}>
            <CardHeader className="border-b flex-shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-primary" />
                Asistente PUFFIN SRL
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-600 inline-block" />
                  En línea
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {mensajes.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.tipo === "usuario" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.tipo === "ia" ? "bg-primary" : "bg-slate-200"}`}>
                    {msg.tipo === "ia" ? (
                      <Bot className="h-4 w-4 text-white" />
                    ) : (
                      <User className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                    msg.tipo === "ia"
                      ? "bg-white border shadow-sm text-foreground rounded-tl-none"
                      : "bg-primary text-white rounded-tr-none"
                  }`}>
                    {msg.texto}
                    <div className={`text-xs mt-1 ${msg.tipo === "ia" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                      {msg.timestamp.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {consulta.isPending && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white border shadow-sm rounded-2xl rounded-tl-none px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </CardContent>
            <div className="border-t p-4 flex-shrink-0">
              <form
                onSubmit={(e) => { e.preventDefault(); enviar(pregunta); }}
                className="flex gap-2"
              >
                <Input
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  placeholder="Escribí tu consulta..."
                  disabled={consulta.isPending}
                  className="flex-1"
                />
                <Button type="submit" disabled={!pregunta.trim() || consulta.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
