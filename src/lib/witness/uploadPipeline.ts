import { db } from '@/lib/db'; // Asumiendo la instancia de Dexie creada anteriormente
import { v4 as uuidv4 } from 'uuid';

export interface E14CaptureContext {
  votingTableId: string;
  witnessActorId: string;
  electionId: string;
}

export interface GeoLocationResult {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  justification?: string; // Si no se pudo obtener GPS o se hizo override
}

/**
 * Orchestrates the E-14 capture flow for low-end devices.
 */
export class WitnessUploadPipeline {
  
  /**
   * 1. IMAGE SHARPNESS VALIDATOR
   * Fast, client-side blur detection using a downsampled canvas.
   * Returns a score (0-1). Scores < 0.15 are likely blurry.
   */
  async validateImageQuality(file: File): Promise<{ isSharp: boolean; score: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ isSharp: true, score: 1 }); // Fail open if canvas not supported

        // Downsample heavily for performance (max 300px width)
        const scale = Math.min(1, 300 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Simple Laplacian variance approximation (Edge detection)
        let edgeScore = 0;
        let pixelCount = 0;

        // Stride 4 (RGBA) * 2 (Skip pixels for speed)
        for (let i = 0; i < data.length - 4; i += 8) {
          const current = data[i];     // R channel is usually sufficient for brightness contrast
          const next = data[i + 4];
          
          if (Math.abs(current - next) > 15) {
            edgeScore++;
          }
          pixelCount++;
        }

        const score = edgeScore / pixelCount;
        URL.revokeObjectURL(url);
        
        // Threshold tweaked for photos of paper documents
        resolve({ isSharp: score > 0.05, score });
      };

      img.onerror = () => resolve({ isSharp: false, score: 0 });
      img.src = url;
    });
  }

  /**
   * 2. GEOLOCATION CAPTURE
   * Attempts to get high-accuracy GPS. If it fails or is rejected,
   * it allows proceeding ONLY with a justification text.
   */
  async captureLocation(allowOverride: boolean = false): Promise<GeoLocationResult> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        if (allowOverride) return resolve({ latitude: null, longitude: null, accuracy: null, justification: 'DEVICE_NO_GPS' });
        return reject(new Error('GPS_NOT_SUPPORTED'));
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Success
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => {
          // Error
          if (allowOverride) {
            // UI should prompt user for text input if this returns specific flag
            return resolve({ latitude: null, longitude: null, accuracy: null, justification: 'SIGNAL_ERROR_' + err.code });
          }
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  /**
   * 3. OFFLINE STORAGE (The "Commit")
   * Saves to IndexedDB immediately. The SyncEngine picks this up later.
   */
  async commitEvidence(
    file: File, 
    context: E14CaptureContext, 
    location: GeoLocationResult,
    overrideJustification?: string
  ) {
    const recordId = uuidv4();

    // Prepare the payload strictly typed to our DB schema
    const record = {
      id: recordId,
      electionId: context.electionId,
      tableId: context.votingTableId,
      
      // Blob storage (Dexie handles this efficiently)
      photoBlob: file, 
      
      // Metadata injection
      metadata: {
        witnessActorId: context.witnessActorId,
        capturedAt: new Date().toISOString(),
        gps: location,
        overrideJustification: overrideJustification || location.justification,
        deviceInfo: navigator.userAgent
      },

      // Sync State
      syncStatus: 'PENDING',
      createdAt: Date.now(),
      retryCount: 0
    };

    // Atomic write to IndexedDB
    // @ts-ignore - DB instance would be typed in real app
    await db.e14Records.add(record);

    return recordId;
  }
}
