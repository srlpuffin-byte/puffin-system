import "dotenv/config";
import { db } from '@workspace/db';
import { empleadosTable, maquinasTable, proyectosTable, egresosTable, jornadasTable, combustibleTable, mantenimientosTable } from '@workspace/db/schema';
import { inArray } from 'drizzle-orm';
import { syncAllSheets } from '../src/services/sync-sheets.js';

async function cleanupDuplicates() {
  console.log('=== Iniciando limpieza profunda de duplicados ===');
  let totalEliminados = 0;

  try {
    // 1. Egresos
    const egresos = await db.select().from(egresosTable);
    const egresosMap = new Map();
    const egresosRemove = [];
    for (const e of egresos) {
      const key = `${e.fecha}_${e.categoria}_${e.concepto}_${e.monto}`;
      if (egresosMap.has(key)) {
        egresosRemove.push(e.id);
      } else {
        egresosMap.set(key, e.id);
      }
    }
    if (egresosRemove.length > 0) {
      console.log(`Borrando ${egresosRemove.length} egresos duplicados...`);
      await db.delete(egresosTable).where(inArray(egresosTable.id, egresosRemove));
      totalEliminados += egresosRemove.length;
    }

    // 2. Empleados
    const empleados = await db.select().from(empleadosTable);
    const empleadosMap = new Map();
    const empleadosRemove = [];
    const sortedEmpleados = [...empleados].sort((a, b) => {
      const scoreA = Object.values(a).filter(v => v !== null && v !== "").length;
      const scoreB = Object.values(b).filter(v => v !== null && v !== "").length;
      return scoreB - scoreA;
    });
    
    for (const e of sortedEmpleados) {
      const key = e.dni ? e.dni : `${e.nombre.toLowerCase()}_${e.apellido.toLowerCase()}`;
      if (empleadosMap.has(key)) {
        empleadosRemove.push(e.id);
      } else {
        empleadosMap.set(key, e.id);
      }
    }
    if (empleadosRemove.length > 0) {
      console.log(`Borrando ${empleadosRemove.length} empleados duplicados...`);
      await db.delete(empleadosTable).where(inArray(empleadosTable.id, empleadosRemove));
      totalEliminados += empleadosRemove.length;
    }

    // 3. Maquinas
    const maquinas = await db.select().from(maquinasTable);
    const maquinasMap = new Map();
    const maquinasRemove = [];
    for (const m of maquinas) {
      const key = m.nombre.toLowerCase().trim();
      if (maquinasMap.has(key)) {
        maquinasRemove.push(m.id);
      } else {
        maquinasMap.set(key, m.id);
      }
    }
    if (maquinasRemove.length > 0) {
      console.log(`Borrando ${maquinasRemove.length} máquinas duplicadas...`);
      await db.delete(maquinasTable).where(inArray(maquinasTable.id, maquinasRemove));
      totalEliminados += maquinasRemove.length;
    }

    // 4. Jornadas
    const jornadas = await db.select().from(jornadasTable);
    const jornadasMap = new Map();
    const jornadasRemove = [];
    for (const j of jornadas) {
      const key = `${j.empleado_id}_${j.fecha}_${j.nombre_obra}`;
      if (jornadasMap.has(key)) {
        jornadasRemove.push(j.id);
      } else {
        jornadasMap.set(key, j.id);
      }
    }
    if (jornadasRemove.length > 0) {
      console.log(`Borrando ${jornadasRemove.length} jornadas duplicadas...`);
      await db.delete(jornadasTable).where(inArray(jornadasTable.id, jornadasRemove));
      totalEliminados += jornadasRemove.length;
    }

    // 5. Combustible
    const combustible = await db.select().from(combustibleTable);
    const combMap = new Map();
    const combRemove = [];
    for (const c of combustible) {
      const key = `${c.maquina_id}_${c.empleado_id}_${c.litros}_${c.fecha}`;
      if (combMap.has(key)) {
        combRemove.push(c.id);
      } else {
        combMap.set(key, c.id);
      }
    }
    if (combRemove.length > 0) {
      console.log(`Borrando ${combRemove.length} cargas de combustible duplicadas...`);
      await db.delete(combustibleTable).where(inArray(combustibleTable.id, combRemove));
      totalEliminados += combRemove.length;
    }

    // 6. Mantenimientos
    const mantenimientos = await db.select().from(mantenimientosTable);
    const mantMap = new Map();
    const mantRemove = [];
    for (const m of mantenimientos) {
      const key = `${m.maquina_id}_${m.tipo}_${m.fecha}`;
      if (mantMap.has(key)) {
        mantRemove.push(m.id);
      } else {
        mantMap.set(key, m.id);
      }
    }
    if (mantRemove.length > 0) {
      console.log(`Borrando ${mantRemove.length} mantenimientos duplicados...`);
      await db.delete(mantenimientosTable).where(inArray(mantenimientosTable.id, mantRemove));
      totalEliminados += mantRemove.length;
    }

    // 7. Proyectos
    const proyectos = await db.select().from(proyectosTable);
    const proyMap = new Map();
    const proyRemove = [];
    for (const p of proyectos) {
      const key = p.lugar.toLowerCase().trim();
      if (proyMap.has(key)) {
        proyRemove.push(p.id);
      } else {
        proyMap.set(key, p.id);
      }
    }
    if (proyRemove.length > 0) {
      console.log(`Borrando ${proyRemove.length} proyectos duplicados...`);
      await db.delete(proyectosTable).where(inArray(proyectosTable.id, proyRemove));
      totalEliminados += proyRemove.length;
    }

    console.log(`=== Total de registros eliminados: ${totalEliminados} ===`);

    if (totalEliminados > 0) {
      console.log('🔄 Sincronizando todos los cambios con Google Sheets...');
      await syncAllSheets();
      console.log('✅ Sincronización completa. Base de datos y Google Sheets están alineados.');
    } else {
      console.log('✅ No había registros duplicados. El sistema ya está limpio.');
    }

  } catch (err) {
    console.error('❌ Error durante la limpieza:', err);
  }
}

cleanupDuplicates().then(() => process.exit(0));
