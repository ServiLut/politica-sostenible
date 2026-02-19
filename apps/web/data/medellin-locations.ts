export interface LocationOption {
  id: string;
  name: string;
  municipio: string;
  comuna: string;
}

export const MEDELLIN_LOCATIONS: LocationOption[] = [
  // --- MEDELLÍN (16 COMUNAS) ---
  { id: 'med-c1', municipio: 'Medellín', comuna: 'Comuna 1 Popular', name: 'Medellín - Comuna 1 Popular' },
  { id: 'med-c2', municipio: 'Medellín', comuna: 'Comuna 2 Santa Cruz', name: 'Medellín - Comuna 2 Santa Cruz' },
  { id: 'med-c3', municipio: 'Medellín', comuna: 'Comuna 3 Manrique', name: 'Medellín - Comuna 3 Manrique' },
  { id: 'med-c4', municipio: 'Medellín', comuna: 'Comuna 4 Aranjuez', name: 'Medellín - Comuna 4 Aranjuez' },
  { id: 'med-c5', municipio: 'Medellín', comuna: 'Comuna 5 Castilla', name: 'Medellín - Comuna 5 Castilla' },
  { id: 'med-c6', municipio: 'Medellín', comuna: 'Comuna 6 Doce de Octubre', name: 'Medellín - Comuna 6 Doce de Octubre' },
  { id: 'med-c7', municipio: 'Medellín', comuna: 'Comuna 7 Robledo', name: 'Medellín - Comuna 7 Robledo' },
  { id: 'med-c8', municipio: 'Medellín', comuna: 'Comuna 8 Villa Hermosa', name: 'Medellín - Comuna 8 Villa Hermosa' },
  { id: 'med-c9', municipio: 'Medellín', comuna: 'Comuna 9 Buenos Aires', name: 'Medellín - Comuna 9 Buenos Aires' },
  { id: 'med-c10', municipio: 'Medellín', comuna: 'Comuna 10 La Candelaria', name: 'Medellín - Comuna 10 La Candelaria' },
  { id: 'med-c11', municipio: 'Medellín', comuna: 'Comuna 11 Laureles-Estadio', name: 'Medellín - Comuna 11 Laureles-Estadio' },
  { id: 'med-c12', municipio: 'Medellín', comuna: 'Comuna 12 La América', name: 'Medellín - Comuna 12 La América' },
  { id: 'med-c13', municipio: 'Medellín', comuna: 'Comuna 13 San Javier', name: 'Medellín - Comuna 13 San Javier' },
  { id: 'med-c14', municipio: 'Medellín', comuna: 'Comuna 14 El Poblado', name: 'Medellín - Comuna 14 El Poblado' },
  { id: 'med-c15', municipio: 'Medellín', comuna: 'Comuna 15 Guayabal', name: 'Medellín - Comuna 15 Guayabal' },
  { id: 'med-c16', municipio: 'Medellín', comuna: 'Comuna 16 Belén', name: 'Medellín - Comuna 16 Belén' },

  // --- BELLO (11 COMUNAS) ---
  { id: 'bel-c1', municipio: 'Bello', comuna: 'Comuna 1 París', name: 'Bello - Comuna 1 París' },
  { id: 'bel-c2', municipio: 'Bello', comuna: 'Comuna 2 La Madera', name: 'Bello - Comuna 2 La Madera' },
  { id: 'bel-c3', municipio: 'Bello', comuna: 'Comuna 3 Santa Ana', name: 'Bello - Comuna 3 Santa Ana' },
  { id: 'bel-c4', municipio: 'Bello', comuna: 'Comuna 4 Suárez', name: 'Bello - Comuna 4 Suárez' },
  { id: 'bel-c5', municipio: 'Bello', comuna: 'Comuna 5 La Cumbre', name: 'Bello - Comuna 5 La Cumbre' },
  { id: 'bel-c6', municipio: 'Bello', comuna: 'Comuna 6 Bellavista', name: 'Bello - Comuna 6 Bellavista' },
  { id: 'bel-c7', municipio: 'Bello', comuna: 'Comuna 7 Altos de Niquía', name: 'Bello - Comuna 7 Altos de Niquía' },
  { id: 'bel-c8', municipio: 'Bello', comuna: 'Comuna 8 Niquía', name: 'Bello - Comuna 8 Niquía' },
  { id: 'bel-c9', municipio: 'Bello', comuna: 'Comuna 9 Guasimalito', name: 'Bello - Comuna 9 Guasimalito' },
  { id: 'bel-c10', municipio: 'Bello', comuna: 'Comuna 10 Quitasol', name: 'Bello - Comuna 10 Quitasol' },
  { id: 'bel-c11', municipio: 'Bello', comuna: 'Comuna 11 El Mirador', name: 'Bello - Comuna 11 El Mirador' },

  // --- ITAGÜÍ (6 COMUNAS) ---
  { id: 'ita-c1', municipio: 'Itagüí', comuna: 'Comuna 1', name: 'Itagüí - Comuna 1' },
  { id: 'ita-c2', municipio: 'Itagüí', comuna: 'Comuna 2', name: 'Itagüí - Comuna 2' },
  { id: 'ita-c3', municipio: 'Itagüí', comuna: 'Comuna 3', name: 'Itagüí - Comuna 3' },
  { id: 'ita-c4', municipio: 'Itagüí', comuna: 'Comuna 4', name: 'Itagüí - Comuna 4' },
  { id: 'ita-c5', municipio: 'Itagüí', comuna: 'Comuna 5', name: 'Itagüí - Comuna 5' },
  { id: 'ita-c6', municipio: 'Itagüí', comuna: 'Comuna 6', name: 'Itagüí - Comuna 6' },

  // --- ENVIGADO (13 ZONAS URBANAS) ---
  { id: 'env-c1', municipio: 'Envigado', comuna: 'Comuna 1', name: 'Envigado - Comuna 1' },
  { id: 'env-c2', municipio: 'Envigado', comuna: 'Comuna 2', name: 'Envigado - Comuna 2' },
  { id: 'env-c3', municipio: 'Envigado', comuna: 'Comuna 3', name: 'Envigado - Comuna 3' },
  { id: 'env-c4', municipio: 'Envigado', comuna: 'Comuna 4', name: 'Envigado - Comuna 4' },
  { id: 'env-c5', municipio: 'Envigado', comuna: 'Comuna 5', name: 'Envigado - Comuna 5' },
  { id: 'env-c6', municipio: 'Envigado', comuna: 'Comuna 6', name: 'Envigado - Comuna 6' },
  { id: 'env-c7', municipio: 'Envigado', comuna: 'Comuna 7', name: 'Envigado - Comuna 7' },
  { id: 'env-c8', municipio: 'Envigado', comuna: 'Comuna 8', name: 'Envigado - Comuna 8' },
  { id: 'env-c9', municipio: 'Envigado', comuna: 'Comuna 9', name: 'Envigado - Comuna 9' },

  // --- SABANETA (4 ZONAS URBANAS) ---
  { id: 'sab-c1', municipio: 'Sabaneta', comuna: 'Comuna 1', name: 'Sabaneta - Comuna 1' },
  { id: 'sab-c2', municipio: 'Sabaneta', comuna: 'Comuna 2', name: 'Sabaneta - Comuna 2' },
  { id: 'sab-c3', municipio: 'Sabaneta', comuna: 'Comuna 3', name: 'Sabaneta - Comuna 3' },
  { id: 'sab-c4', municipio: 'Sabaneta', comuna: 'Comuna 4', name: 'Sabaneta - Comuna 4' },

  // --- OTROS MUNICIPIOS ---
  { id: 'est-c1', municipio: 'La Estrella', comuna: 'Comuna 1', name: 'La Estrella - Comuna 1' },
  { id: 'est-c2', municipio: 'La Estrella', comuna: 'Comuna 2', name: 'La Estrella - Comuna 2' },
  { id: 'cal-c1', municipio: 'Caldas', comuna: 'Comuna 1', name: 'Caldas - Comuna 1' },
  { id: 'cop-c1', municipio: 'Copacabana', comuna: 'Comuna 1', name: 'Copacabana - Comuna 1' },
  { id: 'gir-c1', municipio: 'Girardota', comuna: 'Comuna 1', name: 'Girardota - Comuna 1' },
  { id: 'bar-c1', municipio: 'Barbosa', comuna: 'Comuna 1', name: 'Barbosa - Comuna 1' }
];
