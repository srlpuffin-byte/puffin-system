/**
 * Script para crear la plantilla "comunicado_accesos_bot" en Meta Business Manager.
 *
 * USO:
 *   node scripts/create-template-comunicado-accesos.mjs
 *
 * REQUISITOS:
 *   - WHATSAPP_ACCESS_TOKEN: Token permanente del sistema (no de usuario).
 *   - WHATSAPP_WABA_ID: ID de la cuenta de WhatsApp Business (WABA).
 *     Se obtiene en: Meta Business Manager → Cuentas → Cuentas de WhatsApp Business.
 *
 * NOTAS:
 *   - El nombre de la plantilla debe estar en minúsculas y sin espacios.
 *   - Una vez aprobada (puede tardar minutos u horas), el endpoint
 *     POST /api/cron/comunicado-accesos ya puede enviarla masivamente.
 */

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID      = process.env.WHATSAPP_WABA_ID;

if (!ACCESS_TOKEN || !WABA_ID) {
  console.error("❌  Define WHATSAPP_ACCESS_TOKEN y WHATSAPP_WABA_ID antes de ejecutar este script.");
  console.error("    Ejemplo:");
  console.error("    WHATSAPP_ACCESS_TOKEN=EAAfi... WHATSAPP_WABA_ID=123456789 node scripts/create-template-comunicado-accesos.mjs");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Definición de la plantilla
// Editá el campo "text" del componente BODY con el mensaje que quieras enviar.
// Para agregar variables dinámicas usá {{1}}, {{2}}, etc.
// ─────────────────────────────────────────────────────────────────────────────
const template = {
  name: "comunicado_accesos_bot",
  language: "es_AR",
  category: "UTILITY",       // Opciones: UTILITY | MARKETING | AUTHENTICATION
  components: [
    {
      type: "BODY",
      text:
        "🔔 *Comunicado — Sistema Puffin*\n\n" +
        "Te informamos que tus credenciales de acceso al sistema han sido actualizadas.\n\n" +
        "Por favor ingresá con tu usuario y nueva contraseña desde:\n" +
        "🌐 https://puffinsrl.site\n\n" +
        "Ante cualquier inconveniente, contactá al administrador.\n\n" +
        "_Este es un mensaje automático, no respondas a este número._",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Llamada a la API de Meta
// ─────────────────────────────────────────────────────────────────────────────
const url = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates`;

console.log(`📤  Creando plantilla "${template.name}" en WABA ${WABA_ID}...`);
console.log("    Payload:\n", JSON.stringify(template, null, 2));

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(template),
});

const data = await res.json();

if (!res.ok) {
  console.error("❌  Error al crear la plantilla:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("✅  Plantilla creada exitosamente:");
console.log(JSON.stringify(data, null, 2));
console.log("\n⏳  Estado inicial: PENDING — Meta puede tardar unos minutos en aprobarla.");
console.log("    Revisá el estado en: https://business.facebook.com → Herramientas de mensajería → Plantillas");
