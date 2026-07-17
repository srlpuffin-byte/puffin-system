const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_lHnNV9ut3AeY@ep-lively-glitter-att5xvg0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  await client.connect();
  const res = await client.query('SELECT id, url, entidad_id FROM fotografias WHERE entidad_id=33');
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
