import React from 'react';

const LeaderRow = ({ name, role, score, pendingTasks }: any) => (
  <tr className="border-b last:border-0 hover:bg-slate-50">
    <td className="p-4 font-medium text-slate-900">{name}</td>
    <td className="p-4 text-slate-500 text-sm">{role}</td>
    <td className="p-4">
      <span className={`px-2 py-1 rounded text-xs font-bold ${
        score > 80 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}>
        {score}/100
      </span>
    </td>
    <td className="p-4 text-slate-600">{pendingTasks}</td>
    <td className="p-4 text-right">
      <button className="text-blue-600 font-bold text-sm hover:underline">Gestionar</button>
    </td>
  </tr>
);

export const OperationalDashboard = () => {
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Centro de Operaciones</h1>
        <p className="text-slate-500">Gestión de Equipo y Aprobaciones</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COL 1: APPROVAL QUEUE */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="bg-orange-100 text-orange-600 w-6 h-6 flex items-center justify-center rounded-full text-xs">4</span>
            Pendientes de Aprobación
          </h3>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-3 hover:border-blue-300 cursor-pointer">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Gasto: Refrigerios</span>
                  <span className="text-xs font-bold text-slate-900">$45.000</span>
                </div>
                <p className="text-sm text-slate-800 font-medium">Reunión Líderes Comuna 8</p>
                <p className="text-xs text-slate-400 mt-1">Por: Juan Pérez • Hace 2h</p>
                <div className="mt-2 flex gap-2">
                  <button className="flex-1 bg-green-50 text-green-700 text-xs font-bold py-1 rounded">Aprobar</button>
                  <button className="flex-1 bg-red-50 text-red-700 text-xs font-bold py-1 rounded">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COL 2 & 3: LEADER RANKING */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Desempeño de Líderes</h3>
            <select className="text-sm border-slate-300 rounded-md">
              <option>Esta Semana</option>
              <option>Este Mes</option>
            </select>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-bold text-slate-400 uppercase bg-slate-50 border-b">
                <th className="p-4">Líder</th>
                <th className="p-4">Territorio</th>
                <th className="p-4">Score</th>
                <th className="p-4">Tareas Vencidas</th>
                <th className="p-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              <LeaderRow name="Ana García" role="Robledo" score={92} pendingTasks={0} />
              <LeaderRow name="Carlos Ruiz" role="Belen" score={45} pendingTasks={5} />
              <LeaderRow name="Maria Jose" role="Centro" score={78} pendingTasks={1} />
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
