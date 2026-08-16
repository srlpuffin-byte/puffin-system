async function benchmarkEndpoints() {
  const loginRes = await fetch('https://workspaceapi-server-production-b689.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: '42787017', pin: '42787017' })
  });
  const { token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}` };

  const endpoints = [
    '/api/auth/me',
    '/api/dashboard/resumen',
    '/api/maquinas',
    '/api/empleados',
    '/api/jornadas',
    '/api/combustible',
    '/api/mantenimientos',
    '/api/egresos',
    '/api/proyectos',
    '/api/usuarios',
    '/api/productividad',
    '/api/reportes/resumen'
  ];

  console.log('=== TIEMPOS DE RESPUESTA DEL SERVIDOR RAILWAY ===');
  for (const ep of endpoints) {
    const t0 = performance.now();
    const res = await fetch(`https://workspaceapi-server-production-b689.up.railway.app${ep}`, { headers });
    const t1 = performance.now();
    const size = (await res.text()).length;
    console.log(`${ep.padEnd(25)}: ${Math.round(t1 - t0)} ms | Status: ${res.status} | Size: ${Math.round(size / 1024)} KB`);
  }
}

benchmarkEndpoints().catch(console.error);
