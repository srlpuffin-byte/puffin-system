import { Router } from "express";
import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "puffin-salt").digest("hex");
}

router.get("/", async (req, res) => {
  try {
    const users = await db
      .select({
        id: usuariosTable.id,
        empresa_id: usuariosTable.empresa_id,
        nombre: usuariosTable.nombre,
        apellido: usuariosTable.apellido,
        usuario: usuariosTable.usuario,
        rol: usuariosTable.rol,
        activo: usuariosTable.activo,
        bloqueado: usuariosTable.bloqueado,
        intentos_fallidos: usuariosTable.intentos_fallidos,
      })
      .from(usuariosTable)
      .orderBy(usuariosTable.nombre);
    return res.json(users);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nombre, apellido, usuario, pin, rol } = req.body;
    if (!nombre || !apellido || !usuario || !pin) {
      return res.status(400).json({ error: "Campos requeridos: nombre, apellido, usuario, pin" });
    }
    const pinHash = hashPin(String(pin));
    const [created] = await db
      .insert(usuariosTable)
      .values({
        empresa_id: 1,
        nombre,
        apellido,
        usuario,
        pin_hash: pinHash,
        rol: rol || "empleado",
        activo: true,
        intentos_fallidos: 0,
        bloqueado: false,
      })
      .returning({
        id: usuariosTable.id,
        nombre: usuariosTable.nombre,
        apellido: usuariosTable.apellido,
        usuario: usuariosTable.usuario,
        rol: usuariosTable.rol,
        activo: usuariosTable.activo,
        bloqueado: usuariosTable.bloqueado,
      });
    return res.status(201).json(created);
  } catch (err: any) {
    req.log.error(err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "El nombre de usuario ya existe" });
    }
    return res.status(500).json({ error: "Error al crear usuario" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [user] = await db
      .select({
        id: usuariosTable.id,
        nombre: usuariosTable.nombre,
        apellido: usuariosTable.apellido,
        usuario: usuariosTable.usuario,
        rol: usuariosTable.rol,
        activo: usuariosTable.activo,
        bloqueado: usuariosTable.bloqueado,
        intentos_fallidos: usuariosTable.intentos_fallidos,
      })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, Number(req.params.id)));
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(user);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener usuario" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { nombre, apellido, rol, activo, bloqueado } = req.body;
    const updateData: Record<string, any> = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (rol !== undefined) updateData.rol = rol;
    if (activo !== undefined) updateData.activo = activo;
    if (bloqueado !== undefined) {
      updateData.bloqueado = bloqueado;
      if (bloqueado === false) updateData.intentos_fallidos = 0;
    }
    const [updated] = await db
      .update(usuariosTable)
      .set(updateData)
      .where(eq(usuariosTable.id, Number(req.params.id)))
      .returning({
        id: usuariosTable.id,
        nombre: usuariosTable.nombre,
        apellido: usuariosTable.apellido,
        usuario: usuariosTable.usuario,
        rol: usuariosTable.rol,
        activo: usuariosTable.activo,
        bloqueado: usuariosTable.bloqueado,
      });
    if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

router.post("/:id/reset-pin", async (req, res) => {
  try {
    const { nuevo_pin } = req.body;
    if (!nuevo_pin) return res.status(400).json({ error: "nuevo_pin es requerido" });
    const pinHash = hashPin(String(nuevo_pin));
    await db
      .update(usuariosTable)
      .set({ pin_hash: pinHash, intentos_fallidos: 0, bloqueado: false })
      .where(eq(usuariosTable.id, Number(req.params.id)));
    return res.json({ message: "PIN restablecido correctamente" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al restablecer PIN" });
  }
});

export default router;
