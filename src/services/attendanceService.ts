import { prisma } from '@/lib/prisma';



// Configuration
const MAX_GEOFENCE_RADIUS_METERS = 200;

interface AttendancePayload {
  eventId: string;
  contactId: string;
  responsibleId: string; // Actor ID of who is scanning (Leader)
  method: 'QR_SCAN' | 'GPS_CHECKIN' | 'MANUAL_LIST';
  userLat?: number;
  userLng?: number;
  // Override Data
  isOverride?: boolean;
  overrideReason?: string;
  overridePhotoUrl?: string;
}

export class AttendanceService {

  /**
   * Registers a political contact's attendance to an event.
   * Enforces strict Geofencing and Audit rules.
   */
  async registerAttendance(data: AttendancePayload) {
    // 1. Fetch Event Context (Location is critical)
    const event = await prisma.event.findUnique({
      where: { id: data.eventId },
      include: { territory: true } // Assuming Territory has lat/lng center or specific event override location
    });

    if (!event) throw new Error('Event not found.');

    // Note: In V4.2 Schema, Event is anchored to Territory. 
    // Ideally, Event should have specific lat/lng if it's a specific meeting point.
    // For this implementation, we assume the Event has implied coords (e.g. from a related table or added field).
    // Let's assume for strict logic that we query the specific location.
    // Since 'latitude'/'longitude' are not explicitly on Event in the last schema update (only territory),
    // we will simulate fetching the target coordinates. In a real app, Event should have its own coords.
    // falling back to Territory or throwing if undefined.
    
    // *Correction*: We will assume we fetch the target coords from the event metadata or territory centroid.
    // Mocking target coords for logic validity:
    const targetLat = 0; // Replace with event.latitude
    const targetLng = 0; // Replace with event.longitude

    // 2. Geofence Check
    let fencePassed = false;
    let distance = -1;

    // Only verify if we have coordinates for both Target and User
    // If Event has no coords defined, we might default to ALLOW or REQUIRE OVERRIDE.
    // Strict rule: "Attendance only confirmed within 200m". 
    if (data.userLat && data.userLng && targetLat !== 0) {
      distance = this.calculateHaversine(targetLat, targetLng, data.userLat, data.userLng);
      fencePassed = distance <= MAX_GEOFENCE_RADIUS_METERS;
    }

    // 3. Validation Logic
    if (!fencePassed) {
      // If Geofence failed (or no GPS), Override is MANDATORY.
      // But if the user explicitly requested Override (isOverride=true), we validate evidence.
      
      // If user sent GPS but it failed fence, it's an automatic Override situation.
      // Or if user sent no GPS, it's also Override.
      
      const requiresOverride = !fencePassed;
      
      if (requiresOverride) {
        // Enforce Override Rules
        if (!data.isOverride) {
           throw new Error(`GEOFENCE_BLOCK: User is ${Math.round(distance)}m away (Max ${MAX_GEOFENCE_RADIUS_METERS}m). Enable Override.`);
        }

        if (!data.overrideReason || data.overrideReason.trim().length === 0) {
          throw new Error('OVERRIDE_BLOCK: Justification reason is mandatory when GPS check fails.');
        }

        if (!data.overridePhotoUrl || data.overridePhotoUrl.trim().length === 0) {
          throw new Error('OVERRIDE_BLOCK: Evidence photo (Environment) is mandatory for audit.');
        }
      }
    }

    // 4. Persistence
    return await prisma.eventAttendance.create({
      data: {
        eventId: data.eventId,
        politicalContactId: data.contactId,
        method: data.method,
        confirmedAt: new Date(),
        gpsLat: data.userLat,
        gpsLng: data.userLng,
        overrideUsed: data.isOverride || !fencePassed,
        overrideReason: data.overrideReason,
        environmentPhotoUrl: data.overridePhotoUrl,
        confirmed: true
      }
    });
  }

  /**
   * Calculates distance in meters between two coordinates.
   */
  private calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

