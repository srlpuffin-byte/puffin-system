import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "puffin-srl-secret-2024";

interface JwtPayload {
  userId: number;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; rol: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = { id: payload.userId, rol: payload.rol };
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Se requieren permisos de administrador" });
  }
  next();
}
