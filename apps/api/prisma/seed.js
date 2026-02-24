"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var prisma_1 = require("./generated/prisma");
var adapter_pg_1 = require("@prisma/adapter-pg");
var pg = require("pg");
var fs = require("fs");
var path = require("path");
require("dotenv/config");
var connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
var pool = new pg.Pool({ connectionString: connectionString });
var adapter = new adapter_pg_1.PrismaPg(pool);
var prisma = new prisma_1.PrismaClient({ adapter: adapter });
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var tenant, csvPath, content, lines, dataLines, batchSize, i, batch, records, result, finalCount, departamentos, _i, departamentos_1, dep, municipiosClave, munIds, _a, municipiosClave_1, mun, parent_1, m, cities, i, city, code, volunteer, firstNames, lastNames, tags, puestos, i, firstName, lastName, documentId, tag;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('🚀 Iniciando seeding de la Campaña Presidencial 2026...');
                    return [4 /*yield*/, prisma.tenant.upsert({
                            where: { slug: 'victoria-colombia-2026' },
                            update: {},
                            create: {
                                slug: 'victoria-colombia-2026',
                                name: 'Victoria Colombia 2026',
                                type: 'GSC',
                            },
                        })];
                case 1:
                    tenant = _b.sent();
                    // 1.1 Cargar Puestos de Votación desde CSV
                    console.log('🗳️ Cargando puestos de votación desde CSV...');
                    csvPath = path.join(__dirname, '../../../puestos_de_votacion.csv');
                    if (!fs.existsSync(csvPath)) return [3 /*break*/, 7];
                    content = fs.readFileSync(csvPath, 'utf8');
                    lines = content.split(/\r?\n/);
                    dataLines = lines.slice(1).filter(function (line) { return line.trim() !== ''; });
                    batchSize = 1000;
                    i = 0;
                    _b.label = 2;
                case 2:
                    if (!(i < dataLines.length)) return [3 /*break*/, 5];
                    batch = dataLines.slice(i, i + batchSize);
                    records = batch.map(function (line, index) {
                        var cols = line.split(',');
                        if (cols.length < 3)
                            return null;
                        // Formato real: Departamento, Municipio, Puesto, Direccion
                        var _a = cols.map(function (c) { return c.trim().replace(/^"|"$/g, ''); }), departamento = _a[0], municipio = _a[1], puesto = _a[2], direccion = _a[3];
                        // Generar un código único basado en los datos si no vienen DD, MM, ZZ, PP
                        var safeCode = "".concat(departamento, "-").concat(municipio, "-").concat(puesto).replace(/\s+/g, '-').toUpperCase();
                        return {
                            codigo: safeCode,
                            departamento: departamento,
                            municipio: municipio,
                            nombre: puesto,
                            direccion: direccion || 'Sin dirección',
                        };
                    }).filter(function (r) { return r !== null; });
                    if (!(records.length > 0)) return [3 /*break*/, 4];
                    console.log("Subiendo lote de ".concat(records.length, " puestos..."));
                    return [4 /*yield*/, prisma.votingPlace.createMany({
                            data: records,
                            skipDuplicates: true,
                        })];
                case 3:
                    result = _b.sent();
                    console.log("Lote procesado: ".concat(result.count, " insertados."));
                    _b.label = 4;
                case 4:
                    i += batchSize;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, prisma.votingPlace.count()];
                case 6:
                    finalCount = _b.sent();
                    console.log("\u2705 ".concat(finalCount, " puestos de votaci\u00F3n totales en la base de datos."));
                    _b.label = 7;
                case 7:
                    departamentos = [
                        { code: '05', name: 'ANTIOQUIA' },
                        { code: '08', name: 'ATLÁNTICO' },
                        { code: '11', name: 'BOGOTÁ, D.C.' },
                        { code: '13', name: 'BOLÍVAR' },
                        { code: '15', name: 'BOYACÁ' },
                        { code: '17', name: 'CALDAS' },
                        { code: '18', name: 'CAQUETÁ' },
                        { code: '19', name: 'CAUCA' },
                        { code: '20', name: 'CESAR' },
                        { code: '23', name: 'CÓRDOBA' },
                        { code: '25', name: 'CUNDINAMARCA' },
                        { code: '27', name: 'CHOCÓ' },
                        { code: '41', name: 'HUILA' },
                        { code: '44', name: 'LA GUAJIRA' },
                        { code: '47', name: 'MAGDALENA' },
                        { code: '50', name: 'META' },
                        { code: '52', name: 'NARIÑO' },
                        { code: '54', name: 'NORTE DE SANTANDER' },
                        { code: '63', name: 'QUINDÍO' },
                        { code: '66', name: 'RISARALDA' },
                        { code: '68', name: 'SANTANDER' },
                        { code: '70', name: 'SUCRE' },
                        { code: '73', name: 'TOLIMA' },
                        { code: '76', name: 'VALLE DEL CAUCA' },
                        { code: '81', name: 'ARAUCA' },
                        { code: '85', name: 'CASANARE' },
                        { code: '86', name: 'PUTUMAYO' },
                        { code: '88', name: 'SAN ANDRÉS' },
                        { code: '91', name: 'AMAZONAS' },
                        { code: '94', name: 'GUAINÍA' },
                        { code: '95', name: 'GUAVIARE' },
                        { code: '97', name: 'VAUPÉS' },
                        { code: '99', name: 'VICHADA' },
                    ];
                    console.log('📍 Cargando departamentos...');
                    _i = 0, departamentos_1 = departamentos;
                    _b.label = 8;
                case 8:
                    if (!(_i < departamentos_1.length)) return [3 /*break*/, 11];
                    dep = departamentos_1[_i];
                    return [4 /*yield*/, prisma.politicalDivision.upsert({
                            where: { code_type: { code: dep.code, type: 'DEPARTAMENTO' } },
                            update: { name: dep.name },
                            create: {
                                code: dep.code,
                                name: dep.name,
                                type: 'DEPARTAMENTO',
                                tenantId: tenant.id,
                            },
                        })];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 8];
                case 11:
                    municipiosClave = [
                        { code: '11001', name: 'BOGOTÁ, D.C.', parentCode: '11' },
                        { code: '05001', name: 'MEDELLÍN', parentCode: '05' },
                        { code: '76001', name: 'CALI', parentCode: '76' },
                    ];
                    console.log('📍 Cargando municipios clave...');
                    munIds = {};
                    _a = 0, municipiosClave_1 = municipiosClave;
                    _b.label = 12;
                case 12:
                    if (!(_a < municipiosClave_1.length)) return [3 /*break*/, 16];
                    mun = municipiosClave_1[_a];
                    return [4 /*yield*/, prisma.politicalDivision.findUnique({
                            where: { code_type: { code: mun.parentCode, type: 'DEPARTAMENTO' } },
                        })];
                case 13:
                    parent_1 = _b.sent();
                    return [4 /*yield*/, prisma.politicalDivision.upsert({
                            where: { code_type: { code: mun.code, type: 'MUNICIPIO' } },
                            update: { name: mun.name },
                            create: {
                                code: mun.code,
                                name: mun.name,
                                type: 'MUNICIPIO',
                                parentId: parent_1 === null || parent_1 === void 0 ? void 0 : parent_1.id,
                                tenantId: tenant.id,
                            },
                        })];
                case 14:
                    m = _b.sent();
                    munIds[mun.name] = m.id;
                    _b.label = 15;
                case 15:
                    _a++;
                    return [3 /*break*/, 12];
                case 16:
                    // 4. Puestos de Votación (100 simulados)
                    console.log('🗳️ Generando 100 puestos de votación...');
                    cities = ['BOGOTÁ, D.C.', 'MEDELLÍN', 'CALI'];
                    i = 1;
                    _b.label = 17;
                case 17:
                    if (!(i <= 100)) return [3 /*break*/, 20];
                    city = cities[i % 3];
                    code = "PUESTO-".concat(i.toString().padStart(3, '0'));
                    return [4 /*yield*/, prisma.politicalDivision.upsert({
                            where: { code_type: { code: code, type: 'PUESTO' } },
                            update: { name: "Puesto ".concat(i, " - ").concat(city) },
                            create: {
                                code: code,
                                name: "Puesto ".concat(i, " - ").concat(city),
                                type: 'PUESTO',
                                parentId: munIds[city],
                                tenantId: tenant.id,
                            },
                        })];
                case 18:
                    _b.sent();
                    _b.label = 19;
                case 19:
                    i++;
                    return [3 /*break*/, 17];
                case 20: return [4 /*yield*/, prisma.user.upsert({
                        where: { email: 'voluntario@victoria2026.com' },
                        update: {},
                        create: {
                            email: 'voluntario@victoria2026.com',
                            password: 'hash_password_here', // En producción usar bcrypt
                            name: 'Juan Voluntario',
                            role: 'VOLUNTEER',
                            documentId: '12345678',
                            tenantId: tenant.id,
                        },
                    })];
                case 21:
                    volunteer = _b.sent();
                    // 6. Votantes Simulados (50 Simpatizantes)
                    console.log('👥 Creando 50 simpatizantes...');
                    firstNames = ['Carlos', 'Maria', 'Jose', 'Ana', 'Luis', 'Paula', 'Jorge', 'Diana', 'Pedro', 'Sofia'];
                    lastNames = ['Rodriguez', 'Gomez', 'Lopez', 'Garcia', 'Martinez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Diaz'];
                    tags = ['Líder Barrial', 'Indeciso', 'Voto Duro'];
                    return [4 /*yield*/, prisma.politicalDivision.findMany({
                            where: { type: 'PUESTO' },
                            take: 10,
                        })];
                case 22:
                    puestos = _b.sent();
                    i = 0;
                    _b.label = 23;
                case 23:
                    if (!(i < 50)) return [3 /*break*/, 26];
                    firstName = firstNames[i % 10];
                    lastName = lastNames[Math.floor(i / 5) % 10];
                    documentId = (1000000000 + i).toString();
                    tag = tags[i % 3];
                    return [4 /*yield*/, prisma.voter.upsert({
                            where: { documentId_tenantId: { documentId: documentId, tenantId: tenant.id } },
                            update: {
                                firstName: firstName,
                                lastName: lastName,
                                votingIntention: Math.floor(Math.random() * 5) + 1,
                            },
                            create: {
                                documentId: documentId,
                                firstName: firstName,
                                lastName: lastName,
                                phone: "300".concat(Math.floor(Math.random() * 9000000 + 1000000)),
                                email: "".concat(firstName.toLowerCase(), ".").concat(lastName.toLowerCase()).concat(i, "@example.com"),
                                tenantId: tenant.id,
                                registrarId: volunteer.id,
                                puestoId: puestos[i % 10].id,
                                mesa: (i % 20) + 1,
                                psychographicData: { tags: [tag] },
                                votingIntention: Math.floor(Math.random() * 5) + 1,
                                consentAccepted: true,
                            },
                        })];
                case 24:
                    _b.sent();
                    _b.label = 25;
                case 25:
                    i++;
                    return [3 /*break*/, 23];
                case 26:
                    console.log('✅ Seed completado con éxito.');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [4 /*yield*/, pool.end()];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
