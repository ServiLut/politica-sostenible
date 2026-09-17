const fs = require('fs');
const path = './apps/api/prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

function addIndex(modelName, indexStr) {
  const modelStart = content.indexOf('model ' + modelName + ' {');
  if (modelStart === -1) {
    console.log('Model not found:', modelName);
    return;
  }
  const modelEnd = content.indexOf('}', modelStart);
  const modelContent = content.substring(modelStart, modelEnd);
  
  if (modelContent.includes(indexStr)) {
    console.log('Index already exists in', modelName, ':', indexStr);
    return;
  }
  
  const lastNewline = content.lastIndexOf('\n', modelEnd);
  content = content.substring(0, lastNewline) + '\n  ' + indexStr + content.substring(lastNewline);
  console.log('Added index to', modelName, ':', indexStr);
}

addIndex('FinancialEntry', '@@index([reporterId])');
addIndex('IssueCase', '@@index([createdById])');
addIndex('Task', '@@index([createdById])');
addIndex('ConsentRecord', '@@index([capturedById])');
addIndex('CommunicationApproval', '@@index([requestedById])');
addIndex('CommunicationApproval', '@@index([decidedById])');
addIndex('PoliticalProposal', '@@index([ownerId])');
addIndex('PoliticalProposal', '@@index([createdById])');
addIndex('PqrsdDossier', '@@index([createdById])');
addIndex('Interaction', '@@index([actorId])');
addIndex('WitnessAssignment', '@@index([createdById])');
addIndex('Tenant', '@@index([parentTenantId])');
addIndex('OperationProfile', '@@index([createdById])');
addIndex('ScrutinyCommission', '@@index([createdById])');
addIndex('ScrutinyCommission', '@@index([scopeDivisionId])');
addIndex('PqrsdDocument', '@@index([createdById])');
addIndex('FinanceReportDossier', '@@index([createdById])');
addIndex('Commitment', '@@index([issueCaseId])');

addIndex('PointLog', '@@unique([id, tenantId])');
addIndex('Interaction', '@@unique([id, tenantId])');
addIndex('CommunicationApproval', '@@unique([id, tenantId])');
addIndex('AuditEvent', '@@unique([id, tenantId])');
addIndex('OfflineSyncReceipt', '@@unique([id, tenantId])');
addIndex('OfflineE14CaptureGrantPlace', '@@unique([id, tenantId])');
addIndex('TerritoryLeader', '@@unique([id, tenantId])');
addIndex('ElectronicSignature', '@@unique([id, tenantId])');

fs.writeFileSync(path, content, 'utf8');