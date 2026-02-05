'use client';

import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, AlertTriangle, DollarSign, Map, Download, Lock, CheckCircle2 } from 'lucide-react';
import { generatePDFReport } from '@/utils/reportGenerator';
import { toast } from 'sonner';

// --- COMPONENTS ---
const KpiCard = ({ title, value, trend, trendUp, loading, icon: Icon, color }: any) => {
  // Map legacy color names to friendly palette
  const colorMap: any = {
      blue: 'brand-black',
      indigo: 'brand-gray-500',
      emerald: 'brand-green-600',
      rose: 'red-500', // Keep red for anomalies but softer
      slate: 'brand-gray-400'
  };

  const bgMap: any = {
      blue: 'bg-brand-gray-50',
      indigo: 'bg-brand-gray-50',
      emerald: 'bg-brand-green-50',
      rose: 'bg-red-50',
      slate: 'bg-slate-50'
  };

  const iconBgMap: any = {
      blue: 'bg-brand-black text-white',
      indigo: 'bg-brand-gray-100 text-brand-gray-900',
      emerald: 'bg-brand-green-100 text-brand-green-700',
      rose: 'bg-red-100 text-red-600',
      slate: 'bg-slate-100 text-slate-500'
  };

  return (
    <div className="card-friendly p-6 group relative overflow-hidden">
        {/* Background Decoration */}
        <div className={`absolute top-0 right-0 w-24 h-24 ${bgMap[color]} rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`} />
        
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl transition-colors ${iconBgMap[color]}`}>
                    <Icon className="w-6 h-6" />
                </div>
                {trend && (
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${trendUp ? 'bg-brand-green-100 text-brand-green-700' : 'bg-red-100 text-red-700'}`}>
                        {trend}
                    </span>
                )}
            </div>
            <h3 className="text-brand-gray-500 text-[11px] font-black uppercase tracking-widest">{title}</h3>
            {loading ? (
                <div className="mt-2 h-8 w-32 bg-brand-gray-100 animate-pulse rounded-lg"></div>
            ) : (
                <div className="mt-1 text-3xl font-black text-brand-black tracking-tight">{value}</div>
            )}
        </div>
    </div>
  );
};

const HeatmapItem = ({ name, status }: any) => (
  <div className="flex justify-between items-center p-4 border-b border-brand-gray-50 last:border-0 hover:bg-brand-gray-50 transition-colors">
    <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${
            status === 'CRITICAL' ? 'bg-red-500' : 
            status === 'WARNING' ? 'bg-amber-400' : 'bg-brand-green-500'
        }`} />
        <span className="font-bold text-brand-gray-900 text-sm">{name}</span>
    </div>
    <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-tighter ${
        status === 'CRITICAL' ? 'bg-red-50 text-red-600 border-red-100' : 
        status === 'WARNING' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-brand-green-50 text-brand-green-700 border-brand-green-100'
    }`}>
        {status}
    </span>
  </div>
);

