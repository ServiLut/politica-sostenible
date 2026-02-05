import React from 'react';

// Components for "Survival UX"
const ActionButton = ({ icon, label, color }: any) => (
  <button className={`flex flex-col items-center justify-center p-4 rounded-xl shadow-md active:scale-95 transition-transform ${color} text-white w-full h-32`}>
    <span className="text-3xl mb-2">{icon}</span>
    <span className="font-bold text-lg leading-tight text-center">{label}</span>
  </button>
);

const PriorityItem = ({ title, type, time }: any) => (
  <div className="bg-white p-4 rounded-lg border-l-4 border-red-500 shadow-sm mb-3">
    <div className="flex justify-between items-start">
      <h4 className="font-bold text-slate-800">{title}</h4>
      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-bold">{type}</span>
    </div>
    <p className="text-sm text-slate-500 mt-1">Vence: {time}</p>
  </div>
);

export const FieldDashboard = () => {
  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* MOBILE HEADER */}
      <div className="bg-blue-600 p-6 pb-12 rounded-b-3xl shadow-lg text-white">
        <p className="text-blue-100 text-sm font-bold uppercase">Hola, Carlos</p>
        <h1 className="text-3xl font-bold mt-1">Tu Misión Hoy</h1>
        <div className="flex gap-4 mt-4 text-sm font-medium opacity-90">
          <span>📍 Comuna 13</span>
          <span>🏆 Rank #12</span>
        </div>
      </div>

      <div className="p-4 -mt-8">
        
        {/* BIG ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <ActionButton icon="📝" label="Nuevo Contacto" color="bg-green-500" />
          <ActionButton icon="📸" label="Subir E-14" color="bg-blue-500" />
          <ActionButton icon="📍" label="Evento Check-In" color="bg-orange-500" />
          <ActionButton icon="💸" label="Reportar Gasto" color="bg-purple-500" />
        </div>

        {/* PRIORITIES LIST */}
        <h3 className="font-bold text-slate-700 text-lg mb-3 ml-1">Prioridades (Top 3)</h3>
        <PriorityItem title="Visitar a Doña Marta" type="SEGUIMIENTO" time="2:00 PM" />
        <PriorityItem title="Subir foto Evento Parque" type="EVIDENCIA" time="HOY" />
        <PriorityItem title="Reunión Coordinación" type="ASISTENCIA" time="MAÑANA" />

        {/* LOGISTICS STATUS */}
        <div className="mt-6 bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center">
          <div>
            <p className="text-slate-400 text-xs uppercase font-bold">Estado Logístico</p>
            <p className="font-bold text-lg">Transporte Asignado</p>
          </div>
          <div className="bg-green-500 text-white p-2 rounded-full">
            🚐
          </div>
        </div>

      </div>
    </div>
  );
};
