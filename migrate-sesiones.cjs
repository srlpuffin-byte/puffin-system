const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://neondb_owner:npg_lHnNV9ut3AeY@ep-lively-glitter-att5xvg0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require' 
});

pool.query(`
  CREATE TABLE IF NOT EXISTS whatsapp_sesiones (
    phone TEXT PRIMARY KEY,
    messages JSONB NOT NULL DEFAULT '[]',
    estado TEXT NOT NULL DEFAULT 'idle',
    datos_pendientes JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => { 
  console.log('✅ Tabla whatsapp_sesiones creada correctamente'); 
  pool.end(); 
}).catch(e => { 
  console.error('❌ Error:', e.message); 
  pool.end(); 
});
