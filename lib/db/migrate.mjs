import pg from 'pg';
try {
  const dotenv = await import('dotenv');
  dotenv.default.config({ path: '.env' });
} catch (e) {
  // dotenv is not available, assuming environment variables are already set (like on Vercel)
}
const { Client } = pg;

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.warn("No DATABASE_URL or POSTGRES_URL provided. Skipping migration during build.");
    process.exit(0);
  }
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log("Connected to Neon db.");
    
    await client.query(`
      ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono_whatsapp text;
      ALTER TABLE empleados ADD COLUMN IF NOT EXISTS vencimiento_carnet date;
      ALTER TABLE empleados ADD COLUMN IF NOT EXISTS recibir_alertas_whatsapp boolean DEFAULT false;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login timestamp;
      ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_seguro date;
      ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_vtv date;
      
      -- Indices para Combustible
      CREATE INDEX IF NOT EXISTS combustible_fecha_idx ON combustible (fecha);
      CREATE INDEX IF NOT EXISTS combustible_empleado_idx ON combustible (empleado_id);
      CREATE INDEX IF NOT EXISTS combustible_maquina_idx ON combustible (maquina_id);

      -- Indices para Mantenimientos
      CREATE INDEX IF NOT EXISTS mantenimientos_fecha_idx ON mantenimientos (fecha);
      CREATE INDEX IF NOT EXISTS mantenimientos_empleado_idx ON mantenimientos (empleado_id);
      CREATE INDEX IF NOT EXISTS mantenimientos_maquina_idx ON mantenimientos (maquina_id);

      -- Indices para Incidentes
      CREATE INDEX IF NOT EXISTS incidentes_fecha_idx ON incidentes (fecha);
      CREATE INDEX IF NOT EXISTS incidentes_empleado_idx ON incidentes (empleado_id);
      CREATE INDEX IF NOT EXISTS incidentes_maquina_idx ON incidentes (maquina_id);

      -- Indices para Egresos
      CREATE INDEX IF NOT EXISTS egresos_fecha_idx ON egresos (fecha);
      CREATE INDEX IF NOT EXISTS egresos_categoria_idx ON egresos (categoria);
    `);
    console.log("Successfully added columns and indexes!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
