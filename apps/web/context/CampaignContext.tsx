"use client";

import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback } from "react";

// --- TYPES & INTERFACES ---

export type VoterStatus = "Indeciso" | "Firme" | "Ya Votó" | "Contrario";

export interface Voter {
  id: string;
  cedula: string;
  nombres: string;
  celular: string;
  puesto_votacion: string;
  mesa?: string;
  estado: VoterStatus;
  referido_por: string;
  barrio: string;
}

export type TransactionType = "Ingreso" | "Gasto";

export interface FinanceItem {
  id: string;
  tipo: TransactionType;
  categoria_cne: string;
  monto: number;
  fecha: string;
  concept: string;
}

export interface TerritoryZone {
  id: string;
  nombre: string;
  meta_votos: number;
  votos_actuales: number;
  lider_zona: string;
  coords?: [number, number]; // Para el mapa táctico [lat, lng]
}

export interface Witness {
  id: string;
  nombre: string;
  celular: string;
  asignado_a_puesto: string;
  reporto_e14: boolean;
}

interface CampaignStats {
  totalVoters: number;
  metaGlobal: number;
  porcentajeAvance: number;
  diasRestantes: number;
}

interface BudgetStats {
  totalIngresos: number;
  totalGastos: number;
  saldo: number;
  porcentajeEjecucionTope: number;
}

interface CampaignContextType {
  voters: Voter[];
  transactions: FinanceItem[];
  zones: TerritoryZone[];
  witnesses: Witness[];
  
  addVoter: (voter: Omit<Voter, "id">) => void;
  updateVoter: (id: string, data: Partial<Voter>) => void;
  deleteVoter: (id: string) => void;
  
  addTransaction: (item: Omit<FinanceItem, "id" | "fecha">) => void;
  getBudgetStats: () => BudgetStats;
  
  assignWitness: (witness: Omit<Witness, "id" | "reporto_e14">) => void;
  updateWitness: (id: string, data: Partial<Witness>) => void;
  
  getDashboardKPIs: () => CampaignStats;
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

const STORAGE_KEY = "politica_sostenible_campaign_data_v1";
const TOPE_LEGAL = 2500000000;

// --- INITIAL MOCK DATA ---
const MOCK_DATA = {
  voters: [
    { id: "1", cedula: "1017123456", nombres: "Juan Carlos Pérez", celular: "3101234567", puesto_votacion: "Unicentro", mesa: "12", estado: "Firme", referido_por: "Carlos Líder", barrio: "Belén" },
    { id: "2", cedula: "52123456", nombres: "María Fernanda López", celular: "3007654321", puesto_votacion: "Col. San José", mesa: "5", estado: "Indeciso", referido_por: "Ana Líder", barrio: "Poblado" },
    { id: "3", cedula: "79123456", nombres: "Andrés Felipe Aristizábal", celular: "3158889900", puesto_votacion: "Parque Estadio", mesa: "1", estado: "Firme", referido_por: "Carlos Líder", barrio: "Laureles" },
  ],
  transactions: [
    { id: "t1", tipo: "Gasto", categoria_cne: "Propaganda Electoral", monto: 45000000, fecha: "2026-02-01", concept: "Vallas Septima" },
    { id: "t2", tipo: "Ingreso", categoria_cne: "Donaciones", monto: 150000000, fecha: "2026-01-20", concept: "Aporte Empresarial" },
  ],
  zones: [
    { id: "z1", nombre: "Comuna 13", meta_votos: 5000, votos_actuales: 1200, lider_zona: "Fernando Gómez", coords: [6.25, -75.60] },
    { id: "z2", nombre: "Aranjuez", meta_votos: 8000, votos_actuales: 3400, lider_zona: "Marta Lucía", coords: [6.28, -75.56] },
    { id: "z3", nombre: "El Poblado", meta_votos: 12000, votos_actuales: 8500, lider_zona: "Roberto Sáenz", coords: [6.21, -75.57] },
  ],
  witnesses: [
    { id: "w1", nombre: "Andrés Guardián", celular: "3101112233", asignado_a_puesto: "Unicentro", reporto_e14: false },
  ]
};

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [transactions, setTransactions] = useState<FinanceItem[]>([]);
  const [zones, setZones] = useState<TerritoryZone[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
         
        setVoters(data.voters || []);
        setTransactions(data.transactions || []);
        setZones(data.zones || []);
        setWitnesses(data.witnesses || []);
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    } else {
       
      setVoters(MOCK_DATA.voters as Voter[]);
      setTransactions(MOCK_DATA.transactions as FinanceItem[]);
      setZones(MOCK_DATA.zones as TerritoryZone[]);
      setWitnesses(MOCK_DATA.witnesses as Witness[]);
    }
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if (isLoaded) {
      const data = { voters, transactions, zones, witnesses };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [voters, transactions, zones, witnesses, isLoaded]);

