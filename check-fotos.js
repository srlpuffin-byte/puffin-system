const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_lHnNV9ut3AeY@ep-lively-glitter-att5xvg0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  await client.connect();

  console.log("=== FOTOS EN BASE DE DATOS ===");
  const fotos = await client.query("SELECT entidad_tipo, entidad_id, descripcion, LEFT(url, 60) as url_preview FROM fotografias ORDER BY entidad_tipo, entidad_id");
  console.log("Total fotos:", fotos.rows.length);
  console.table(fotos.rows);

  console.log("\n=== JORNADAS RECIENTES (empleado_id, maquina_id) ===");
  const jornadas = await client.query("SELECT id, empleado_id, maquina_id, fecha FROM jornadas ORDER BY id DESC LIMIT 10");
  console.table(jornadas.rows);

  console.log("\n=== PROYECTOS Y MAQUINAS ASIGNADAS ===");
  const proyectos = await client.query("SELECT id, nombre, lugar, maquinas_asignadas FROM proyectos");
  console.table(proyectos.rows);

  await client.end();
}
run().catch(console.error);
