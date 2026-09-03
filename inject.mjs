import fs from 'fs';

const path = 'artifacts/api-server/src/routes/cron.ts';
let content = fs.readFileSync(path, 'utf8');

// Add imports
if (!content.includes('historialUsoTable')) {
  content = content.replace(
    'import { empleadosTable, maquinasTable, alertasTable } from "@workspace/db/schema";',
    'import { empleadosTable, maquinasTable, alertasTable, historialUsoTable } from "@workspace/db/schema";'
  );
}

if (!content.includes('desc,')) {
  content = content.replace(
    'import { eq, or, and, isNotNull, sql } from "drizzle-orm";',
    'import { eq, or, and, isNotNull, sql, desc, inArray } from "drizzle-orm";'
  );
}

if (!content.includes('SatcomClient')) {
  content = content.replace(
    'import { sendWhatsAppMessage, sendWhatsAppTemplate } from "../services/whatsapp.js";',
    'import { sendWhatsAppMessage, sendWhatsAppTemplate } from "../services/whatsapp.js";\nimport { SatcomClient } from "../services/satcom";'
  );
}

const newRoute = `
// ========================================================================================
// CRON: Sincronización Automática de Satcom (Encendido/Apagado)
// GET /api/cron/sync-satcom?token=TU_TOKEN
// ========================================================================================
cronRouter.get("/sync-satcom", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    // 1. Obtener todas las máquinas vinculadas
    const maquinas = await db.select().from(maquinasTable).where(isNotNull(maquinasTable.satcom_id));
    if (maquinas.length === 0) {
      return res.json({ success: true, message: "No hay máquinas vinculadas" });
    }

    // 2. Consultar API de Satcom para esas máquinas
    const devices = await SatcomClient.getDevices();
    const linkedDeviceIds = new Set(maquinas.map(m => m.satcom_id));
    const linkedDevices = devices.filter(d => linkedDeviceIds.has(d.id));
    
    const positionIdsToFetch = linkedDevices.map(d => d.positionId).filter((id): id is number => !!id);
    const positions = await SatcomClient.getPositionsBulk(positionIdsToFetch);
    const positionsMap = new Map(positions.map(p => [p.id, p]));

    let logs = [];
    let nuevosEventos = 0;

    for (const maq of maquinas) {
      const device = linkedDevices.find(d => d.id === maq.satcom_id);
      if (!device) continue;

      const position = positionsMap.get(device.positionId);
      if (!position) continue;

      const currentIgnition = !!position.attributes?.ignition;
      const currentHorometro = position.attributes?.hours ? (position.attributes.hours / 3600000).toFixed(1) : "0";

      // Obtener el último evento registrado en historial_uso
      const [ultimoEvento] = await db
        .select()
        .from(historialUsoTable)
        .where(eq(historialUsoTable.maquina_id, maq.id))
        .orderBy(desc(historialUsoTable.fecha_hora))
        .limit(1);

      let lastIgnition = null;
      if (ultimoEvento) {
        lastIgnition = ultimoEvento.evento === "encendido";
      }

      // Detectar cambio o primer registro
      if (lastIgnition !== currentIgnition) {
        const nuevoEstado = currentIgnition ? "encendido" : "apagado";
        
        await db.insert(historialUsoTable).values({
          maquina_id: maq.id,
          evento: nuevoEstado,
          horometro: currentHorometro,
          ubicacion_lat: position.latitude.toString(),
          ubicacion_lng: position.longitude.toString(),
          ubicacion_texto: "Base de Operaciones (Satcom)"
        });

        nuevosEventos++;
        logs.push(\`\${maq.nombre}: Cambió a \${nuevoEstado} (H: \${currentHorometro})\`);
      }
    }

    return res.json({
      success: true,
      nuevos_eventos: nuevosEventos,
      logs,
      ejecutado_a: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error en cron sync-satcom:", error);
    return res.status(500).json({ error: error.message });
  }
});
`;

fs.writeFileSync(path, content + newRoute, 'utf8');
console.log('Done!');
