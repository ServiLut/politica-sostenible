import { createClient } from '@supabase/supabase-js';

// Cliente Supabase robusto con Service Role para bypass de RLS en servidor
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null as any;

/**
 * Sube un archivo al bucket 'e14' (Hardcoded para evitar errores de 'Bucket not found')
 * Retorna la URL pública del objeto.
 */
export async function uploadToStorage(
    file: any, 
    path: string, 
    _contentType?: string, // Ignorado, se deriva del archivo o se maneja por SDK
    _bucket?: string       // Ignorado para forzar 'e14' como se solicitó
) {
  if (!supabase) {
    console.error("❌ Supabase client not initialized. Check environment variables.");
    throw new Error("Storage client not initialized");
  }
  try {
    // 1. FORZAMOS EL NOMBRE 'e14' AQUÍ MISMO
    const bucketName = 'e14'; 

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error("❌ Error Supabase Interno:", error);
      throw error;
    }

    // 2. Construir URL pública
    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return publicData.publicUrl;

  } catch (err) {
    console.error("🔥 Error CRÍTICO en uploadToStorage:", err);
    throw err;
  }
}

/**
 * Genera una URL firmada para acceso temporal a archivos.
 */
export async function getSignedUrl(path: string, bucket: string = 'e14', expiresIn: number = 3600): Promise<string> {
    if (!supabase) {
        console.error("❌ Supabase client not initialized.");
        return '';
    }
    try {
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn);
            
        if (error) {
            console.error("Error creating signed URL:", error);
            return '';
        }
        
        return data.signedUrl;
    } catch (err) {
        console.error("🔥 Error en getSignedUrl:", err);
        return '';
    }
}