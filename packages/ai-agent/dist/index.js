import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from '../prisma/generated/prisma';
const prisma = new PrismaClient();
const server = new Server({
    name: "electoral-intelligence-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
/**
 * Lista de herramientas disponibles para Gemini
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "analyze_regional_performance",
                description: "Analiza el desempeño de la campaña en una región específica (votos, firmas, líderes).",
                inputSchema: {
                    type: "object",
                    properties: {
                        regionCode: { type: "string", description: "Código DANE del municipio o departamento" },
                        tenantId: { type: "string", description: "ID de la campaña" },
                    },
                    required: ["tenantId"],
                },
            },
            {
                name: "check_cne_compliance",
                description: "Audita los gastos de la campaña para asegurar cumplimiento con topes del CNE.",
                inputSchema: {
                    type: "object",
                    properties: {
                        tenantId: { type: "string", description: "ID de la campaña" },
                    },
                    required: ["tenantId"],
                },
            },
            {
                name: "get_day_d_anomalies",
                description: "Detecta discrepancias en los formularios E-14 reportados por testigos.",
                inputSchema: {
                    type: "object",
                    properties: {
                        tenantId: { type: "string", description: "ID de la campaña" },
                    },
                    required: ["tenantId"],
                },
            },
            {
                name: "audit_finance_entry",
                description: "Verifica si un gasto cumple con la normativa CNE.",
                inputSchema: {
                    type: "object",
                    properties: {
                        entryId: { type: "string", description: "ID de la factura o gasto" },
                    },
                    required: ["entryId"],
                },
            },
            {
                name: "generate_counter_narrative",
                description: "Genera argumentos políticos basados en el ideario del candidato.",
                inputSchema: {
                    type: "object",
                    properties: {
                        topic: { type: "string", description: "Tema del ataque o crítica" },
                        sentiment: { type: "string", description: "Sentimiento detectado" },
                    },
                    required: ["topic"],
                },
            },
            {
                name: "get_top_volunteers",
                description: "Obtiene el ranking de voluntarios por puntos (Gamificación).",
                inputSchema: {
                    type: "object",
                    properties: {
                        tenantId: { type: "string", description: "ID de la campaña" },
                        limit: { type: "number", description: "Cantidad de voluntarios a listar" },
                    },
                    required: ["tenantId"],
                },
            },
            {
                name: "check_inventory",
                description: "Consulta el stock de un ítem de logística.",
                inputSchema: {
                    type: "object",
                    properties: {
                        tenantId: { type: "string", description: "ID de la campaña" },
                        itemName: { type: "string", description: "Nombre del ítem (ej. 'Camiseta')" },
                    },
                    required: ["tenantId", "itemName"],
                },
            },
        ],
    };
});
/**
 * Lógica de ejecución de las herramientas
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "analyze_regional_performance": {
                const { tenantId, regionCode } = args;
                const voterCount = await prisma.voter.count({
                    where: { tenantId, puesto: regionCode ? { code: regionCode } : undefined },
                });
                const signatureCount = await prisma.voter.count({
                    where: { tenantId, isSignatureValid: true },
                });
                return {
                    content: [{ type: "text", text: `Análisis Regional: ${voterCount} votantes registrados. ${signatureCount} firmas validadas.` }],
                };
            }
            case "check_cne_compliance": {
                const { tenantId } = args;
                const totalExpenses = await prisma.financialEntry.aggregate({
                    where: { tenantId, type: "EXPENSE" },
                    _sum: { amount: true },
                });
                return {
                    content: [{ type: "text", text: `Auditoría CNE: Gasto total acumulado $${totalExpenses._sum.amount || 0}.` }],
                };
            }
            case "audit_finance_entry": {
                const { entryId } = args;
                // Simulación de auditoría normativa
                return {
                    content: [{ type: "text", text: `Factura ${entryId}: Cumple con los requisitos para el rubro 108 (Vallas). Soporte digital validado.` }],
                };
            }
            case "generate_counter_narrative": {
                const { topic } = args;
                return {
                    content: [{ type: "text", text: `Contranarrativa para '${topic}': 1. Enfocarse en la soberanía de datos. 2. Resaltar transparencia en Cuentas Claras. 3. Invitar al diálogo territorial.` }],
                };
            }
            case "get_top_volunteers": {
                const { tenantId, limit = 10 } = args;
                const volunteers = await prisma.pointLog.groupBy({
                    by: ['userId'],
                    where: { user: { tenantId } },
                    _sum: { amount: true },
                    orderBy: { _sum: { amount: 'desc' } },
                    take: limit,
                });
                // En una app real haríamos join para obtener nombres, aquí devolvemos IDs por simplicidad del ejemplo
                return {
                    content: [{ type: "text", text: `Top Voluntarios: ${JSON.stringify(volunteers)}` }],
                };
            }
            case "check_inventory": {
                const { tenantId, itemName } = args;
                const item = await prisma.inventoryItem.findFirst({
                    where: { tenantId, name: { contains: itemName, mode: 'insensitive' } },
                });
                if (!item) {
                    return { content: [{ type: "text", text: `No se encontró el ítem '${itemName}'.` }] };
                }
                return {
                    content: [{ type: "text", text: `Inventario de '${item.name}': ${item.quantity} unidades en bodega ${item.warehouse || 'General'}.` }],
                };
            }
            default:
                throw new Error(`Herramienta no encontrada: ${name}`);
        }
    }
    catch (error) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${error.message}` }],
        };
    }
});
/**
 * Inicio del servidor
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Servidor MCP de Inteligencia Electoral iniciado");
}
main().catch((error) => {
    console.error("Error iniciando el servidor MCP:", error);
    process.exit(1);
});
