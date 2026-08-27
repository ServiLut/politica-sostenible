"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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

const CampaignContext = createContext<CampaignContextType | undefined>(
  undefined,
);

const TOPE_LEGAL = 2500000000;

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [transactions, setTransactions] = useState<FinanceItem[]>([]);
  const [zones] = useState<TerritoryZone[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);

  const addVoter = (voter: Omit<Voter, "id">) => {
    setVoters((prev) => [{ ...voter, id: crypto.randomUUID() }, ...prev]);
  };

  const updateVoter = (id: string, data: Partial<Voter>) => {
    setVoters((prev) => prev.map((v) => (v.id === id ? { ...v, ...data } : v)));
  };

  const deleteVoter = (id: string) => {
    setVoters((prev) => prev.filter((v) => v.id !== id));
  };

  const addTransaction = (item: Omit<FinanceItem, "id" | "fecha">) => {
    const newItem: FinanceItem = {
      ...item,
      id: crypto.randomUUID(),
      fecha: new Date().toISOString().split("T")[0],
    };
    setTransactions((prev) => [newItem, ...prev]);
  };

  const getBudgetStats = (): BudgetStats => {
    const totalIngresos = transactions
      .filter((t) => t.tipo === "Ingreso")
      .reduce((acc, t) => acc + t.monto, 0);
    const totalGastos = transactions
      .filter((t) => t.tipo === "Gasto")
      .reduce((acc, t) => acc + t.monto, 0);
    return {
      totalIngresos,
      totalGastos,
      saldo: totalIngresos - totalGastos,
      porcentajeEjecucionTope: (totalGastos / TOPE_LEGAL) * 100,
    };
  };

  const assignWitness = (witness: Omit<Witness, "id" | "reporto_e14">) => {
    setWitnesses((prev) => [
      { ...witness, id: crypto.randomUUID(), reporto_e14: false },
      ...prev,
    ]);
  };

  const updateWitness = (id: string, data: Partial<Witness>) => {
    setWitnesses((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...data } : w)),
    );
  };

  const getDashboardKPIs = (): CampaignStats => {
    const metaGlobal = zones.reduce((acc, z) => acc + z.meta_votos, 0);
    const votosEfectivos = voters.filter(
      (v) => v.estado === "Firme" || v.estado === "Ya Votó",
    ).length;
    const fechaEleccion = new Date("2026-10-25");
    const hoy = new Date();
    const dif = fechaEleccion.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(dif / (1000 * 3600 * 24));

    return {
      totalVoters: voters.length,
      metaGlobal: metaGlobal || 50000,
      porcentajeAvance: metaGlobal ? (votosEfectivos / metaGlobal) * 100 : 0,
      diasRestantes: diasRestantes > 0 ? diasRestantes : 0,
    };
  };

  const value: CampaignContextType = {
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
    getDashboardKPIs,
  };

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
