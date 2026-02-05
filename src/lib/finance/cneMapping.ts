// Official CNE Account Codes (Simulated for Colombia)
// Based on "Cuentas Claras" structure.

export const CNE_CATEGORY_MAP: Record<string, string> = {
  // Alimentos y Bebidas
  'FOOD_SNACK': '5.1.04.01', // Refrigerios
  'FOOD_LUNCH': '5.1.04.02', // Almuerzos logística
  'HYDRATION': '5.1.04.03',  // Hidratación
  
  // Transporte
  'TRANSPORT_BUS': '5.1.03.01',  // Transporte terrestre masivo
  'TRANSPORT_TAXI': '5.1.03.02', // Transporte individual
  'FUEL': '5.1.03.05',           // Combustible
  
  // Logística y Publicidad
  'LOGISTICS_SOUND': '5.1.05.01', // Alquiler sonido
  'LOGISTICS_CHAIRS': '5.1.05.02', // Alquiler sillas
  'AD_PRINT': '5.1.01.01',         // Publicidad impresa (Volantes)
  
  // Otros
  'OTHER': '5.1.99.00'
};

export const getCneCode = (uiCategory: string): string => {
  return CNE_CATEGORY_MAP[uiCategory] || '5.1.99.00'; // Default to "Other"
};