  const addVoter = useCallback((voter: Omit<Voter, "id">) => {
    setVoters(prev => [{ ...voter, id: crypto.randomUUID() }, ...prev]);
  }, []);

  const updateVoter = useCallback((id: string, data: Partial<Voter>) => {
    setVoters(prev => prev.map(v => v.id === id ? { ...v, ...data } : v));
  }, []);

  const deleteVoter = useCallback((id: string) => {
    setVoters(prev => prev.filter(v => v.id !== id));
  }, []);

  const addTransaction = useCallback((item: Omit<FinanceItem, "id" | "fecha">) => {
    const newItem: FinanceItem = {
      ...item,
      id: crypto.randomUUID(),
      fecha: new Date().toISOString().split('T')[0]
    };
    setTransactions(prev => [newItem, ...prev]);
  }, []);

  const getBudgetStats = useCallback((): BudgetStats => {
    const totalIngresos = transactions.filter(t => t.tipo === "Ingreso").reduce((acc, t) => acc + t.monto, 0);
    const totalGastos = transactions.filter(t => t.tipo === "Gasto").reduce((acc, t) => acc + t.monto, 0);
    return {
      totalIngresos,
      totalGastos,
      saldo: totalIngresos - totalGastos,
      porcentajeEjecucionTope: (totalGastos / TOPE_LEGAL) * 100
    };
  }, [transactions]);

  const assignWitness = useCallback((witness: Omit<Witness, "id" | "reporto_e14">) => {
    setWitnesses(prev => [{ ...witness, id: crypto.randomUUID(), reporto_e14: false }, ...prev]);
  }, []);

  const updateWitness = useCallback((id: string, data: Partial<Witness>) => {
    setWitnesses(prev => prev.map(w => w.id === id ? { ...w, ...data } : w));
  }, []);

  const getDashboardKPIs = useCallback((): CampaignStats => {
    const metaGlobal = zones.reduce((acc, z) => acc + z.meta_votos, 0);
    const votosEfectivos = voters.filter(v => v.estado === "Firme" || v.estado === "Ya Votó").length;
    const fechaEleccion = new Date("2026-10-25");
    const hoy = new Date();
    const dif = fechaEleccion.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(dif / (1000 * 3600 * 24));

    return {
      totalVoters: voters.length,
      metaGlobal: metaGlobal || 50000,
      porcentajeAvance: metaGlobal ? (votosEfectivos / metaGlobal) * 100 : 0,
      diasRestantes: diasRestantes > 0 ? diasRestantes : 0
    };
  }, [voters, zones]);

  const value = useMemo(() => ({
    voters,
    transactions,
    zones,
    witnesses,
    addVoter,
    updateVoter,
    deleteVoter,
    addTransaction,
    getBudgetStats,
    assignWitness,
    updateWitness,
    getDashboardKPIs
  }), [voters, transactions, zones, witnesses, addVoter, updateVoter, deleteVoter, addTransaction, getBudgetStats, assignWitness, updateWitness, getDashboardKPIs]);

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (context === undefined) {
    throw new Error("useCampaign must be used within a CampaignProvider");
  }
  return context;
}
