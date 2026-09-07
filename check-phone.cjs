const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway'
});

async function main() {
  await pool.query("UPDATE whatsapp_sesiones SET estado = 'idle', datos_pendientes = '{\"bot_paused\": false}'::jsonb WHERE phone = '5493472629600'");
  console.log("✅ Bot despausado correctamente para 5493472629600");

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
