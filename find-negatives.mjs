import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function findNegativeHours() {
  await client.connect();
  
  const badHorometros = await client.query(`
    SELECT j.id, to_char(j.fecha, 'YYYY-MM-DD') as fecha, e.nombre || ' ' || e.apellido as operario, m.nombre as maquina, 
           j.horometro_inicio, j.horometro_fin, j.hora_inicio, j.hora_fin,
           (j.horometro_fin::numeric - j.horometro_inicio::numeric) as diff_horometro
    FROM jornadas j
    LEFT JOIN empleados e ON j.empleado_id = e.id
    LEFT JOIN maquinas m ON j.maquina_id = m.id
    WHERE j.horometro_inicio IS NOT NULL AND j.horometro_fin IS NOT NULL
      AND (j.horometro_fin::numeric < j.horometro_inicio::numeric)
    ORDER BY j.id DESC
  `);

  console.log('JORNADAS CON HORÓMETRO FIN MENOR A INICIO:');
  console.table(badHorometros.rows);

  await client.end();
}

findNegativeHours().catch(console.error);