export default function ExecutiveDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [territories, setTerritories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [userRole, setUserRole] = useState('');
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    const loadData = async () => {
        try {
            // Get Role
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const me = await meRes.json();
                setUserRole(me.role);
            }

            const [statsRes, chartRes, terrRes] = await Promise.all([
                fetch('/api/dashboard/stats'),
                fetch('/api/dashboard/chart'),
                fetch('/api/territory/stats')
            ]);
            
            if (statsRes.ok) setStats(await statsRes.json());
            if (chartRes.ok) setChartData(await chartRes.json());
            if (terrRes.ok) {
                const terrData = await terrRes.json();
                if (terrData.stats && Array.isArray(terrData.stats)) {
                    setTerritories(terrData.stats.sort((a: any, b: any) => a.count - b.count));
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, []);

  const initiateDownload = () => {
      setShowPinModal(true);
      setPin('');
      setPinError('');
  };

  const verifyAndDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    try {
        const verifyRes = await fetch('/api/auth/pin-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        if (!verifyRes.ok) {
            setPinError('PIN Incorrecto');
            return;
        }
        
        setShowPinModal(false);
        setDownloading(true);

        const res = await fetch('/api/reports/full-data');
        
        if (res.ok) {
            const data = await res.json();
            generatePDFReport(data);
            toast.success('Informe Generado', { description: 'La descarga del PDF comenzará en breve.' });
        } else {
            toast.error('Error Generando Informe', { description: 'No se pudo obtener la data del reporte.' });
        }
    } catch (e) {
        console.error(e);
    } finally {
        setDownloading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between md:items-end gap-6 pb-8 border-b border-brand-gray-200">
        <div>
          <div className="flex items-center gap-2 mb-2">
              <span className="h-1.5 w-8 bg-brand-green-500 rounded-full" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gray-500">Inteligencia Electoral</span>
          </div>
          <h1 className="text-4xl font-black text-brand-black tracking-tight">Centro de Mando</h1>
          <p className="text-brand-gray-500 mt-1 text-lg font-medium">Estrategia Basada en Datos &bull; Campaña 2026</p>
        </div>
        
        <div className="flex gap-3">
          <a href="/capture" className="btn-primary-friendly shadow-lg shadow-brand-black/10">
            <Users className="w-4 h-4" /> Nuevo Registro
          </a>
          
          {/* EXPORT BUTTON - ADMIN ONLY (Ref: Paso 2.9 UI) */}
          {userRole === 'ADMIN' && (
              <button 
                onClick={initiateDownload}
                disabled={downloading}
                className="bg-white text-brand-gray-900 border border-brand-gray-200 px-6 py-3 rounded-xl text-sm font-black hover:bg-brand-gray-50 transition-all flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                {downloading ? 'Generando...' : 'Informe PDF/ZIP'}
              </button>
          )}
        </div>
      </header>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiCard 
            title="Votos Proyectados" 
            value={stats?.votes || 0} 
            trend="En Tiempo Real" 
            trendUp={true} 
            loading={loading}
            icon={Users}
            color="blue"
        />
        <KpiCard 
            title="Cobertura" 
            value={stats?.coverage || 0} 
            trend="Zonas Activas" 
            trendUp={true} 
            loading={loading}
            icon={Map}
            color="indigo"
        />
        
        {/* BUDGET - ADMIN ONLY (Tunnel Vision) */}
        {userRole === 'ADMIN' && (
            <KpiCard 
                title="Presupuesto" 
                value={
                    <div>
                        {typeof stats?.budget === 'string' ? `$${stats?.budget}` : `$${stats?.budget?.toLocaleString() || 0}`}
                        {stats?.budgetPending && (
                            <div className="text-[10px] text-brand-gray-400 font-medium mt-1 normal-case tracking-normal">
                                Pendiente por legalizar: <span className="font-bold text-brand-black">${stats.budgetPending}</span>
                            </div>
                        )}
                    </div>
                }
                trend="Ejecutado" 
                trendUp={true} 
                loading={loading}
                icon={DollarSign}
                color="emerald"
            />
        )}

        <KpiCard 
            title="Logística / Transporte" 
            value={
                loading ? (
                    <div className="flex items-center gap-2 text-base text-brand-gray-500 animate-pulse">
                         <div className="h-4 w-4 border-2 border-brand-gray-500 border-t-transparent rounded-full animate-spin"></div>
                         Calculando...
                    </div>
                ) : (
                    stats?.transport || 0
                )
            } 
            trend="Alta Prioridad" 
            trendUp={false} 
            loading={false} // Override internal loading to use custom content
            icon={AlertTriangle}
            color="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CHART AREA */}
        <div className="lg:col-span-2 card-friendly p-8 flex flex-col min-h-[480px]">
          <div className="flex justify-between items-center mb-8">
            <div>
                <h3 className="text-xl font-black text-brand-black flex items-center gap-2">
                    Evolución de Campaña
                </h3>
                <p className="text-xs text-brand-gray-500 font-bold">Crecimiento orgánico de la base de datos</p>
            </div>
            <div className="p-1 bg-brand-gray-100 rounded-xl flex gap-1">
                <button className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-white shadow-sm text-brand-black">7 Días</button>
                <button className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg text-brand-gray-500 hover:text-brand-black transition-colors">30 Días</button>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-0 relative">
            {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-brand-gray-50/50 rounded-xl">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-black"></div>
                </div>
            ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#111827" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#111827" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis 
                            dataKey="date" 
                            tick={{fontSize: 10, fill: '#9CA3AF', fontWeight: 'bold'}} 
                            axisLine={false} 
                            tickLine={false} 
                            tickMargin={15}
                        />
                        <YAxis 
                            tick={{fontSize: 10, fill: '#9CA3AF', fontWeight: 'bold'}} 
                            axisLine={false} 
                            tickLine={false} 
                            tickMargin={15}
                        />
                        <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }}
                            itemStyle={{ color: '#111827', fontWeight: '900', fontSize: '14px' }}
                            labelStyle={{ color: '#6B7280', marginBottom: '8px', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="count" 
                            stroke="#111827" 
                            strokeWidth={4} 
                            fillOpacity={1} 
                            fill="url(#colorCount)" 
                            activeDot={{ r: 6, strokeWidth: 0, fill: '#22C55E' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-brand-gray-400 border-2 border-dashed border-brand-gray-100 rounded-2xl bg-brand-gray-50/50">
                    <TrendingUp className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-bold text-sm">Iniciando recolección de datos...</p>
                </div>
            )}
          </div>
        </div>

        {/* HEATMAP: Puntos de Dolor */}
        <div className="card-friendly overflow-hidden flex flex-col">
          <div className="bg-brand-gray-50 p-6 border-b border-brand-gray-100">
            <h3 className="font-black text-brand-black flex items-center gap-2 uppercase text-sm tracking-widest">
                <div className="p-2 bg-white rounded-lg shadow-sm text-brand-green-600"><Map className="w-4 h-4" /></div>
                Estado Territorial
            </h3>
            <p className="text-[10px] text-brand-gray-500 mt-2 font-bold uppercase tracking-tighter">Zonas Críticas &bull; Acción Requerida</p>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[400px]">
            {loading ? (
                <div className="space-y-3 p-4">
                    {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-brand-gray-50 rounded-xl animate-pulse" />)}
                </div>
            ) : territories.length > 0 ? (
                territories.slice(0, 8).map((t) => (
                    <HeatmapItem key={t.id} name={t.name} status={t.status} />
                ))
            ) : (
                <div className="p-12 text-center text-sm text-brand-gray-400 font-bold italic">
                    Sin datos territoriales registrados.
                </div>
            )}
          </div>
          <div className="p-5 bg-white text-center border-t border-brand-gray-100">
            <a href="/dashboard/territory?filter=critical" className="text-brand-black text-[10px] font-black hover:text-brand-green-700 uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-2">
                Mapa Detallado <TrendingUp className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* PIN Verification Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full transform scale-100 transition-transform border border-brand-gray-100">
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-brand-green-100 p-5 rounded-full text-brand-green-700 mb-5 shadow-inner">
                        <Lock className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-black text-brand-black tracking-tight">Cifrado de Seguridad</h3>
                    <p className="text-brand-gray-500 text-center text-sm mt-3 font-medium leading-relaxed">
                        Este informe contiene datos sensibles. <br/>Ingrese su <b>PIN Maestro</b> para continuar.
                    </p>
                </div>
                
                <form onSubmit={verifyAndDownload}>
                    <input 
                        type="password" 
                        autoFocus
                        className="w-full text-center text-3xl font-black tracking-[0.6em] p-5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-green-500 focus:bg-white focus:ring-0 outline-none mb-6 transition-all"
                        placeholder="••••"
                        maxLength={4}
                        value={pin}
                        onChange={e => setPin(e.target.value.replace(/\D/g,''))}
                    />
                    {pinError && (
                        <div className="flex items-center justify-center gap-2 text-red-600 text-xs font-black uppercase mb-6 animate-bounce">
                            <AlertTriangle className="w-4 h-4" /> {pinError}
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            type="submit"
                            disabled={pin.length < 4}
                            className="w-full py-4 bg-brand-black text-white font-black rounded-2xl hover:bg-gray-800 transition-all disabled:opacity-30 shadow-xl shadow-brand-black/20 text-sm uppercase tracking-widest"
                        >
                            Verificar Identidad
                        </button>
                        <button 
                            type="button"
                            onClick={() => setShowPinModal(false)}
                            className="w-full py-3 text-brand-gray-400 font-bold hover:text-brand-black transition-colors text-xs uppercase"
                        >
                            Cancelar Operación
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
