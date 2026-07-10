import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_lHnNV9ut3AeY@ep-lively-glitter-att5xvg0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + 'puffin-salt').digest('hex');
}

async function seed() {
  await client.connect();
  console.log('Conectado a la base de datos...');

  // 1. Crear empresa si no existe
  const empresa = await client.query(`
    INSERT INTO empresas (nombre, ruc, pais, plan)
    VALUES ('PUFFIN SRL', '20-12345678-9', 'Argentina', 'enterprise')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  
  let empresaId = 1;
  if (empresa.rows.length > 0) {
    empresaId = empresa.rows[0].id;
    console.log('Empresa creada con ID:', empresaId);
  } else {
    const r = await client.query('SELECT id FROM empresas LIMIT 1');
    empresaId = r.rows[0]?.id || 1;
    console.log('Empresa ya existe, ID:', empresaId);
  }

  // 2. Crear usuario admin
  const pinHash = hashPin('1234');
  const result = await client.query(`
    INSERT INTO usuarios (empresa_id, nombre, apellido, usuario, pin_hash, rol, activo)
    VALUES ($1, 'Administrador', 'Sistema', 'admin', $2, 'admin', true)
    ON CONFLICT (usuario) DO UPDATE SET pin_hash = $2, activo = true
    RETURNING id, usuario, rol
  `, [empresaId, pinHash]);
  
  console.log('Usuario admin creado/actualizado:', result.rows[0]);

  await client.end();
  console.log('Listo!');
}

seed().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
