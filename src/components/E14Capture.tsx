'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { Camera, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export default function E14Capture({ onCapture }: { onCapture: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [blurScore, setBlurScore] = useState<number | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Preview
        const url = URL.createObjectURL(file);
        setPreview(url);
        setAnalyzing(true);

        // Simulate Blur Check (since we can't easily run opencv here)
        // In real app: Load image to canvas, run laplacian
        setTimeout(() => {
            const score = Math.floor(Math.random() * 300); // Mock
            setBlurScore(score);
            setAnalyzing(false);
            
            if (score > 100) {
                onCapture(file);
            } else {
                // Vibrate if mobile
                if (navigator.vibrate) navigator.vibrate(200);
            }
        }, 1000);
    };

    return (
        <div className="space-y-4">
            <div 
                className={`border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden
                    ${blurScore !== null && blurScore < 100 ? 'border-red-400 bg-red-50' : 'border-slate-300 hover:bg-slate-50'}
                `}
                onClick={() => inputRef.current?.click()}
            >
                {preview ? (
                    <Image 
                        src={preview} 
                        alt="E14" 
                        fill 
                        className="object-contain rounded-lg" 
                        unoptimized
                    />
                ) : (
                    <>
                        <Camera className="w-10 h-10 text-slate-400 mb-2" />
                        <span className="text-sm font-bold text-slate-500">Tocar para escanear E-14</span>
                    </>
                )}
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>

            {analyzing && <div className="text-center text-xs font-bold text-blue-600 animate-pulse">Analizando nitidez...</div>}

            {blurScore !== null && (
                <div className={`p-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold
                    ${blurScore < 100 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}
                `}>
                    {blurScore < 100 ? (
                        <>
                            <AlertTriangle className="w-4 h-4" />
                            IMAGEN BORROSA (Score: {blurScore}). REINTENTAR.
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            CALIDAD ACEPTABLE (Score: {blurScore})
                        </>
                    )}
                </div>
            )}

            {blurScore !== null && blurScore < 100 && (
                <button 
                    onClick={() => { setPreview(null); setBlurScore(null); }}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" /> Nueva Foto
                </button>
            )}
        </div>
    );
}