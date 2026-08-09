import { Router } from "express";
import { db } from "@workspace/db";
import { maquinasTable, fotografiasTable, proyectosTable } from "@workspace/db";
import { eq, and, or, ilike, inArray } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets.js";

const router = Router();

// DEBUG TEMPORAL - Remover después de diagnosticar
router.get("/debug-proyectos-map", async (req, res) => {
  const proyectos = await db.select({ 
    id: proyectosTable.id, 
    lugar: proyectosTable.lugar, 
    maquinas_asignadas: proyectosTable.maquinas_asignadas 
  }).from(proyectosTable);

  const mapEntries: any[] = [];
  proyectos.forEach(p => {
    if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
      p.maquinas_asignadas.forEach((mId: any) => {
        mapEntries.push({ 
          proyectoId: p.id, 
          lugar: p.lugar, 
          maquinaIdRaw: mId, 
          maquinaIdType: typeof mId, 
          maquinaIdAsNumber: Number(mId) 
        });
      });
    }
  });

  return res.json({ 
    proyectos: proyectos.map(p => ({
      id: p.id,
      lugar: p.lugar,
      maquinas_asignadas: p.maquinas_asignadas,
      maquinas_asignadas_type: typeof p.maquinas_asignadas,
      isArray: Array.isArray(p.maquinas_asignadas)
    })),
    mapEntries 
  });
});

router.get("/sync-sheet", async (req, res) => {
  const { google } = await import("googleapis");
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return res.status(500).json({ error: "No credentials" });
  
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const maquinas = await db.select().from(maquinasTable).orderBy(maquinasTable.id);

  const headers = ["ID", "Categoría", "Nombre", "Tipo", "Marca", "Modelo", "Patente/Dominio", "Estado"];
  const rows = maquinas.map(m => [
    m.id,
    m.categoria === "inventario" ? "Inventario" : "Maquinaria",
    m.nombre,
    m.tipo,
    m.marca || "",
    m.modelo || "",
    m.patente || m.dominio || "",
    m.estado || ""
  ]);

  const allData = [headers, ...rows];

  await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Maquinarias!A:Z" });
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Maquinarias!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: allData },
  });

  return res.json({ success: true, rowsCount: rows.length });
});

router.get("/", async (req, res) => {
  const { estado, categoria, search } = req.query as { estado?: string; categoria?: string; search?: string };

  let query = db.select().from(maquinasTable).$dynamic();
  const conditions = [];
  if (estado) conditions.push(eq(maquinasTable.estado, estado));
  if (categoria) conditions.push(eq(maquinasTable.categoria, categoria));
  if (search) conditions.push(or(
    ilike(maquinasTable.nombre, `%${search}%`),
    ilike(maquinasTable.codigo, `%${search}%`),
    ilike(maquinasTable.tipo, `%${search}%`),
    ilike(maquinasTable.patente, `%${search}%`)
  ));
  if (conditions.length) query = query.where(and(...conditions));

  // Ejecutar las 3 consultas en paralelo para máxima velocidad
  const [maquinas, fotografias, proyectos] = await Promise.all([
    query.orderBy(maquinasTable.nombre),
    db.select({ entidad_id: fotografiasTable.entidad_id, url: fotografiasTable.url })
      .from(fotografiasTable)
      .where(eq(fotografiasTable.entidad_tipo, "maquina")),
    db.select({ id: proyectosTable.id, lugar: proyectosTable.lugar, maquinas_asignadas: proyectosTable.maquinas_asignadas })
      .from(proyectosTable),
  ]);

  const maquinasIds = new Set(maquinas.map(m => m.id));

  const fotografiasMap = new Map<number, string>();
  fotografias.forEach(f => {
    if (maquinasIds.has(f.entidad_id) && !fotografiasMap.has(f.entidad_id)) {
      fotografiasMap.set(f.entidad_id, f.url);
    }
  });

  const maquinasProyectoMap = new Map<number, { id: number; lugar: string }>();
  proyectos.forEach(p => {
    if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
      p.maquinas_asignadas.forEach((mId: any) => {
        maquinasProyectoMap.set(Number(mId), { id: p.id, lugar: p.lugar });
      });
    }
  });

  return res.json(maquinas.map(m => ({ 
    ...m, 
    horometro: Number(m.horometro), 
    kilometros: Number(m.kilometros),
    imagen_url: fotografiasMap.get(m.id) || null,
    proyecto: maquinasProyectoMap.get(Number(m.id)) || null
  })));
});

