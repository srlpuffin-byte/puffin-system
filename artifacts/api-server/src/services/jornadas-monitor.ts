import { db } from "@workspace/db";
import {
  jornadasTable,
  empleadosTable,
  maquinasTable,
  alertasTable,
  usuariosTable,
  pushSubscriptionsTable,
} from "@workspace/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import {
  sendPushNotificationToAll,
  PushNotificationPayload,
} from "./push-notifications.js";
import {
  getNotificacionesConfig,
  isNotificationEnabled,
} from "./notificaciones-config.js";
import webpush from "web-push";

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
        const mensajeAviso = `Hola ${empleado.nombre}, tu jornada en ${nombreMaq} lleva ${horasFormateadas} horas iniciada y aún no fue finalizada. Por favor ingresá al sistema para registrar el cierre y el horómetro final.`;

        logger.info(
          `[Jornadas Monitor] Jornada #${j.id} (${empleado.nombre} ${empleado.apellido}) excedió ${horasFormateadas}h. Despachando avisos...`
        );

        // 1. WhatsApp directo al empleado si está habilitado y tiene número
        if (config.notificar_empleado_whatsapp) {
          const telefonoRaw = empleado.telefono_whatsapp || empleado.telefono;
          if (telefonoRaw) {
            const cleanPhone = telefonoRaw.replace(/\D/g, "");
            const formattedPhone = cleanPhone.startsWith("54")
              ? cleanPhone
              : cleanPhone.startsWith("9")
              ? "54" + cleanPhone
              : "549" + cleanPhone;

            const textoWa = `⚠️ *PUFFIN SRL - Recordatorio de Jornada*\n\nHola *${empleado.nombre}*, iniciaste tu jornada hace más de *${Math.floor(horasTranscurridas)} horas* en *${nombreMaq}*.\n\nPor favor recordá ingresar a la plataforma de PUFFIN para finalizar la jornada y cargar el horómetro de cierre:\n👉 https://puffin-system.up.railway.app/jornadas\n\n_Mensaje automático del sistema de control de operaciones._`;

            try {
              await sendWhatsAppMessage(formattedPhone, textoWa);
              logger.info(`[Jornadas Monitor] WhatsApp enviado a operario ${empleado.nombre} (${formattedPhone})`);
            } catch (err) {
              logger.warn({ err }, `[Jornadas Monitor] Error enviando WhatsApp a ${formattedPhone}`);
            }
          }
        }

        // 2. Web Push al dispositivo del empleado si está suscripto
        if (config.notificar_empleado_push) {
          try {
            // Buscar si el empleado tiene usuario vinculado
            const [user] = await db
              .select()
              .from(usuariosTable)
              .where(
                or(
                  eq(usuariosTable.nombre, empleado.nombre),
                  sql`LOWER(${usuariosTable.nombre}) = LOWER(${empleado.nombre})`
                )
              )
              .limit(1);

            const subs = await db
              .select()
              .from(pushSubscriptionsTable)
              .where(
                or(
                  eq(pushSubscriptionsTable.usuario, empleado.nombre),
                  user ? eq(pushSubscriptionsTable.user_id, user.id) : sql`FALSE`
                )
              );

            for (const sub of subs) {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  JSON.stringify({
                    title: "⏱️ Recordatorio de Jornada (+12h)",
                    body: mensajeAviso,
                    url: "/jornadas",
                    tag: `jornada-${j.id}`,
                  })
                );
              } catch {}
            }
          } catch (e) {
            logger.warn({ e }, "[Jornadas Monitor] Error al enviar push al empleado");
          }
        }

        // 3. Registrar alerta en el sistema
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

        // 4. Notificar a los administradores si está activo
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
  logger.info("[Jornadas Monitor] Iniciando monitor automático de jornadas (+12h)...");

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
