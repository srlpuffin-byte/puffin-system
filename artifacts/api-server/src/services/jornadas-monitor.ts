import { db } from "@workspace/db";
import {
  jornadasTable,
  empleadosTable,
  maquinasTable,
  alertasTable,
  usuariosTable,
  whatsappSesionesTable,
} from "@workspace/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  sendPushNotificationToAll,
  sendPushNotificationToUser,
  addRecentNotification,
} from "./push-notifications.js";
import {
  getNotificacionesConfig,
} from "./notificaciones-config.js";
import { sendWhatsAppTemplate, sendWhatsAppMessage, formatArgentinaPhone } from "./whatsapp.js";

// Mapa en memoria para recordar cuándo se envió el último recordatorio por jornada (evita spam cada 15 min)
const recordatoriosEnviadosMap = new Map<number, number>();

export async function checkJornadasExcedidas(forceSend = false) {
  try {
    const config = await getNotificacionesConfig();
    if (!config.jornadas_12h_activo) {
      logger.info("[Jornadas Monitor] Recordatorio de 12h desactivado en configuración");
      return { totalActivas: 0, excedidas: 0, enviadas: 0, status: "disabled" };
    }

    const limiteHoras = config.jornadas_horas_limite || 12;

    // Buscar jornadas activas (en_curso o sin hora_fin)
    const activas = await db
      .select()
      .from(jornadasTable)
      .where(
        and(
          eq(jornadasTable.estado, "en_curso"),
          eq(jornadasTable.empresa_id, 1)
        )
      );

    const now = Date.now();
    let excedidas = 0;
    let enviadas = 0;

    for (const j of activas) {
      // Determinar hora y fecha de inicio de la jornada
      let fechaInicio = j.createdAt ? new Date(j.createdAt).getTime() : 0;

      if (j.fecha) {
        const fechaStr = String(j.fecha).split("T")[0];
        const horaStr = j.hora_inicio || "07:00";
        const combined = new Date(`${fechaStr}T${horaStr.length === 5 ? horaStr + ":00" : horaStr}`).getTime();
        if (!isNaN(combined) && combined > 0) {
          fechaInicio = combined;
        }
      }

      if (!fechaInicio) continue;

      const horasTranscurridas = (now - fechaInicio) / (1000 * 60 * 60);

      if (horasTranscurridas >= limiteHoras) {
        excedidas++;

        // Evitar enviar más de un recordatorio cada 8 horas para la misma jornada, a menos que sea forzado
        const ultimoEnvio = recordatoriosEnviadosMap.get(j.id) || 0;
        if (!forceSend && now - ultimoEnvio < 8 * 60 * 60 * 1000) {
          continue;
        }

        // Obtener datos del empleado y de la máquina
        const [empleado] = await db
          .select()
          .from(empleadosTable)
          .where(eq(empleadosTable.id, j.empleado_id))
          .limit(1);

        const [maquina] = await db
          .select()
          .from(maquinasTable)
          .where(eq(maquinasTable.id, j.maquina_id))
          .limit(1);

        if (!empleado) continue;

        const horasFormateadas = horasTranscurridas.toFixed(1);
        const nombreMaq = maquina?.nombre || "tu equipo de trabajo";
        const mensajeAviso = `Hola ${empleado.nombre}, tu jornada en ${nombreMaq} lleva ${horasFormateadas} horas iniciada y aún no fue finalizada. Por favor ingresá a registrar el cierre y el horómetro final.`;

        logger.info(
          `[Jornadas Monitor] Jornada #${j.id} (${empleado.nombre} ${empleado.apellido}) excedió ${horasFormateadas}h. Despachando notificación a su app/usuario...`
        );

        // 1. Notificación a su usuario y a su app (Web Push nativo a sus dispositivos registrados)
        if (config.notificar_empleado_push) {
          try {
            // Buscar cuentas de usuario vinculadas al empleado
            const matchedUsers = await db
              .select()
              .from(usuariosTable)
              .where(
                or(
                  and(
                    sql`LOWER(${usuariosTable.nombre}) = LOWER(${empleado.nombre})`,
                    sql`LOWER(${usuariosTable.apellido}) = LOWER(${empleado.apellido})`
                  ),
                  sql`LOWER(${usuariosTable.nombre}) = LOWER(${empleado.nombre})`
                )
              );

            const userIds = matchedUsers.map((u) => u.id);
            const userNames = matchedUsers.map((u) => u.usuario);
            userNames.push(empleado.nombre);

            await sendPushNotificationToUser(
              { userIds, usuarios: userNames },
              {
                title: "⏱️ Recordatorio de Fin de Jornada (+12h)",
                body: mensajeAviso,
                url: "/jornadas",
                tag: `jornada-${j.id}`,
              }
            );
          } catch (pushErr) {
            logger.warn({ pushErr }, "[Jornadas Monitor] Error despachando push a la app del empleado");
          }
        } else {
          // Si no tiene push activo pero la regla está encendida, igual alimentar el centro de notificaciones in-app
          addRecentNotification({
            tipo: "alerta",
            titulo: "⏱️ Recordatorio de Fin de Jornada",
            mensaje: mensajeAviso,
            url: "/jornadas",
          });
        }

        // 2. Registrar alerta en el sistema
        try {
          await db.insert(alertasTable).values({
            tipo: "jornada_prolongada",
            prioridad: "amarilla",
            descripcion: `Operario ${empleado.nombre} ${empleado.apellido} lleva ${horasFormateadas} hs con jornada abierta en ${nombreMaq} sin registrar fin.`,
            estado: "activa",
            entidad_tipo: "empleado",
            entidad_id: empleado.id,
            entidad_nombre: `${empleado.nombre} ${empleado.apellido}`,
            fecha: new Date(),
          });
        } catch (alertaErr) {
          logger.warn({ alertaErr }, "[Jornadas Monitor] Error guardando alerta en BD");
        }

        // 3. Notificar a los administradores si está activo
        if (config.notificar_admin_push) {
          await sendPushNotificationToAll({
            title: `⏱️ Jornada >${limiteHoras}h: ${empleado.nombre}`,
            body: `Lleva ${horasFormateadas} hs en ${nombreMaq} sin registrar fin de jornada.`,
            url: "/jornadas",
            tag: `jornada-admin-${j.id}`,
          }).catch(() => {});
        }

        recordatoriosEnviadosMap.set(j.id, now);
        enviadas++;

        // 4. Enviar WhatsApp al operario con plantilla oficial mensaje_puffin para abrir la ventana de 24 hs
        const telefonoRaw = empleado.telefono_whatsapp || empleado.telefono;
        if (telefonoRaw) {
          const cleanPhone = formatArgentinaPhone(telefonoRaw);
          const mensajeWa = `Hola ${empleado.nombre}, tu jornada en ${nombreMaq} lleva ${horasFormateadas} horas iniciada y aún no fue finalizada. Por favor ingresá a https://puffinsrl.site/jornadas o respondé a este mensaje para registrar el horómetro de cierre.`;
          // Sanitizar para Meta (error #132018: sin \n, \r, \t ni >4 espacios consecutivos)
          const sanitizedWa = mensajeWa.trim().replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ");

          try {
            await sendWhatsAppTemplate(
              cleanPhone,
              "mensaje_puffin",
              "es_AR",
              [{ type: "text", text: sanitizedWa }]
            );
            logger.info(`[Jornadas Monitor] ✅ WhatsApp enviado a ${empleado.nombre} (${cleanPhone}) vía plantilla mensaje_puffin por jornada #${j.id}.`);

            // Registrar en el historial de chat de WhatsApp del sistema
            try {
              const [sesion] = await db.select().from(whatsappSesionesTable).where(eq(whatsappSesionesTable.phone, cleanPhone)).limit(1);
              const historial = (sesion?.messages as any[]) || [];
              historial.push({
                role: "assistant",
                content: `📢 [Recordatorio Jornada +12h Enviado vía Plantilla mensaje_puffin]\n\n"${mensajeWa}"`,
                created_at: new Date().toISOString(),
                is_template: true,
              });
              if (sesion) {
                await db.update(whatsappSesionesTable).set({ messages: historial, updated_at: new Date() }).where(eq(whatsappSesionesTable.phone, cleanPhone));
              } else {
                await db.insert(whatsappSesionesTable).values({ phone: cleanPhone, messages: historial, estado: "idle" });
              }
            } catch (histErr) {
              logger.warn({ histErr }, "[Jornadas Monitor] Error registrando mensaje en historial de whatsappSesiones");
            }
          } catch (waErr: any) {
            logger.warn(`[Jornadas Monitor] Error enviando plantilla a ${cleanPhone}: ${waErr?.message}. Intentando texto libre...`);
            try {
              await sendWhatsAppMessage(cleanPhone, `PUFFIN SRL:\n${mensajeWa}\nSaludos estimado/a`);
            } catch (waErr2: any) {
              logger.warn(`[Jornadas Monitor] Fallback WhatsApp también falló: ${waErr2?.message}`);
            }
          }
        } else {
          logger.warn(`[Jornadas Monitor] Jornada #${j.id}: empleado ${empleado.nombre} no tiene teléfono registrado. No se envió WhatsApp.`);
        }

        // 5. Cerrar la jornada automáticamente con hora exacta de Argentina (UTC-3)
        try {
          const dNow = new Date();
          const utcMs = dNow.getTime() + (dNow.getTimezoneOffset() * 60000);
          const arDate = new Date(utcMs - (3 * 3600000));
          const horaFinAuto = `${String(arDate.getHours()).padStart(2, "0")}:${String(arDate.getMinutes()).padStart(2, "0")}`;

          await db
            .update(jornadasTable)
            .set({
              estado: "finalizada",
              hora_fin: horaFinAuto,
              observaciones: (j.observaciones ? j.observaciones + "\n" : "") +
                `[AUTO-CIERRE] Jornada cerrada automáticamente por el sistema tras ${horasFormateadas} hs sin registrar fin. (${arDate.toLocaleString("es-AR")})`,
              updatedAt: new Date(),
            })
            .where(eq(jornadasTable.id, j.id));
          logger.info(`[Jornadas Monitor] ✅ Jornada #${j.id} cerrada automáticamente (hora_fin: ${horaFinAuto} Argentina).`);
        } catch (closeErr: any) {
          logger.error(`[Jornadas Monitor] Error cerrando jornada #${j.id} automáticamente: ${closeErr?.message}`);
        }
      }
    }

    return {
      totalActivas: activas.length,
      excedidas,
      enviadas,
      status: "success",
    };
  } catch (err) {
    logger.error({ err }, "[Jornadas Monitor] Error verificando jornadas excedidas");
    return { totalActivas: 0, excedidas: 0, enviadas: 0, error: (err as any)?.message };
  }
}

export function startJornadasMonitor() {
  logger.info("[Jornadas Monitor] Iniciando monitor automático de jornadas (+12h a la app/usuario)...");

  // Ejecución inicial 15 segundos tras el arranque
  setTimeout(() => {
    checkJornadasExcedidas().catch((err) =>
      logger.error({ err }, "[Jornadas Monitor] Error en chequeo inicial")
    );
  }, 15000);

  // Chequeo periódico cada 15 minutos
  setInterval(() => {
    checkJornadasExcedidas().catch((err) =>
      logger.error({ err }, "[Jornadas Monitor] Error en chequeo periódico")
    );
  }, 15 * 60 * 1000);
}
