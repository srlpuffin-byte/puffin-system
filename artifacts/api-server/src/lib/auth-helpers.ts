import { db } from "@workspace/db";
import { usuariosTable, empleadosTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";

/**
 * Returns the empleado_id associated with a user ID by matching name and surname.
 * Returns -1 if no matching employee is found.
 */
export async function getEmpleadoIdForUser(userId: number): Promise<number> {
  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, userId)).limit(1);
  if (!usuario) return -1;
  
  const [empleado] = await db.select().from(empleadosTable)
    .where(
      and(
        ilike(empleadosTable.nombre, usuario.nombre),
        ilike(empleadosTable.apellido, usuario.apellido)
      )
    ).limit(1);
    
  return empleado ? empleado.id : -1;
}
