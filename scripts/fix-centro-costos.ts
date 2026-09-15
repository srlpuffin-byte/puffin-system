import { db } from "@workspace/db";
import { egresosTable, proyectosTable } from "@workspace/db/schema";
import { isNotNull, eq } from "drizzle-orm";

async function fixCentroCostos() {
  console.log("🔍 Cargando proyectos...");
  const proyectos = await db.select({ lugar: proyectosTable.lugar }).from(proyectosTable);
  console.log(`✅ ${proyectos.length} proyectos: ${proyectos.map(p => p.lugar).join(", ")}\n`);

  const egresos = await db.select({ id: egresosTable.id, centro_costos: egresosTable.centro_costos })
    .from(egresosTable)
    .where(isNotNull(egresosTable.centro_costos));

  console.log(`📋 ${egresos.length} egresos con centro_costos.\n`);

  let actualizados = 0;
  let sinCambio = 0;
  let sinMatch = 0;

  for (const egreso of egresos) {
    const cc = egreso.centro_costos!.trim();

    // 1. Ya coincide exactamente → sin cambio
    if (proyectos.some(p => p.lugar === cc)) {
      sinCambio++;
      continue;
    }

    // 2. Buscar el proyecto cuyo "lugar" contiene el texto del egreso (o viceversa) o coincide fonéticamente/por tokens
    const match = proyectos.find(p => {
      const pLower = p.lugar.toLowerCase();
      const ccLower = cc.toLowerCase();
      // El valor del egreso está contenido en el nombre del proyecto o viceversa
      if (pLower.includes(ccLower) || ccLower.includes(pLower)) return true;
      // Normalización de 'h' inicial (ej: hacheras <-> acheras)
      const pClean = pLower.replace(/\bh+/g, "");
      const ccClean = ccLower.replace(/\bh+/g, "");
      if (pClean.includes(ccClean) || ccClean.includes(pClean)) return true;
      // Cada palabra del egreso (>= 4 letras) aparece en el nombre del proyecto
      const palabras = ccClean.split(/\s+/).filter((w: string) => w.length >= 4 && !/chaco|campo|obra|lote|litros/i.test(w));
      return palabras.length > 0 && palabras.some((w: string) => pClean.includes(w));
    });

    if (match) {
      console.log(`  ✏️  Egreso #${egreso.id}: "${cc}"  →  "${match.lugar}"`);
      await db.update(egresosTable)
        .set({ centro_costos: match.lugar })
        .where(eq(egresosTable.id, egreso.id));
      actualizados++;
    } else {
      console.log(`  ⚠️  Egreso #${egreso.id}: "${cc}" — sin proyecto coincidente, se deja igual.`);
      sinMatch++;
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`   • ${actualizados} egresos corregidos`);
  console.log(`   • ${sinCambio} ya tenían nombre correcto`);
  console.log(`   • ${sinMatch} sin coincidencia (sin cambio)`);

  process.exit(0);
}

fixCentroCostos().catch(e => { console.error("❌ Error:", e); process.exit(1); });
