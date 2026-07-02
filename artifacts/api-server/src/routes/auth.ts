import { Router } from "express";
import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "puffin-srl-secret-2024";
const MAX_ATTEMPTS = 5;

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "puffin-salt").digest("hex");
}

function generateToken(userId: number, rol: string): string {
  return jwt.sign({ userId, rol }, JWT_SECRET, { expiresIn: "8h" });
}

router.post("/login", async (req, res) => {
  const { usuario, pin } = req.body;

  if (!usuario || !pin) {
    return res.status(400).json({ error: "Usuario y PIN son requeridos" });
  }

  const [user] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.usuario, usuario))
    .limit(1);

  if (!user) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  if (user.bloqueado) {
    return res.status(401).json({ error: "Usuario bloqueado. Contacte al administrador." });
  }

  const pinHash = hashPin(pin);
  if (pinHash !== user.pin_hash) {
    const newAttempts = (user.intentos_fallidos || 0) + 1;
    const bloqueado = newAttempts >= MAX_ATTEMPTS;
    await db
      .update(usuariosTable)
      .set({ intentos_fallidos: newAttempts, bloqueado })
      .where(eq(usuariosTable.id, user.id));
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  await db
    .update(usuariosTable)
    .set({ intentos_fallidos: 0 })
    .where(eq(usuariosTable.id, user.id));

  const token = generateToken(user.id, user.rol);

  return res.json({
    token,
    refreshToken: token,
    usuario: {
      id: user.id,
      empresa_id: user.empresa_id,
      nombre: user.nombre,
      apellido: user.apellido,
      usuario: user.usuario,
      rol: user.rol,
      activo: user.activo,
    },
  });
});

router.post("/logout", async (_req, res) => {
  res.json({ message: "Sesión cerrada" });
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const [user] = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.id, payload.userId))
      .limit(1);

    if (!user) return res.status(401).json({ error: "No autorizado" });

    return res.json({
      id: user.id,
      empresa_id: user.empresa_id,
      nombre: user.nombre,
      apellido: user.apellido,
      usuario: user.usuario,
      rol: user.rol,
      activo: user.activo,
    });
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
});

export default router;
