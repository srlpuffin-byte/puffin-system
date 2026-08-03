import { db } from '@workspace/db';
import { empleadosTable, maquinasTable, proyectosTable, egresosTable, jornadasTable, combustibleTable, mantenimientosTable } from '@workspace/db/schema';
import { sql } from 'drizzle-orm';

async function findDuplicates() {
  console.log('--- Buscando duplicados ---');

  // Egresos (misma fecha, categoria, concepto, monto)
  const egresos = await db.select().from(egresosTable);
  const egresosMap = new Map();
  const egresosDups = [];
  for (const e of egresos) {
    const key = `${e.fecha}_${e.categoria}_${e.concepto}_${e.monto}`;
    if (egresosMap.has(key)) {
      egresosDups.push({ keep: egresosMap.get(key), remove: e.id, key });
    } else {
      egresosMap.set(key, e.id);
    }
  }
  console.log(`Egresos duplicados: ${egresosDups.length}`);

  // Empleados (mismo nombre y apellido o DNI)
  const empleados = await db.select().from(empleadosTable);
  const empleadosMap = new Map();
  const empleadosDups = [];
  for (const e of empleados) {
    const key = e.dni ? e.dni : `${e.nombre.toLowerCase()}_${e.apellido.toLowerCase()}`;
    if (empleadosMap.has(key)) {
      empleadosDups.push({ keep: empleadosMap.get(key), remove: e.id, key });
    } else {
      empleadosMap.set(key, e.id);
    }
  }
  console.log(`Empleados duplicados: ${empleadosDups.length}`);

  // Maquinas (mismo nombre)
  const maquinas = await db.select().from(maquinasTable);
  const maquinasMap = new Map();
  const maquinasDups = [];
  for (const m of maquinas) {
    const key = m.nombre.toLowerCase();
    if (maquinasMap.has(key)) {
      maquinasDups.push({ keep: maquinasMap.get(key), remove: m.id, key });
    } else {
      maquinasMap.set(key, m.id);
    }
  }
  console.log(`Máquinas duplicadas: ${maquinasDups.length}`);

  // Jornadas (mismo empleado, fecha)
  const jornadas = await db.select().from(jornadasTable);
  const jornadasMap = new Map();
  const jornadasDups = [];
  for (const j of jornadas) {
    const key = `${j.empleado_id}_${j.fecha}`;
    if (jornadasMap.has(key)) {
      jornadasDups.push({ keep: jornadasMap.get(key), remove: j.id, key });
    } else {
      jornadasMap.set(key, j.id);
    }
  }
  console.log(`Jornadas duplicadas: ${jornadasDups.length}`);

  // Combustible (mismo maquina, litros, fecha)
  const combustible = await db.select().from(combustibleTable);
  const combMap = new Map();
  const combDups = [];
  for (const c of combustible) {
    const key = `${c.maquina_id}_${c.litros}_${c.fecha}`;
    if (combMap.has(key)) {
      combDups.push({ keep: combMap.get(key), remove: c.id, key });
    } else {
      combMap.set(key, c.id);
    }
  }
  console.log(`Combustible duplicado: ${combDups.length}`);

  // Proyectos (mismo lugar)
  const proyectos = await db.select().from(proyectosTable);
  const proyMap = new Map();
  const proyDups = [];
  for (const p of proyectos) {
    const key = p.lugar.toLowerCase();
    if (proyMap.has(key)) {
      proyDups.push({ keep: proyMap.get(key), remove: p.id, key });
    } else {
      proyMap.set(key, p.id);
    }
  }
  console.log(`Proyectos duplicados: ${proyDups.length}`);
}

findDuplicates().catch(console.error);
