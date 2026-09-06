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
  
  // Detectar si es un documento PDF
  const isPdf = filename.toLowerCase().endsWith('.pdf') || 
                base64Data.includes('application/pdf') || 
                base64Data.startsWith('JVBERi') ||
                (base64Data.includes(';base64,') && base64Data.split(';base64,')[1].trim().startsWith('JVBERi'));

  const dataUri = base64Data.includes(';base64,') 
    ? base64Data 
    : (isPdf ? `data:application/pdf;base64,${base64Data}` : `data:image/jpeg;base64,${base64Data}`);

  // Usar Cloudinary si la URL está configurada
  if (process.env.CLOUDINARY_URL) {
    try {
      const baseName = safeFilename.split('.')[0];
      const uploadOptions: any = {
        folder: 'puffin-system',
      };

      if (isPdf) {
        // En Cloudinary, los PDFs se manejan como 'raw' o 'auto' con formato y extensión explícita
        uploadOptions.resource_type = 'raw';
        uploadOptions.public_id = `${baseName}.pdf`;
      } else {
        uploadOptions.resource_type = 'auto';
        uploadOptions.public_id = baseName;
      }

      const uploadResult = await cloudinary.uploader.upload(dataUri, uploadOptions);
      
      let finalUrl = uploadResult.secure_url || uploadResult.url;
      // Asegurar que las URLs de PDF terminen con .pdf para correcta detección en el visor
      if (isPdf && finalUrl && !finalUrl.toLowerCase().endsWith('.pdf')) {
        finalUrl = `${finalUrl}.pdf`;
      }
      return finalUrl;
    } catch (error) {
      console.error('Error al subir imagen a Cloudinary, usando fallback Data URI:', error);
      // Fallback: si falla Cloudinary, no perder el comprobante y guardarlo directo como Data URI
      return dataUri;
    }
  }

  // Fallback: Guardar directamente como Base64 (Data URI) en la base de datos
  // Esto evita problemas de archivos perdidos en entornos serverless/efímeros
  return dataUri;
}
