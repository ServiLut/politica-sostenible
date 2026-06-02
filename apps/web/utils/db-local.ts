
// Simple IndexedDB wrapper for large CRM data storage
const DB_NAME = 'PoliticalCRM_DB';
const DB_VERSION = 1;
const STORE_NAME = 'crm_data';

export const dbLocal = {
  _getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const db = await this._getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => {
          resolve(request.result !== undefined ? request.result : defaultValue);
        };
        request.onerror = () => resolve(defaultValue);
      });
    } catch (e) {
      console.warn('DB read error, falling back to default', e);
      return defaultValue;
    }
  },

  async setItem(key: string, value: any): Promise<void> {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('DB write error', e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('DB delete error', e);
    }
  }
};
