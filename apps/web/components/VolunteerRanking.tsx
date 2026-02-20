'use client';

import React from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Medal, Zap } from 'lucide-react';
import { cn } from './ui/utils';

const TOP_VOLUNTEERS = [
  { name: 'Diana Rivera', points: 1250, rank: 1, avatar: '👩‍💼', trend: 'up' },
  { name: 'Carlos Mario', points: 980, rank: 2, avatar: '👨‍🔧', trend: 'stable' },
  { name: 'Sonia Lopez', points: 870, rank: 3, avatar: '👩‍🏫', trend: 'down' },
];

export const VolunteerRanking = () => {
  const handleReward = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#2563eb', '#fbbf24', '#10b981'],
    });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="text-yellow-500 w-6 h-6" />
          <h3 className="text-xl font-bold text-gray-800">Top Movilizadores</h3>
        </div>
        <button 
          onClick={handleReward}
          className="p-2 hover:bg-yellow-50 rounded-full transition-colors group"
        >
          <Zap className="text-yellow-500 group-hover:fill-yellow-500 transition-all" />
        </button>
      </div>

      <div className="space-y-3">
        {TOP_VOLUNTEERS.map((v, idx) => (
          <div 
            key={v.rank} 
            className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
              v.rank === 1 ? 'bg-teal-50 border-teal-100 shadow-sm' : 'bg-white border-slate-50'
            }`}
          >
            <div className="relative">
              <div className={cn(
                "w-12 h-12 flex items-center justify-center rounded-2xl text-xl shadow-sm border shrink-0 transition-all",
                idx === 0 ? "bg-teal-50 text-teal-600 border-teal-100" :
                idx === 1 ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {v.avatar}
              </div>
              <div className="absolute -top-2 -left-2 z-10">
                {v.rank === 1 && <Medal className="w-6 h-6 text-yellow-500 fill-yellow-200 drop-shadow-sm" />}
                {v.rank === 2 && <Medal className="w-6 h-6 text-slate-400 fill-slate-100 drop-shadow-sm" />}
                {v.rank === 3 && <Medal className="w-6 h-6 text-amber-600 fill-amber-100 drop-shadow-sm" />}
              </div>
            </div>
            
            <div className="flex-1">
              <p className="font-black text-slate-900 uppercase tracking-tight text-sm mb-1">{v.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-teal-600">{v.points}</span>
                <span className="text-[8px] uppercase font-black text-slate-400 tracking-widest">registros</span>
              </div>
            </div>

            <div className="text-right">
              <p className={`text-xs font-black ${v.rank === 1 ? 'text-teal-600' : 'text-slate-300'}`}>
                #{v.rank}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-50 text-center">
        <p className="text-xs text-gray-400 font-medium italic">Sigue sumando para ganar medallas</p>
      </div>
    </div>
  );
};
