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
      ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_seguro date;
      ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS vencimiento_vtv date;
    `);
    console.log("Successfully added columns!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
