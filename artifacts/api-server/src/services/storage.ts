import fs from 'fs';
import path from 'path';

// En un entorno de producción, esto debería apuntar a un volumen persistente o S3/Supabase.
// Como se solicitó, por ahora usamos almacenamiento local.
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Guarda un archivo base64 o buffer localmente y devuelve la URL relativa.
 * En el futuro, esta función se puede reemplazar por Supabase Storage.
 */
export async function uploadImage(filename: string, base64Data: string): Promise<string> {
  const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = path.join(UPLOADS_DIR, safeFilename);
  
  // Limpiar encabezado base64 si existe (ej. data:image/jpeg;base64,...)
  const base64Image = base64Data.split(';base64,').pop();
  
  if (!base64Image) {
    throw new Error('Formato base64 inválido');
  }

  await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
  
  // Devuelve la URL para acceder a la imagen (el servidor express debe servir /uploads)
  return `/uploads/${safeFilename}`;
}
