import { db } from '@/lib/db'; // Dexie instance
import LZString from 'lz-string';

// Tipos de Datos
interface BridgePacket {
  id: string;        // UUID único del paquete
  payload: string;   // JSON string cifrado con AES-GCM
  iv: string;        // Vector de inicialización (Base64)
  signature: string; // Firma ECDSA del payload cifrado (Base64)
  publicKey: string; // Clave pública del emisor (para verificar firma)
  timestamp: number;
}

interface QRSegment {
  id: string;        // ID del paquete
  idx: number;       // Índice del segmento (0-based)
  total: number;     // Total de segmentos
  data: string;      // Fragmento comprimido
}

/**
 * Servicio para el protocolo "Puente Humano" (P2P Offline Data Transfer).
 * Permite mover datos sensibles mediante QRs en zonas sin conectividad.
 */
export class HumanBridgeService {
  
  // --------------------------------------------------------------------------
  // 1. GENERACIÓN DE PAQUETE SEGURO (Emisor / Testigo)
  // --------------------------------------------------------------------------

  /**
   * Empaqueta, cifra, firma y segmenta datos para transmisión QR.
   * @param data Objeto JSON con la evidencia (E14, votos, etc.)
   * @param senderKeyPair Claves ECDSA del dispositivo emisor
   */
  async createTransferPackage(data: any, senderKeyPair: CryptoKeyPair): Promise<string[]> {
    const rawJson = JSON.stringify(data);
    
    // A. Cifrado Simétrico (AES-GCM) para confidencialidad
    // Generamos una clave de sesión efímera para este paquete
    const sessionKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sessionKey,
      new TextEncoder().encode(rawJson)
    );

    // Nota: En un escenario real, la sessionKey debe ser cifrada con la llave pública del SERVIDOR/RECOLECTOR
    // o compartida previamente. Para este prototipo, simplificamos asumiendo un secreto compartido o 
    // que el recolector solo actúa de "mula" ciega (blind courier) y el servidor tiene la llave maestra.
    // Aquí simularemos el empaquetado del contenido cifrado "as is" para transporte.

    const payloadBase64 = this.arrayBufferToBase64(encryptedBuffer);
    const ivBase64 = this.arrayBufferToBase64(iv.buffer);

    // B. Firma Digital (ECDSA) para integridad y no repudio
    const signatureBuffer = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      senderKeyPair.privateKey,
      new TextEncoder().encode(payloadBase64) // Firmamos el cifrado
    );
    
    const packet: BridgePacket = {
      id: crypto.randomUUID(),
      payload: payloadBase64,
      iv: ivBase64,
      signature: this.arrayBufferToBase64(signatureBuffer),
      publicKey: "EXPORTED_PUB_KEY_PLACEHOLDER", // Se debería exportar JWK
      timestamp: Date.now()
    };

    // LOCK: Save to Local DB immediately as "READ_ONLY"
    await this.lockLocalEvidence(packet);

    // C. Segmentación y QR (Alta Densidad)
    // Usamos LZ-String para comprimir texto antes de QR
    const compressedPacket = LZString.compressToBase64(JSON.stringify(packet));
    return this.segmentData(packet.id, compressedPacket);
  }

  private async lockLocalEvidence(packet: BridgePacket) {
    // @ts-ignore
    await db.e14Records.put({
      id: packet.id,
      status: 'LOCKED_FOR_TRANSFER',
      payload: packet,
      lockedAt: Date.now()
    });
  }

  // --------------------------------------------------------------------------
  // 2. RECEPCIÓN Y REENSAMBLAJE (Recolector)
  // --------------------------------------------------------------------------

  private segmentBuffer: Map<string, string[]> = new Map();

  /**
   * Procesa un segmento escaneado.
   * Retorna el paquete completo si se completaron todos los segmentos.
   */
  async processScannedSegment(qrString: string): Promise<BridgePacket | null> {
    // Formato QR: "BRIDGE:v1:ID:IDX:TOTAL:DATA"
    if (!qrString.startsWith('BRIDGE:v1:')) return null;

    const parts = qrString.split(':');
    const id = parts[2];
    const idx = parseInt(parts[3]);
    const total = parseInt(parts[4]);
    const data = parts.slice(5).join(':'); // Por si data contiene ':'

    // Inicializar buffer si es nuevo
    if (!this.segmentBuffer.has(id)) {
      this.segmentBuffer.set(id, new Array(total).fill(null));
    }

    const buffer = this.segmentBuffer.get(id)!;
    buffer[idx] = data;

    // Verificar si está completo
    if (buffer.every(segment => segment !== null)) {
      const fullCompressed = buffer.join('');
      const jsonString = LZString.decompressFromBase64(fullCompressed);
      
      if (!jsonString) throw new Error("Decompression failed");
      
      const packet: BridgePacket = JSON.parse(jsonString);
      
      // Limpiar buffer
      this.segmentBuffer.delete(id);
      
      // Guardar en Outbox para sync futura
      await this.queueForUpload(packet);
      
      return packet;
    }

    return null; // Aún incompleto
  }

  /**
   * Guarda el paquete cifrado en la cola de subida del Recolector.
   * El recolector NO descifra, solo transporta.
   */
  private async queueForUpload(packet: BridgePacket) {
    // @ts-ignore - db typings assumed
    await db.bridgeInbox.add({
        packetId: packet.id,
        data: packet, // Se guarda el JSON cifrado entero
        receivedAt: Date.now(),
        syncStatus: 'PENDING_UPLOAD'
    });
  }

  // --------------------------------------------------------------------------
  // UTILIDADES
  // --------------------------------------------------------------------------

  private segmentData(id: string, data: string, maxChunkSize: number = 250): string[] {
    const chunks: string[] = [];
    const total = Math.ceil(data.length / maxChunkSize);
    
    for (let i = 0; i < total; i++) {
        const chunk = data.slice(i * maxChunkSize, (i + 1) * maxChunkSize);
        // Header ligero: BRIDGE:v1:{id}:{idx}:{total}:{data}
        chunks.push(`BRIDGE:v1:${id}:${i}:${total}:${chunk}`);
    }
    return chunks;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
