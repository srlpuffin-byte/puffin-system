import pg from 'pg';

const { Client } = pg;
const client = new Client({ 
  connectionString: 'postgresql://postgres:HQptqSOQnmmHXkPaHxQpbDllGZEMybmH@hayabusa.proxy.rlwy.net:38062/railway',
  ssl: { rejectUnauthorized: false }
});

async function createPerformanceIndexes() {
  await client.connect();
  console.log('Conectado a PostgreSQL en Railway...');

  console.log('Creando índices de alto rendimiento...');
  await client.query(`
    -- Indices para Combustible
    CREATE INDEX IF NOT EXISTS idx_combustible_fecha ON combustible (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_combustible_empleado ON combustible (empleado_id);
    CREATE INDEX IF NOT EXISTS idx_combustible_maquina ON combustible (maquina_id);

    -- Indices para Jornadas
    CREATE INDEX IF NOT EXISTS idx_jornadas_fecha ON jornadas (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_jornadas_empleado ON jornadas (empleado_id);
    CREATE INDEX IF NOT EXISTS idx_jornadas_maquina ON jornadas (maquina_id);
    CREATE INDEX IF NOT EXISTS idx_jornadas_estado ON jornadas (estado);

    -- Indices para Egresos
    CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON egresos (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_egresos_categoria ON egresos (categoria);
    CREATE INDEX IF NOT EXISTS idx_egresos_centro_costos ON egresos (centro_costos);

    -- Indices para Mantenimientos
    CREATE INDEX IF NOT EXISTS idx_mantenimientos_fecha ON mantenimientos (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_mantenimientos_maquina ON mantenimientos (maquina_id);

    -- Indices para Fotografias
    CREATE INDEX IF NOT EXISTS idx_fotografias_entidad ON fotografias (entidad_tipo, entidad_id);

    -- Indices para Usuarios y Empleados
    CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios (usuario);
    CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios (activo, bloqueado);
    CREATE INDEX IF NOT EXISTS idx_empleados_estado ON empleados (estado);
    CREATE INDEX IF NOT EXISTS idx_maquinas_estado ON maquinas (estado, categoria);
  `);

  console.log('✅ Todos los índices creados exitosamente en PostgreSQL.');
  await client.end();
}

createPerformanceIndexes().catch(console.error);
