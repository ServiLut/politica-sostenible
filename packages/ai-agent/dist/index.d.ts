/**
 * Cliente pasivo para las capacidades de inteligencia política expuestas por
 * NestJS. Este paquete no conoce Prisma, credenciales de base de datos ni IDs de
 * tenant: el API debe resolver el tenant exclusivamente desde el JWT de servicio.
 */
export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export interface RegionalPerformance {
    mode: PoliticalOperationMode;
    regionCode: string | null;
    voterCount: number;
    validatedSignatureCount: number;
    activeLeaderCount: number;
}
export interface CneCompliance {
    mode: PoliticalOperationMode;
    totalExpenses: string;
    budgetLimit: string | null;
    utilizationPercentage: number | null;
    withinLimit: boolean;
    warnings: string[];
}
export interface DayDAnomaly {
    reportId: string;
    pollingPlaceCode: string;
    tableNumber: number;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    reason: string;
}
export interface FinanceEntryAudit {
    entryId: string;
    compliant: boolean;
    findings: string[];
    requiresHumanReview: boolean;
}
export interface CounterNarrative {
    narrative: string;
    recommendations: string[];
    requiresHumanApproval: true;
}
export interface VolunteerRankingEntry {
    userId: string;
    displayName: string;
    points: number;
}
export interface InventoryMatch {
    itemId: string;
    name: string;
    sku: string | null;
    quantity: number;
    warehouse: string | null;
}
export interface NestPoliticalApiClientOptions {
    /** URL pública o interna del API NestJS; puede incluir un prefijo como `/api`. */
    baseUrl: string;
    /**
     * JWT emitido por NestJS para una identidad de servicio con tenant y scopes.
     * Nunca use aquí una service-role key de Supabase.
     */
    serviceToken: string;
    timeoutMs?: number;
    /** Inyección opcional para pruebas; en Node 18+ se usa `globalThis.fetch`. */
    fetchImplementation?: typeof globalThis.fetch;
}
export declare class NestPoliticalApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;
    constructor(message: string, options: {
        status: number;
        code: string;
        details?: unknown;
        cause?: unknown;
    });
}
/**
 * Adaptador HTTP sin estado. No inicia servidores, no ejecuta herramientas por
 * sí solo y no permite que el llamador suplante el tenant mediante parámetros.
 */
export declare class NestPoliticalApiClient {
    private readonly baseUrl;
    private readonly serviceToken;
    private readonly timeoutMs;
    private readonly fetchImplementation;
    constructor(options: NestPoliticalApiClientOptions);
    getRegionalPerformance(regionCode?: string): Promise<RegionalPerformance>;
    getCneCompliance(): Promise<CneCompliance>;
    getDayDAnomalies(): Promise<DayDAnomaly[]>;
    auditFinanceEntry(entryId: string): Promise<FinanceEntryAudit>;
    generateCounterNarrative(input: {
        topic: string;
        sentiment?: string;
    }): Promise<CounterNarrative>;
    getTopVolunteers(limit?: number): Promise<VolunteerRankingEntry[]>;
    searchInventory(itemName: string): Promise<InventoryMatch[]>;
    private request;
}
//# sourceMappingURL=index.d.ts.map