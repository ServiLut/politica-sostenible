'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Lock } from 'lucide-react';

export default function QRBridge({ data }: { data: any }) {
    // Mock Encryption (AES)
    const encryptedData = `AES256:${btoa(JSON.stringify(data))}`;

    return (
        <div className="flex flex-col items-center gap-4 bg-white p-6 rounded-xl border border-slate-200">
            <div className="bg-slate-900 p-4 rounded-lg">
                <QRCodeSVG value={encryptedData} size={200} level="H" includeMargin={true} />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                <Lock className="w-3 h-3" />
                <span>E-14 ENCRIPTADO &bull; NIVEL MILITAR</span>
            </div>
            <p className="text-center text-xs text-slate-400 max-w-[200px]">
                Escanee este código con el dispositivo del recolector para transmisión offline P2P.
            </p>
        </div>
    );
}
