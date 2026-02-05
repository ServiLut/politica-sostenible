import { prisma } from '@/lib/prisma';



// Haversine Formula for Distance (km)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

export class TransportPredictor {
    
    static async calculateNeeds(electionId: string) {
        // Get all contacts with polling place assigned
        const contacts = await prisma.electoralContact.findMany({
            where: {
                electionId,
                pollingPlaceId: { not: null },
                homeLat: { not: null }
            },
            include: { pollingPlace: true }
        });

        let updates = 0;

        for (const c of contacts) {
            if (c.homeLat && c.homeLng && c.pollingPlace?.lat && c.pollingPlace?.lng) {
                const dist = getDistanceFromLatLonInKm(
                    Number(c.homeLat), Number(c.homeLng),
                    Number(c.pollingPlace.lat), Number(c.pollingPlace.lng)
                );

                const need = dist >= 1.0 ? 'REQUIERE TRANSPORTE' : 'CAMINANTE';
                
                // Only update if changed
                if (c.transportNeed !== need) {
                    await prisma.electoralContact.update({
                        where: { id: c.id },
                        data: { 
                            transportNeed: need,
                            distanceMeters: Math.round(dist * 1000)
                        }
                    });
                    updates++;
                }
            }
        }
        
        return updates;
    }
}

