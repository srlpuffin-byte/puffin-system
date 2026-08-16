import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function checkFotosSize() {
  await client.connect();
  const res = await client.query(`
    SELECT id, entidad_tipo, entidad_id, length(url) as url_len, substring(url, 1, 30) as url_preview 
    FROM fotografias 
    ORDER BY length(url) DESC 
    LIMIT 10
  `);
  console.log('FOTOGRAFIAS TOP TAMAÑOS:');
  console.table(res.rows);

  const totalSize = await client.query('SELECT sum(length(url)) as total_bytes, count(*) as count FROM fotografias');
  console.log('TOTAL FOTOGRAFIAS BYTES:', totalSize.rows[0]);

  await client.end();
}

checkFotosSize().catch(console.error);
