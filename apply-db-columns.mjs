import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function runMissingMigrations() {
  await client.connect();
  console.log('Conectado a la base de datos de Railway...');

  console.log('Agregando columna ultimo_login y columnas faltantes...');
  await client.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login timestamp;
    ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono_whatsapp text;
    ALTER TABLE empleados ADD COLUMN IF NOT EXISTS vencimiento_carnet date;
    ALTER TABLE empleados ADD COLUMN IF NOT EXISTS recibir_alertas_whatsapp boolean DEFAULT false;
    ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_seguro date;
    ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_vtv date;
  `);

  console.log('✅ Columnas agregadas exitosamente.');
  await client.end();
}

runMissingMigrations().catch(console.error);
