import Dexie, { Table } from 'dexie';

export interface FormE14 {
  id?: number;
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  totalTableVotes: number;
  e14ImageUrl: string;
  observations?: string;
  syncStatus: 'pending' | 'synced' | 'conflict';
  createdAt: number;
}

export interface NewSympathizer {
  id?: number;
  documentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  puestoId: string;
  syncStatus: 'pending' | 'synced';
  createdAt: number;
}

export class CampaignLocalDB extends Dexie {
  formsE14!: Table<FormE14>;
  newSympathizers!: Table<NewSympathizer>;

  constructor() {
    super('CampaignLocalDB');
    this.version(1).stores({
      formsE14: '++id, puestoId, syncStatus',
      newSympathizers: '++id, documentId, syncStatus',
    });
  }
}

export const db = new CampaignLocalDB();
