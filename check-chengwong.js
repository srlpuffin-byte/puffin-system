const pg = require('pg');

const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_lHnNV9ut3AeY@ep-lively-glitter-att5xvg0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  console.log('Connected to DB');
  
  const res = await client.query('SELECT * FROM maquinas WHERE id IN (19, 20, 21) OR nombre ILIKE \'%chengwong%\' OR marca ILIKE \'%chengwong%\'');
  console.log('Result from DB:');
  console.log(res.rows);
  
  // also check auditoria table for these IDs
  const auditRes = await client.query('SELECT * FROM auditoria WHERE entidad = \'maquina\' AND entidad_id IN (19, 20, 21)');
  console.log('Audit records for these IDs:');
  console.log(auditRes.rows);
  
  await client.end();
}

run().catch(console.error);
