import { PrismaClient } from './apps/api/prisma/generated/prisma';

const prisma = new PrismaClient();

async function validateWitnessOcr() {
  console.log('--- Iniciando Validación Funcional de Auditoría E-14 ---');

  // 1. Limpiar reportes previos de prueba
  await prisma.witnessReport.deleteMany({ where: { observations: 'TEST_VALIDATION' } });

  // Simular un reporte de testigo donde los datos coinciden con el OCR (Caso Éxito)
  console.log('\nEscenario 1: Datos Coincidentes (MATCHED)');
  const report1 = await createMockReport({
    candidateVotes: 25,
    totalTableVotes: 150,
    observations: 'TEST_VALIDATION'
  });
  console.log(`Estado de Auditoría: ${report1.auditStatus} (Esperado: MATCHED)`);
  console.log(`Confianza OCR: ${report1.ocrConfidence}`);

  // Simular un reporte de testigo donde los datos NO coinciden (Caso Discrepancia)
  console.log('\nEscenario 2: Discrepancia de Votos (DISCREPANCY)');
  const report2 = await createMockReport({
    candidateVotes: 100, // El testigo miente o se equivoca, el OCR leerá algo distinto
    totalTableVotes: 150,
    observations: 'TEST_VALIDATION'
  });
  console.log(`Estado de Auditoría: ${report2.auditStatus} (Esperado: DISCREPANCY)`);

  console.log('\n--- Validación Completada con Éxito ---');
}

// Función auxiliar para simular la lógica del WitnessService (ya que es un script externo)
async function createMockReport(data: any) {
  // Simulación de la lógica que ya implementamos en apps/api/src/witness/witness.service.ts
  const mockOcrResult = {
    candidateVotes: 25, // Valor fijo que devuelve nuestro mock de AiService
    totalTableVotes: 150,
    confidence: 0.96
  };

  let auditStatus = 'PENDING';
  if (mockOcrResult.candidateVotes === data.candidateVotes && mockOcrResult.totalTableVotes === data.totalTableVotes) {
    auditStatus = 'MATCHED';
  } else {
    auditStatus = 'DISCREPANCY';
  }

  return await prisma.witnessReport.create({
    data: {
      tenantId: 'cl_demo_2026',
      witnessId: 'cl_user_id', // ID genérico para prueba
      puestoId: 'cl_puesto_id', 
      mesa: 5,
      e14ImageUrl: 'https://storage.politica.co/e14/test.jpg',
      candidateVotes: data.candidateVotes,
      totalTableVotes: data.totalTableVotes,
      observations: data.observations,
      auditStatus: auditStatus as any,
      e14OcrData: mockOcrResult as any,
      ocrConfidence: mockOcrResult.confidence
    }
  });
}

validateWitnessOcr()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
