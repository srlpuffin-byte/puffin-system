import { db } from "@workspace/db";
import { actividadTable, maquinasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function run() {
  const actividades = await db.select().from(actividadTable);
  const maquinas = await db.select().from(maquinasTable);
  const maquinaMap = new Map(maquinas.map(m => [m.id, m.nombre]));

  let count = 0;
  for (const act of actividades) {
    const desc = act.descripcion || "";
    if (desc.includes("en máquina ID ")) {
      const parts = desc.split("en máquina ID ");
      const idStr = parts[1].split(" ")[0];
      const id = parseInt(idStr);
      if (!isNaN(id)) {
        const nombre = maquinaMap.get(id);
        if (nombre) {
          const newDesc = desc.replace(`en máquina ID ${id}`, `en la máquina ${nombre}`);
          await db.update(actividadTable).set({ descripcion: newDesc }).where(eq(actividadTable.id, act.id));
          count++;
        }
      }
    }
  }
  console.log(`Updated ${count} actividades`);
  process.exit(0);
}

run().catch(console.error);
