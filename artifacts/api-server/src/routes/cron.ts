import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, maquinasTable, alertasTable } from "@workspace/db/schema";
import { eq, or, and, isNotNull, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

export const cronRouter = Router();

// Endpoint para el CRON diario (idealmente llamado a la mañana)
// Este endpoint debe estar protegido por un token de cron
const CRON_SECRET = process.env.CRON_SECRET || "puffin_cron_secret";

cronRouter.get("/alertas-diarias", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;

  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    const today = new Date();
    // Fechas límites para alertas
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    const zeroDaysFromNow = new Date(today); // Hoy

    const formatForQuery = (d: Date) => d.toISOString().split("T")[0];
    const todayStr = formatForQuery(today);
    const thirtyStr = formatForQuery(thirtyDaysFromNow);
    const fifteenStr = formatForQuery(fifteenDaysFromNow);

    const logMessages = [];

    // 1. Alertas de Carnet de Operarios
    const operarios = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.estado, "activo"),
        isNotNull(empleadosTable.vencimiento_carnet)
      )
    );

    for (const op of operarios) {
      if (!op.vencimiento_carnet) continue;
      
      const vto = new Date(op.vencimiento_carnet);
      let mensaje = "";

      if (op.vencimiento_carnet < todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir está VENCIDO desde el ${op.vencimiento_carnet}. Por favor regularizalo.`;
      } else if (op.vencimiento_carnet === todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence HOY.`;
      } else if (op.vencimiento_carnet === fifteenStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 15 días (${op.vencimiento_carnet}).`;
      } else if (op.vencimiento_carnet === thirtyStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 30 días (${op.vencimiento_carnet}).`;
      }

      if (mensaje) {
        logMessages.push(`Empleado ${op.id} (${op.nombre}): ${mensaje}`);
        // Registrar la alerta en la DB (opcional, el usuario lo puede ver en el panel)
        await db.insert(alertasTable).values({
          empresa_id: op.empresa_id,
          tipo: "vencimiento",
          prioridad: op.vencimiento_carnet <= todayStr ? "rojo" : "amarillo",
          descripcion: `Carnet de conducir vence/venció: ${op.vencimiento_carnet}`,
          estado: "activa",
          entidad_tipo: "empleado",
          entidad_id: op.id,
          entidad_nombre: `${op.nombre} ${op.apellido}`
        });

        // Si el operario tiene whatsapp y aceptó recibir alertas, enviar!
        if (op.telefono_whatsapp && op.recibir_alertas_whatsapp) {
          try {
            await sendWhatsAppMessage(op.telefono_whatsapp, mensaje);
          } catch (e) {
            console.error(`Error enviando whatsapp a ${op.telefono_whatsapp}`, e);
          }
        }
      }
    }

    // 2. Alertas de Máquinas (Seguro y VTV)
    const maquinas = await db.select().from(maquinasTable).where(
      and(
        or(eq(maquinasTable.estado, "activa"), eq(maquinasTable.estado, "mantenimiento")),
        or(isNotNull(maquinasTable.vencimiento_seguro), isNotNull(maquinasTable.vencimiento_vtv))
      )
    );

    // Aquí notificamos a un administrador o grupo.
    // Vamos a buscar un empleado administrador que reciba alertas (o a un nro fijo).
    // Opcionalmente: un número de grupo.
    const admins = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.cargo, "Administrativo"),
        eq(empleadosTable.recibir_alertas_whatsapp, true),
        isNotNull(empleadosTable.telefono_whatsapp)
      )
    );

    for (const maq of maquinas) {
      let mensajesMaq: string[] = [];

      // VTV
      if (maq.vencimiento_vtv) {
        if (maq.vencimiento_vtv < todayStr) mensajesMaq.push(`VTV VENCIDA (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === fifteenStr) mensajesMaq.push(`VTV Vence en 15 días (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === thirtyStr) mensajesMaq.push(`VTV Vence en 30 días (${maq.vencimiento_vtv})`);
      }

      // Seguro
      if (maq.vencimiento_seguro) {
        if (maq.vencimiento_seguro < todayStr) mensajesMaq.push(`Seguro VENCIDO (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === fifteenStr) mensajesMaq.push(`Seguro Vence en 15 días (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === thirtyStr) mensajesMaq.push(`Seguro Vence en 30 días (${maq.vencimiento_seguro})`);
      }

      if (mensajesMaq.length > 0) {
        const fullMsg = `Alerta Máquina ${maq.nombre} (${maq.codigo || maq.patente || ''}):\n- ${mensajesMaq.join('\n- ')}`;
        logMessages.push(fullMsg);
        
        await db.insert(alertasTable).values({
          empresa_id: maq.empresa_id,
          tipo: "vencimiento",
          prioridad: fullMsg.includes("VENCID") ? "rojo" : "amarillo",
          descripcion: fullMsg,
          estado: "activa",
          entidad_tipo: "maquina",
          entidad_id: maq.id,
          entidad_nombre: maq.nombre
        });

        // Enviar WhatsApp a admins
        for (const admin of admins) {
          if (admin.telefono_whatsapp) {
            try {
              await sendWhatsAppMessage(admin.telefono_whatsapp, fullMsg);
            } catch (e) {
              console.error(`Error enviando whatsapp a admin ${admin.telefono_whatsapp}`, e);
            }
          }
        }
      }
    }

    return res.json({ success: true, notificaciones_generadas: logMessages.length, logs: logMessages });
  } catch (error: any) {
    console.error("Error en cron diarias:", error);
    return res.status(500).json({ error: error.message });
  }
});
