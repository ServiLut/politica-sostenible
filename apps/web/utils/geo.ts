import { MEDELLIN_ZONES } from '@/data/medellin-geo';

export interface Coordinate {
  lat: number;
  lng: number;
}

/**
 * Finds the geographic coordinates for a given location name.
 * @param locationName The name of the location to search for.
 * @returns A coordinate object { lat, lng } or null if no match is found.
 */
export function getCoordsForLocation(locationName: string): Coordinate | null {
  if (!locationName) {
    return null;
  }

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '') // Keep hyphens
      .trim();

  const normalizedLocation = normalize(locationName);
  // Ignore short/common words that might add noise
  const locationWords = new Set(normalizedLocation.split(' ').filter(w => w.length > 1 && !['comuna', 'el'].includes(w)));

  if (locationWords.size === 0) return null;

  const candidates = MEDELLIN_ZONES.map(zone => {
    const normalizedZoneName = normalize(zone.name);
    const zoneWords = new Set(normalizedZoneName.split(' '));
    
    let score = 0;
    for (const word of locationWords) {
      if (zoneWords.has(word)) {
        score++;
      }
    }
    
    return { zone, score };
  })
  .filter(c => c.score > 0) 
  .sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const bestScore = candidates[0].score;
    // As a tie-breaker, prefer the match with the name length closest to our input
    const tieBreakers = candidates.filter(c => c.score === bestScore)
                                  .sort((a,b) => 
                                    Math.abs(normalize(a.zone.name).length - normalizedLocation.length) - 
                                    Math.abs(normalize(b.zone.name).length - normalizedLocation.length)
                                  );

    const winningZone = tieBreakers[0].zone;
    if (winningZone.lat !== undefined && winningZone.lng !== undefined) {
      return { lat: winningZone.lat, lng: winningZone.lng };
    }
  }

  return null;
}
