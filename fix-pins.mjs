import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + 'puffin-salt').digest('hex');
}

const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

const fixes = [
  { usuario: 'admin', pin: '1234' },
  { usuario: '27123456', pin: '27123456' },
  { usuario: '12345678', pin: '12345678' },
  { usuario: '34567890', pin: '34567890' },
  { usuario: '45678901', pin: '45678901' },
];

async function run() {
  await client.connect();
  for (const f of fixes) {
    const hash = hashPin(f.pin);
    const r = await client.query(
      'UPDATE usuarios SET pin_hash = $1, bloqueado = false, intentos_fallidos = 0 WHERE usuario = $2 RETURNING usuario',
      [hash, f.usuario]
    );
    console.log('Arreglado:', r.rows[0]?.usuario);
  }
  await client.end();
  console.log('Listo!');
}

run().catch(err => { console.error(err.message); process.exit(1); });
