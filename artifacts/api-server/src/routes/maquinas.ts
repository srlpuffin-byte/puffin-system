import { Router } from "express";
import { db } from "@workspace/db";
import { maquinasTable } from "@workspace/db";
import { eq, and, or, ilike } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets.js";

const router = Router();

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

  const maquinas = await query.orderBy(maquinasTable.nombre);
  return res.json(maquinas.map(m => ({ ...m, horometro: Number(m.horometro), kilometros: Number(m.kilometros) })));
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

  // Sincronizar con Google Sheets
  await updateOrAppendToSheet("Maquinarias", [
    maquina.id,
    maquina.categoria === "inventario" ? "Inventario" : "Maquinaria",
    maquina.nombre,
    maquina.tipo,
    maquina.marca || "",
    maquina.modelo || "",
    maquina.patente || maquina.dominio || "",
    maquina.estado
  ], 0, maquina.id);

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
      codigo, tipo, marca, modelo, anio, patente, dominio, chasis, motor,
      filtro_tipo, filtro_codigo, filtro_fecha_cambio, filtro_proximo_cambio, descripcion
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
    
    if (filtro_tipo !== undefined) updateData.filtro_tipo = filtro_tipo;
    if (filtro_codigo !== undefined) updateData.filtro_codigo = filtro_codigo;
    if (filtro_fecha_cambio !== undefined) updateData.filtro_fecha_cambio = filtro_fecha_cambio;
    if (filtro_proximo_cambio !== undefined) updateData.filtro_proximo_cambio = filtro_proximo_cambio;
    if (descripcion !== undefined) updateData.descripcion = descripcion;

    const [maquina] = await db.update(maquinasTable).set(updateData).where(eq(maquinasTable.id, id)).returning();
    if (!maquina) return res.status(404).json({ error: "Maquinaria no encontrada" });

    // Sincronizar con Google Sheets
    await updateOrAppendToSheet("Maquinarias", [
      maquina.id,
      maquina.categoria === "inventario" ? "Inventario" : "Maquinaria",
      maquina.nombre,
      maquina.tipo,
      maquina.marca || "",
      maquina.modelo || "",
      maquina.patente || maquina.dominio || "",
      maquina.estado
    ], 0, maquina.id);

    return res.json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar máquina: " + (err?.message || "Error interno") });
  }
});

export default router;
