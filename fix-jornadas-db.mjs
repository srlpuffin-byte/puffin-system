import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function fixJornadas() {
  await client.connect();
  console.log('Conectado a la base de datos de Railway...');

  // Jornada 19: inicio 8.2, fin 12.3 (4.1 hs trabajadas)
  await client.query("UPDATE jornadas SET horometro_inicio = '8.2', horometro_fin = '12.3' WHERE id = 19");
  console.log('Jornada 19 corregida: 8.2 -> 12.3 (4.1 hs)');

  // Jornada 15: inicio 0.0, fin 7.1 (7.1 hs trabajadas)
  await client.query("UPDATE jornadas SET horometro_inicio = '0.0', horometro_fin = '7.1' WHERE id = 15");
  console.log('Jornada 15 corregida: 0.0 -> 7.1 (7.1 hs)');

  // Jornada 13: inicio 700.0, fin 710.5 (10.5 hs trabajadas)
  await client.query("UPDATE jornadas SET horometro_inicio = '700.0', horometro_fin = '710.5' WHERE id = 13");
  console.log('Jornada 13 corregida: 700.0 -> 710.5 (10.5 hs)');

  // Jornada 8: inicio 14.0, fin 14.1 (0.1 hs)
  await client.query("UPDATE jornadas SET horometro_inicio = '14.0', horometro_fin = '14.1' WHERE id = 8");
  console.log('Jornada 8 corregida: 14.0 -> 14.1 (0.1 hs)');

  // Jornada 6: inicio 2374.4, fin 2383.9 (9.5 hs trabajadas)
  await client.query("UPDATE jornadas SET horometro_inicio = '2374.4', horometro_fin = '2383.9' WHERE id = 6");
  console.log('Jornada 6 corregida: 2374.4 -> 2383.9 (9.5 hs)');

  console.log('Verificando si queda alguna jornada con horómetro negativo...');
  const check = await client.query(`
    SELECT id, fecha, horometro_inicio, horometro_fin, (horometro_fin::numeric - horometro_inicio::numeric) as diff
    FROM jornadas
    WHERE horometro_inicio IS NOT NULL AND horometro_fin IS NOT NULL
      AND (horometro_fin::numeric < horometro_inicio::numeric)
  `);

  if (check.rows.length === 0) {
    console.log('✅ EXCELENTE: 0 jornadas con horas negativas.');
  } else {
    console.log('⚠️ Aún quedan:', check.rows);
  }

  await client.end();
}

fixJornadas().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
