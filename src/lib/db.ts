import { Dexie, type EntityTable } from 'dexie';

interface OfflineUpload {
  id: number;
  personId: string;
  type: 'front' | 'back' | 'contact_capture';
  fileBase64: string; // Base64 image OR JSON string for data
  timestamp: number;
}

const db = new Dexie('CRM_Offline') as Dexie & {
  uploads: EntityTable<OfflineUpload, 'id'>;
};

// Version 1 is sufficient if we just expand the usage of existing columns
db.version(1).stores({
  uploads: '++id, personId, type'
});

export { db };