import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function verifyProductividadAndReportes() {
  await client.connect();
  
  const jornadas = await client.query("SELECT id, fecha, empleado_id, maquina_id, horometro_inicio, horometro_fin FROM jornadas");
  
  let totalHoras = 0;
  let conteoNegativos = 0;

  for (const j of jornadas.rows) {
    if (j.horometro_inicio && j.horometro_fin) {
      const ini = Number(j.horometro_inicio);
      const fin = Number(j.horometro_fin);
      const diff = fin - ini;
      if (diff < 0) {
        conteoNegativos++;
        console.log(`❌ Negativo en jornada ID ${j.id}: ${ini} -> ${fin} (diff: ${diff})`);
      } else {
        totalHoras += diff;
      }
    }
  }

  console.log('=== RESULTADO DE VERIFICACIÓN DE HORAS ===');
  console.log(`Total horas de operación calculadas: ${totalHoras.toFixed(1)} hs`);
  console.log(`Jornadas con diferencia negativa: ${conteoNegativos}`);

  await client.end();
}

verifyProductividadAndReportes().catch(console.error);
