/// <reference lib="webworker" />
import { db } from '@/lib/db'; // Dexie instance logic (mocked import for SW context)

// Configuration for Exponential Backoff
const SYNC_CONFIG = {
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // 1 second
  MAX_DELAY: 60000 // 1 minute cap
};

/**
 * Service Worker Background Sync Handler.
 * Listens for 'sync' events tagged 'sync-evidence'.
 */
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-evidence') {
    event.waitUntil(processEvidenceQueue());
  }
});

/**
 * Main Sync Loop
 * Drains the IndexedDB 'outbox' queue.
 */
async function processEvidenceQueue() {
  const pendingRecords = await getPendingRecordsFromDB(); // Helper wrapper around Dexie

  for (const record of pendingRecords) {
    try {
      await uploadWithBackoff(record);
      await markRecordAsSynced(record.id);
      
      // Notify UI clients (Open tabs)
      notifyClients({ type: 'SYNC_SUCCESS', id: record.id });
      
    } catch (error) {
      console.error(`Sync failed for ${record.id}`, error);
      // We don't delete from DB. We let the next sync event retry.
      // Or we can increment a local retry counter in DB here.
    }
  }
}

/**
 * Upload Logic with Exponential Backoff
 * Tries to send the FormData. If 50x error or Network Error, retries locally.
 */
async function uploadWithBackoff(record: any) {
  let attempt = 0;
  
  while (attempt < SYNC_CONFIG.MAX_RETRIES) {
    try {
      const formData = new FormData();
      formData.append('file', record.photoBlob);
      formData.append('metadata', JSON.stringify(record.metadata));
      
      // The API must return a signed ACK (e.g., JWT or Cryptographic Hash)
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
        headers: { 'X-Sync-Attempt': attempt.toString() }
      });

      if (!response.ok) {
        // 4xx errors are fatal (Bad Request), don't retry.
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Fatal Upload Error: ${response.status}`);
        }
        // 5xx errors: Throw to trigger retry
        throw new Error('Server Error');
      }

      // STRICT RULE: Validate ACK
      const ack = await response.json();
      if (!ack.success || !ack.serverSignature) {
        throw new Error('Invalid Server ACK');
      }
      
      return ack; // Success!

    } catch (error: any) {
      attempt++;
      if (attempt >= SYNC_CONFIG.MAX_RETRIES) throw error; // Give up for this cycle
      
      // Wait before next attempt: 2^n * 1000ms + Jitter
      const delay = Math.min(
        SYNC_CONFIG.BASE_DELAY * Math.pow(2, attempt) + (Math.random() * 500), 
        SYNC_CONFIG.MAX_DELAY
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// --- Helpers Mockups for Context ---
async function getPendingRecordsFromDB() {
  // Real implementation uses Dexie: await db.e14Records.where('syncStatus').equals('PENDING').toArray();
  return []; 
}
async function markRecordAsSynced(id: string) {
  // await db.e14Records.update(id, { syncStatus: 'SYNCED', syncedAt: Date.now() });
}
async function notifyClients(msg: any) {
  const clients = await (self as any).clients.matchAll();
  clients.forEach((client: any) => client.postMessage(msg));
}
