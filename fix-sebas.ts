import dotenv from "dotenv";
dotenv.config({ path: "./artifacts/api-server/.env" });
import { db } from "./lib/db/src/index.ts";
import { proyectosTable, empleadosTable } from "./lib/db/src/schema/index.ts";
import { eq } from "drizzle-orm";

async function run() {
  const [emp] = await db.select().from(empleadosTable).where(eq(empleadosTable.nombre, "Sebas")).limit(1);
  if (!emp) {
    console.log("No encontre a Sebas");
    return;
  }
  
  const [proy] = await db.select().from(proyectosTable).where(eq(proyectosTable.id, 7)).limit(1);
  if (!proy) {
    console.log("No encontre el proyecto 7");
    return;
  }
  
  const empIds = (proy.empleados_asignados || []).map(Number);
  const newEmpIds = empIds.filter(id => id !== emp.id);
  await db.update(proyectosTable).set({ empleados_asignados: newEmpIds }).where(eq(proyectosTable.id, 7));
  
  console.log("Sebas (ID: " + emp.id + ") eliminado del proyecto 7. Antes tenia: " + empIds.length + " empleados, ahora: " + newEmpIds.length);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
