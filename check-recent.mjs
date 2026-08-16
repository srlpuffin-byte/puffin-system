import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function listEgresos() {
  await client.connect();
  const egresos = await client.query("SELECT id, to_char(fecha, 'YYYY-MM-DD') as fecha, categoria, concepto, monto, to_char(created_at, 'YYYY-MM-DD HH24:MI') as creado FROM egresos WHERE fecha >= '2026-08-14' OR created_at >= '2026-08-14' ORDER BY id");
  console.log('EGRESOS REGISTRADOS:');
  console.table(egresos.rows);
  await client.end();
}

listEgresos().catch(e => { console.error(e); process.exit(1); });
