export interface Coordinate {
  lat: number;
  lng: number;
}

export const MEDELLIN_COORDINATES: Record<string, Coordinate> = {
  // --- MUNICIPIOS ---
  "medellín": { lat: 6.2442, lng: -75.5812 },
  "bello": { lat: 6.3319, lng: -75.5581 },
  "itagüí": { lat: 6.1726, lng: -75.6096 },
  "envigado": { lat: 6.1719, lng: -75.5803 },
  "sabaneta": { lat: 6.1508, lng: -75.6150 },
  "la estrella": { lat: 6.1561, lng: -75.6414 },
  "caldas": { lat: 6.0911, lng: -75.6357 },
  "copacabana": { lat: 6.3486, lng: -75.5103 },
  "girardota": { lat: 6.3769, lng: -75.4461 },
  "barbosa": { lat: 6.4375, lng: -75.3306 },

  // --- COMUNAS MEDELLÍN (Nombres cortos para fallback) ---
  "popular": { lat: 6.2985, lng: -75.5482 },
  "santa cruz": { lat: 6.3015, lng: -75.5585 },
  "manrique": { lat: 6.2758, lng: -75.5452 },
  "aranjuez": { lat: 6.2825, lng: -75.5608 },
  "castilla": { lat: 6.2952, lng: -75.5755 },
  "doce de octubre": { lat: 6.2988, lng: -75.5885 },
  "robledo": { lat: 6.2755, lng: -75.5958 },
  "villa hermosa": { lat: 6.2512, lng: -75.5405 },
  "buenos aires": { lat: 6.2355, lng: -75.5458 },
  "la candelaria": { lat: 6.2458, lng: -75.5652 },
  "laureles": { lat: 6.2452, lng: -75.5905 },
  "estadio": { lat: 6.2545, lng: -75.5885 },
  "la américa": { lat: 6.2505, lng: -75.6052 },
  "san javier": { lat: 6.2508, lng: -75.6205 },
  "el poblado": { lat: 6.2052, lng: -75.5655 },
  "guayabal": { lat: 6.2105, lng: -75.5852 },
  "belén": { lat: 6.2305, lng: -75.6005 },

  // --- CORREGIMIENTOS ---
  "palmitas": { lat: 6.3425, lng: -75.6905 },
  "san cristóbal": { lat: 6.2805, lng: -75.6305 },
  "altavista": { lat: 6.2205, lng: -75.6405 },
  "antonio de prado": { lat: 6.1805, lng: -75.6505 },
  "santa elena": { lat: 6.2105, lng: -75.5005 },

  // --- BARRIOS Y SITIOS ---
  "provenza": { lat: 6.2092, lng: -75.5665 },
  "manila": { lat: 6.2132, lng: -75.5715 },
  "centro": { lat: 6.2458, lng: -75.5652 },
  "alpujarra": { lat: 6.2442, lng: -75.5692 }
};
