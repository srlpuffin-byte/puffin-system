import { db } from "./artifacts/api-server/node_modules/@workspace/db/index.js";
import { proyectosTable } from "./artifacts/api-server/node_modules/@workspace/db/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  const proys = await db.select().from(proyectosTable).limit(1);
  if (!proys.length) return;
  const p = proys[0];
  console.log("Antes:", p.empleados_asignados);
  await db.update(proyectosTable).set({ empleados_asignados: [] }).where(eq(proyectosTable.id, p.id));
  const proys2 = await db.select().from(proyectosTable).where(eq(proyectosTable.id, p.id));
  console.log("Despues:", proys2[0].empleados_asignados);
}
run().catch(console.error);