router.post("/", async (req, res) => {
  const { codigo, categoria, nombre, tipo, marca, modelo, anio, patente, dominio, chasis, motor, horometro, kilometros, filtro_tipo, filtro_codigo, filtro_fecha_cambio, filtro_proximo_cambio, descripcion, satcom_id } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: "Nombre y tipo son requeridos" });
  const [maquina] = await db.insert(maquinasTable).values({
    codigo, categoria: categoria || "maquinaria", nombre, tipo, marca, modelo, anio, patente, dominio, chasis, motor,
    filtro_tipo, filtro_codigo, filtro_fecha_cambio, filtro_proximo_cambio, descripcion,
    satcom_id: satcom_id || null,
    horometro: horometro?.toString() || "0",
    kilometros: kilometros?.toString() || "0",
    estado: "activa"
  }).returning();

  import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
    syncAllSheets().catch(console.error);
  });

  return res.status(201).json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [maquina] = await db.select().from(maquinasTable).where(eq(maquinasTable.id, id)).limit(1);
  if (!maquina) return res.status(404).json({ error: "Maquinaria no encontrada" });
  return res.json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { 
      nombre, estado, horometro, kilometros, proximo_service,
      codigo, tipo, marca, modelo, anio, patente, dominio, categoria,
      motor,
      chasis,
      descripcion,
      filtro_tipo, filtro_codigo, filtro_fecha_cambio, filtro_proximo_cambio,
      satcom_id
    } = req.body;
    
    const updateData: Record<string, unknown> = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (estado !== undefined) updateData.estado = estado;
    if (horometro !== undefined) updateData.horometro = horometro.toString();
    if (kilometros !== undefined) updateData.kilometros = kilometros.toString();
    if (proximo_service !== undefined) updateData.proximo_service = proximo_service;
    
    if (codigo !== undefined) updateData.codigo = codigo;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (marca !== undefined) updateData.marca = marca;
    if (modelo !== undefined) updateData.modelo = modelo;
    if (anio !== undefined) updateData.anio = anio;
    if (patente !== undefined) updateData.patente = patente;
    if (dominio !== undefined) updateData.dominio = dominio;
    if (chasis !== undefined) updateData.chasis = chasis;
    if (motor !== undefined) updateData.motor = motor;
    if (categoria !== undefined) updateData.categoria = categoria;
    
    if (filtro_tipo !== undefined) updateData.filtro_tipo = filtro_tipo;
    if (filtro_codigo !== undefined) updateData.filtro_codigo = filtro_codigo;
    if (filtro_fecha_cambio !== undefined) updateData.filtro_fecha_cambio = filtro_fecha_cambio;
    if (filtro_proximo_cambio !== undefined) updateData.filtro_proximo_cambio = filtro_proximo_cambio;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    // satcom_id can be set to null (unlink) or a number (link/relink)
    if (satcom_id !== undefined) updateData.satcom_id = satcom_id === null ? null : Number(satcom_id);

    const [maquina] = await db.update(maquinasTable).set(updateData).where(eq(maquinasTable.id, id)).returning();
    if (!maquina) return res.status(404).json({ error: "Maquinaria no encontrada" });

    // Sincronizar con Google Sheets
    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar máquina: " + (err?.message || "Error interno") });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    // Ensure it exists first
    const [existing] = await db.select().from(maquinasTable).where(eq(maquinasTable.id, id));
    if (!existing) {
      return res.status(404).json({ error: "Máquina no encontrada" });
    }

    // Soft delete instead of hard delete to preserve historical integrity
    await db.update(maquinasTable).set({ estado: "baja" }).where(eq(maquinasTable.id, id));

    // Remove from assigned projects
    const proyectos = await db.select().from(proyectosTable);
    for (const p of proyectos) {
      if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
        const mAsig = p.maquinas_asignadas.map(m => Number(m));
        if (mAsig.includes(id)) {
          const nuevasMaquinas = p.maquinas_asignadas.filter(m => Number(m) !== id);
          await db.update(proyectosTable).set({ maquinas_asignadas: nuevasMaquinas }).where(eq(proyectosTable.id, p.id));
        }
      }
    }

    // Sincronizar con Google Sheets
    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.json({ success: true });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al eliminar máquina: " + (err?.message || "Error interno") });
  }
});

export default router;
