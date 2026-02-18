export interface Puesto {
  id: string;
  name: string;
  address: string;
  mesas: number;
}

export interface Municipio {
  id: string;
  name: string;
  puestos: Puesto[];
}

export interface Departamento {
  id: string;
  name: string;
  municipios: Municipio[];
}

export const COLOMBIA_DATA: Departamento[] = [
  {
    id: "05",
    name: "Antioquia",
    municipios: [
      {
        id: "001",
        name: "Medellín",
        puestos: [
          { id: "01", name: "Colegio Mayor de Antioquia", address: "Cl 65 # 77-12", mesas: 45 },
          { id: "02", name: "Universidad EAFIT", address: "Cra 49 # 7 Sur-50", mesas: 60 },
          { id: "03", name: "I.E. INEM José Félix de Restrepo", address: "Cra 48 # 1-125", mesas: 80 },
          { id: "04", name: "Unicentro Medellín", address: "Cra 66B # 34A-76", mesas: 35 },
          { id: "05", name: "Plaza Mayor", address: "Cl 41 # 55-80", mesas: 120 }
        ]
      },
      {
        id: "002",
        name: "Envigado",
        puestos: [
          { id: "06", name: "I.E. La Paz", address: "Cra 43A # 38 Sur", mesas: 25 },
          { id: "07", name: "Polideportivo Sur", address: "Av. Las Vegas", mesas: 50 }
        ]
      },
      {
        id: "003",
        name: "Bello",
        puestos: [
          { id: "08", name: "Choza Marco Fidel Suárez", address: "Parque Principal", mesas: 40 }
        ]
      }
    ]
  },
  {
    id: "11",
    name: "Bogotá D.C.",
    municipios: [
      {
        id: "001",
        name: "Bogotá",
        puestos: [
          { id: "09", name: "Corferias", address: "Cra 37 # 24-67", mesas: 450 },
          { id: "10", name: "Unicentro Bogotá", address: "Av. 15 # 124-30", mesas: 85 },
          { id: "11", name: "Plaza de Bolívar", address: "Cra 7 # 11-10", mesas: 60 },
          { id: "12", name: "Centro Comercial Calima", address: "Av. NQS # 19-02", mesas: 40 }
        ]
      }
    ]
  },
  {
    id: "76",
    name: "Valle del Cauca",
    municipios: [
      {
        id: "001",
        name: "Cali",
        puestos: [
          { id: "13", name: "Coliseo El Pueblo", address: "Cra 52 # 2-00", mesas: 90 },
          { id: "14", name: "Universidad del Valle", address: "Cl 13 # 100-00", mesas: 110 }
        ]
      }
    ]
  },
  {
    id: "08",
    name: "Atlántico",
    municipios: [
      {
        id: "001",
        name: "Barranquilla",
        puestos: [
          { id: "15", name: "Estadio Romelio Martínez", address: "Cra 46 # 72", mesas: 75 },
          { id: "16", name: "Colegio Biffi La Salle", address: "Cl 85 # 53-71", mesas: 45 }
        ]
      }
    ]
  }
];
