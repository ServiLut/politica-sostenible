/**
 * Enhanced GPS Capture Service for Evidence Layer.
 * Handles High Accuracy attempts and "Justified Override" flow.
 */

export interface GpsResult {
  success: boolean;
  coords?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  error?: string;
  requiresOverride?: boolean;
}

export class EvidenceGeoService {
  
  /**
   * Attempts to get high-accuracy GPS within a strict timeout.
   * If it fails (timeout/error), it signals the UI to enable "Override Mode".
   */
  async capturePosition(timeoutMs = 15000): Promise<GpsResult> {
    if (!navigator.geolocation) {
      return { success: false, error: 'GPS_NOT_SUPPORTED', requiresOverride: true };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ 
          success: false, 
          error: 'TIMEOUT_IN_BASEMENT', // Signal for UI: "Estás en un sótano?"
          requiresOverride: true 
        });
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          // Audit: Check accuracy. If > 50m, consider it "weak" but usable with warning.
          resolve({
            success: true,
            coords: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            }
          });
        },
        (err) => {
          clearTimeout(timer);
          // Common error in rural Colombia: Timeout or PositionUnavailable
          resolve({
            success: false,
            error: `GPS_ERROR_${err.code}`,
            requiresOverride: true
          });
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs + 1000, // Native timeout slight buffer
          maximumAge: 0 // Force fresh reading
        }
      );
    });
  }

  /**
   * Validates the "Override Evidence".
   * If GPS failed, user MUST take a photo of the environment (e.g., school entrance).
   */
  validateOverrideEvidence(environmentPhotoBlob: Blob | null): boolean {
    // Simple check: exists and has size. 
    // In real app, could run blur check here too.
    return !!environmentPhotoBlob && environmentPhotoBlob.size > 10000;
  }
}
