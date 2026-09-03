import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { maquinasTable, historialUsoTable, alertasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const webhookSchema = z.object({
  maquina_id: z.number(),
  evento: z.enum(["encendido", "apagado"]),
  horometro: z.number(),
  ubicacion_lat: z.number().optional(),
  ubicacion_lng: z.number().optional(),
  ubicacion_texto: z.string().optional(),
  fecha_hora: z.string().optional(),
});

router.post(["/", "/webhook"], async (req, res) => {
  try {
    const data = webhookSchema.parse(req.body);

    // Verify machine exists
    const maquina = await db.query.maquinasTable.findFirst({
      where: eq(maquinasTable.id, data.maquina_id)
    });

    if (!maquina) {
      return res.status(404).json({ error: "Máquina no encontrada" });
    }

    // Insert history log
    await db.insert(historialUsoTable).values({
      maquina_id: data.maquina_id,
      evento: data.evento,
      horometro: data.horometro.toString(),
      ubicacion_lat: data.ubicacion_lat ? data.ubicacion_lat.toString() : null,
      ubicacion_lng: data.ubicacion_lng ? data.ubicacion_lng.toString() : null,
      ubicacion_texto: data.ubicacion_texto,
      fecha_hora: data.fecha_hora ? new Date(data.fecha_hora) : new Date(),
    });

    // Update current horometro if it's greater
    const currentHorometro = parseFloat(maquina.horometro || "0");
    if (data.horometro > currentHorometro) {
      await db.update(maquinasTable)
        .set({ horometro: data.horometro.toString() })
        .where(eq(maquinasTable.id, data.maquina_id));
    }

    // Create Alert
    let alertDescription = `Máquina ${maquina.nombre} (${maquina.codigo || 'S/C'}) ha sido ${data.evento === "encendido" ? "encendida" : "apagada"} a las ${new Date().toLocaleTimeString()}. Horómetro: ${data.horometro}.`;
    if (data.ubicacion_texto) {
      alertDescription += ` Ubicación: ${data.ubicacion_texto}`;
    }

    await db.insert(alertasTable).values({
      empresa_id: maquina.empresa_id,
      tipo: data.evento === "encendido" ? "aviso_encendido" : "aviso_apagado",
      prioridad: "azul",
      descripcion: alertDescription,
      entidad_tipo: "maquina",
      entidad_id: maquina.id,
      entidad_nombre: maquina.nombre,
    });

    // Notificar a administradores y hacer seguimiento del alquiler si aplica
    const { procesarEventoTelemetriaAlquiler } = await import("../services/alquiler-tracker.js");
    procesarEventoTelemetriaAlquiler({
      maquina,
      nuevoEstado: data.evento,
      horometro: data.horometro.toString(),
      latitude: data.ubicacion_lat || 0,
      longitude: data.ubicacion_lng || 0,
      ubicacionTexto: data.ubicacion_texto,
      ultimoEventoFechaHora: data.fecha_hora,
    }).catch(err => console.error("[SATELITAL WEBHOOK] Error en telemetría alquiler:", err));

    return res.json({ success: true, message: "Evento registrado y alerta creada" });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: "Error procesando el webhook satelital" });
  }
});

export default router;
