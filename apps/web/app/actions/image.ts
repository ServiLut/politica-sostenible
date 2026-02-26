"use server";

import sharp from 'sharp';

/**
 * Procesa una imagen en base64 para eliminar metadatos y recomprimirla por seguridad.
 * Utiliza la librería sharp para realizar el procesamiento en el servidor.
 */
export async function processImageAction(base64Data: string): Promise<string> {
  try {
    // Verificar si es una imagen y extraer los datos
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Data; // No es un formato base64 válido o no tiene prefijo
    }

    const contentType = matches[1];
    const base64Content = matches[2];

    // Solo procesamos imágenes
    if (!contentType.startsWith('image/')) {
      return base64Data;
    }

    const buffer = Buffer.from(base64Content, 'base64');

    // Procesamiento con sharp:
    // .rotate() sin argumentos auto-orienta la imagen basándose en EXIF antes de borrarlo
    // .keepMetadata() se evita para asegurar que se borren
    let pipeline = sharp(buffer).rotate();

    // Eliminar metadatos explícitamente (keepMetadata(false) es el default en versiones recientes)
    // pero por seguridad usamos un pipeline limpio
    
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      pipeline = pipeline.jpeg({ quality: 80, progressive: true, mozjpeg: true });
    } else if (contentType.includes('png')) {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else if (contentType.includes('webp')) {
      pipeline = pipeline.webp({ quality: 80 });
    } else {
      // Para otros formatos de imagen, simplemente los pasamos por el pipeline de sharp
      // lo que por defecto limpia metadatos.
    }

    const processedBuffer = await pipeline.toBuffer();
    return `data:${contentType};base64,${processedBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Error al procesar la imagen con sharp:', error);
    // Si falla el procesamiento (ej. sharp no instalado), devolvemos el original por seguridad operativa
    return base64Data;
  }
}
