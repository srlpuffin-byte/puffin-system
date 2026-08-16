import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function checkJornadas() {
  await client.connect();
  const res = await client.query("SELECT id, fecha, empleado_id, maquina_id, hora_inicio, hora_fin, horometro_inicio, horometro_fin, km_inicio, km_fin, estado FROM jornadas ORDER BY id DESC LIMIT 20");
  console.log('JORNADAS RECIENTES (Horómetros y Horas):');
  console.table(res.rows);
  await client.end();
}

checkJornadas().catch(console.error);
