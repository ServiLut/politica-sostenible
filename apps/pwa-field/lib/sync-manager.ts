import { db } from './db';

/**
 * SyncManager se encarga de subir los datos guardados localmente
 * cuando se detecta una conexión a internet.
 */
export class SyncManager {
  /**
   * Ejecuta la sincronización de registros con estado 'pending'.
   */
  static async syncPendingData() {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;

    console.log('🔄 Iniciando sincronización de datos pendientes...');

    // 1. Sincronizar Actas E-14
    const pendingE14s = await db.formsE14.where('syncStatus').equals('pending').toArray();
    for (const form of pendingE14s) {
      try {
        const response = await fetch('/api/logistics/sync/e14', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });

        if (response.ok) {
          await db.formsE14.update(form.id!, { syncStatus: 'synced' });
          console.log(`✅ E14 MESA ${form.mesa} sincronizada.`);
        } else if (response.status === 409) {
          // Conflicto detectado en el backend
          await db.formsE14.update(form.id!, { syncStatus: 'conflict' });
          console.warn(`⚠️ Conflicto en E14 MESA ${form.mesa}.`);
        }
      } catch (error) {
        console.error('❌ Error de red sincronizando E14:', error);
      }
    }

    // 2. Sincronizar Nuevos Simpatizantes
    const pendingSympathizers = await db.newSympathizers.where('syncStatus').equals('pending').toArray();
    for (const symp of pendingSympathizers) {
      try {
        const response = await fetch('/api/logistics/sync/voter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(symp),
        });

        if (response.ok) {
          await db.newSympathizers.update(symp.id!, { syncStatus: 'synced' });
          console.log(`✅ Simpatizante ${symp.documentId} sincronizado.`);
        }
      } catch (error) {
        console.error('❌ Error de red sincronizando simpatizante:', error);
      }
    }
  }

  /**
   * Inicializa los listeners de red para la sincronización automática.
   */
  static init() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 Conexión recuperada. Sincronizando...');
        this.syncPendingData();
      });

      // Intento inicial si ya estamos online
      if (navigator.onLine) {
        this.syncPendingData();
      }
    }
  }
}
