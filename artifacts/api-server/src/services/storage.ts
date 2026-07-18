import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

// En un entorno de producción, usamos Cloudinary si está configurado.
// Mantenemos la carpeta local como fallback o compatibilidad temporal.
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configurar Cloudinary (usará automáticamente process.env.CLOUDINARY_URL si existe)
cloudinary.config({
  secure: true
});

/**
 * Guarda un archivo base64 en Cloudinary y devuelve la URL absoluta (secure_url).
 * Si no está configurado Cloudinary, usa el almacenamiento local.
 */
export async function uploadImage(filename: string, base64Data: string): Promise<string> {
  const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  // Usar Cloudinary si la URL está configurada
  if (process.env.CLOUDINARY_URL) {
    try {
      // Cloudinary necesita el formato data URI (data:image/xxx;base64,...)
      const dataUri = base64Data.includes(';base64,') 
        ? base64Data 
        : `data:image/jpeg;base64,${base64Data}`;

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        public_id: safeFilename.split('.')[0], // Usar nombre de archivo base sin extensión
        folder: 'puffin-system', // Carpeta dentro de Cloudinary
      });
      
      return uploadResult.secure_url;
    } catch (error) {
      console.error('Error al subir imagen a Cloudinary:', error);
      throw new Error('Error al subir la imagen a Cloudinary');
    }
  }

  // Fallback: Guardar directamente como Base64 (Data URI) en la base de datos
  // Esto evita problemas de archivos perdidos en entornos serverless/efímeros (como Vercel/Railway)
  // sin depender del file system local.
  const dataUri = base64Data.includes(';base64,') 
    ? base64Data 
    : `data:image/jpeg;base64,${base64Data}`;
    
  return dataUri;
}
