import { createHash } from 'node:crypto';
import {
  ElectoralCatalogEntryType,
  ElectoralCodeNamespace,
} from '../../prisma/generated/prisma';
import {
  adaptRnecPublicPackage,
  RNEC_PUBLIC_PACKAGE_FORMAT,
  RnecPublicPackageAdapterError,
} from './rnec-public-package.adapter';

export const RNEC_DIVIPOLE_TREE_PARSER_VERSION =
  'rnec-divipole-tree.v3' as const;

export const RNEC_CATALOG_MAX_CONTENT_BYTES = 25 * 1024 * 1024;
const MAX_DEPARTMENTS = 100;
const MAX_MUNICIPALITIES = 3_000;
const MAX_ZONES = 25_000;
const MAX_POLLING_PLACES = 100_000;
const MAX_EXPECTED_TABLES = 2_147_483_647;

type JsonObject = Record<string, unknown>;

export interface ParsedElectoralCatalogEntry {
  namespace: ElectoralCodeNamespace;
  type: ElectoralCatalogEntryType;
  canonicalCode: string;
  departmentCode: string;
  municipalityCode: string | null;
  zoneCode: string | null;
  pollingPlaceCode: string | null;
  sourceLocationCode: string | null;
  votingDate: string | null;
  timeZone: string | null;
  parentCanonicalCode: string | null;
  name: string;
  nameIsDerived: boolean;
  address: string | null;
  commune: string | null;
  latitude: number | null;
  longitude: number | null;
  expectedTables: number | null;
}

export interface ParsedRnecDivipoleTree {
  contentSha256: string;
  contentBytes: number;
  parserVersion: typeof RNEC_DIVIPOLE_TREE_PARSER_VERSION;
  entries: ParsedElectoralCatalogEntry[];
  counts: {
    records: number;
    departments: number;
    municipalities: number;
    zones: number;
    pollingPlaces: number;
    physicalPollingPlaces: number | null;
    additionalVotingDayRepresentations: number | null;
    physicalPollingPlacesWithoutAddress: number | null;
    physicalPollingPlacesWithoutTimeZone: number | null;
    pollingPlaceRecordsWithoutAddress: number;
    expectedTables: number;
  };
}

export class ElectoralCatalogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElectoralCatalogParseError';
  }
}

export function parseRnecDivipoleTree(content: string): ParsedRnecDivipoleTree {
  if (typeof content !== 'string') {
    throw new ElectoralCatalogParseError(
      'El contenido DIVIPOLE interno debe ser texto JSON',
    );
  }
  const contentBytes = Buffer.byteLength(content, 'utf8');
  if (contentBytes === 0) {
    throw new ElectoralCatalogParseError('El contenido DIVIPOLE esta vacio');
  }
  if (contentBytes > RNEC_CATALOG_MAX_CONTENT_BYTES) {
    throw new ElectoralCatalogParseError(
      `El contenido DIVIPOLE supera el limite de ${RNEC_CATALOG_MAX_CONTENT_BYTES} bytes`,
    );
  }

  let rootValue: unknown;
  try {
    rootValue = JSON.parse(content) as unknown;
  } catch {
    throw new ElectoralCatalogParseError(
      'El contenido DIVIPOLE no es JSON valido',
    );
  }

  try {
    const candidate = requireObject(rootValue, '$');
    if (Object.prototype.hasOwnProperty.call(candidate, 'format')) {
      rootValue = adaptRnecPublicPackage(candidate);
    }
  } catch (error: unknown) {
    if (error instanceof RnecPublicPackageAdapterError) {
      throw new ElectoralCatalogParseError(error.message);
    }
    throw error;
  }

  const root = requireObject(rootValue, '$');
  assertKeys(root, ['departments'], ['electionDate', 'round'], '$');
  const packageElectionDate =
    root.electionDate === undefined
      ? null
      : requiredCivilDate(root.electionDate, '$.electionDate');
  if (
    (root.round === undefined) !== (packageElectionDate === null) ||
    (root.round !== undefined &&
      root.round !== 'FIRST_ROUND' &&
      root.round !== 'SECOND_ROUND')
  ) {
    throw new ElectoralCatalogParseError(
      '$.round debe acompanar electionDate y ser FIRST_ROUND o SECOND_ROUND',
    );
  }
  const departments = requireArray(root.departments, '$.departments');
  requireNonEmpty(departments, '$.departments');
  enforceLimit(departments.length, MAX_DEPARTMENTS, 'departamentos');

  const entries: ParsedElectoralCatalogEntry[] = [];
  const seenCanonicalCodes = new Set<string>();
  let municipalityCount = 0;
  let zoneCount = 0;
  let pollingPlaceCount = 0;
  let expectedTableCount = 0;

  departments.forEach((rawDepartment, departmentIndex) => {
    const path = `$.departments[${departmentIndex}]`;
    const department = requireObject(rawDepartment, path);
    assertKeys(department, ['code', 'name', 'municipalities'], [], path);
    const departmentCode = canonicalCodeSegment(
      department.code,
      2,
      `${path}.code`,
    );
    const departmentCanonical = departmentCode;
    rememberUnique(seenCanonicalCodes, departmentCanonical, path);
    entries.push({
      namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
      type: ElectoralCatalogEntryType.DEPARTMENT,
      canonicalCode: departmentCanonical,
      departmentCode,
      municipalityCode: null,
      zoneCode: null,
      pollingPlaceCode: null,
      sourceLocationCode: null,
      votingDate: null,
      timeZone: null,
      parentCanonicalCode: null,
      name: requiredText(department.name, `${path}.name`, 240),
      nameIsDerived: false,
      address: null,
      commune: null,
      latitude: null,
      longitude: null,
      expectedTables: null,
    });

    const municipalities = requireArray(
      department.municipalities,
      `${path}.municipalities`,
    );
    requireNonEmpty(municipalities, `${path}.municipalities`);
    municipalityCount += municipalities.length;
    enforceLimit(
      municipalityCount,
      MAX_MUNICIPALITIES,
      'municipios acumulados',
    );

    municipalities.forEach((rawMunicipality, municipalityIndex) => {
      const municipalityPath = `${path}.municipalities[${municipalityIndex}]`;
      const municipality = requireObject(rawMunicipality, municipalityPath);
      assertKeys(municipality, ['code', 'name', 'zones'], [], municipalityPath);
      const municipalityCode = canonicalCodeSegment(
        municipality.code,
        3,
        `${municipalityPath}.code`,
      );
      const municipalityCanonical = `${departmentCode}/${municipalityCode}`;
      rememberUnique(
        seenCanonicalCodes,
        municipalityCanonical,
        municipalityPath,
      );
      entries.push({
        namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        type: ElectoralCatalogEntryType.MUNICIPALITY,
        canonicalCode: municipalityCanonical,
        departmentCode,
        municipalityCode,
        zoneCode: null,
        pollingPlaceCode: null,
        sourceLocationCode: null,
        votingDate: null,
        timeZone: null,
        parentCanonicalCode: departmentCanonical,
        name: requiredText(municipality.name, `${municipalityPath}.name`, 240),
        nameIsDerived: false,
        address: null,
        commune: null,
        latitude: null,
        longitude: null,
        expectedTables: null,
      });

      const zones = requireArray(
        municipality.zones,
        `${municipalityPath}.zones`,
      );
      requireNonEmpty(zones, `${municipalityPath}.zones`);
      zoneCount += zones.length;
      enforceLimit(zoneCount, MAX_ZONES, 'zonas acumuladas');

      zones.forEach((rawZone, zoneIndex) => {
        const zonePath = `${municipalityPath}.zones[${zoneIndex}]`;
        const zone = requireObject(rawZone, zonePath);
        assertKeys(zone, ['code', 'stands'], ['name'], zonePath);
        const zoneCode = canonicalCodeSegment(zone.code, 2, `${zonePath}.code`);
        const zoneCanonical = `${municipalityCanonical}/${zoneCode}`;
        rememberUnique(seenCanonicalCodes, zoneCanonical, zonePath);
        const providedZoneName = optionalText(
          zone.name,
          `${zonePath}.name`,
          240,
        );
        entries.push({
          namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          type: ElectoralCatalogEntryType.ZONE,
          canonicalCode: zoneCanonical,
          departmentCode,
          municipalityCode,
          zoneCode,
          pollingPlaceCode: null,
          sourceLocationCode: null,
          votingDate: null,
          timeZone: null,
          parentCanonicalCode: municipalityCanonical,
          name: providedZoneName ?? `Zona ${zoneCode}`,
          nameIsDerived: providedZoneName === null,
          address: null,
          commune: null,
          latitude: null,
          longitude: null,
          expectedTables: null,
        });

        const stands = requireArray(zone.stands, `${zonePath}.stands`);
        requireNonEmpty(stands, `${zonePath}.stands`);
        pollingPlaceCount += stands.length;
        enforceLimit(
          pollingPlaceCount,
          MAX_POLLING_PLACES,
          'puestos acumulados',
        );

        stands.forEach((rawStand, standIndex) => {
          const standPath = `${zonePath}.stands[${standIndex}]`;
          const stand = requireObject(rawStand, standPath);
          assertKeys(
            stand,
            ['code', 'name', 'address', 'countTable'],
            [
              'commune',
              'lat',
              'lng',
              'sourceLocationCode',
              'votingDate',
              'timeZone',
            ],
            standPath,
          );
          const pollingPlaceCode = canonicalPollingPlaceCode(
            stand.code,
            `${standPath}.code`,
          );
          const pollingPlaceCanonical = `${zoneCanonical}/${pollingPlaceCode}`;
          rememberUnique(seenCanonicalCodes, pollingPlaceCanonical, standPath);
          const expectedTables = requiredInteger(
            stand.countTable,
            `${standPath}.countTable`,
            1,
            99_999,
          );
          expectedTableCount += expectedTables;
          if (expectedTableCount > MAX_EXPECTED_TABLES) {
            throw new ElectoralCatalogParseError(
              'La suma de mesas esperadas excede el limite entero permitido',
            );
          }
          const coordinates = optionalCoordinates(
            stand.lat,
            stand.lng,
            standPath,
          );
          const sourceLocationCode = optionalSourceLocationCode(
            stand.sourceLocationCode,
            `${standPath}.sourceLocationCode`,
          );
          const votingDate =
            stand.votingDate === undefined || stand.votingDate === null
              ? null
              : requiredCivilDate(stand.votingDate, `${standPath}.votingDate`);
          const timeZone = optionalTimeZone(
            stand.timeZone,
            `${standPath}.timeZone`,
          );
          if ((sourceLocationCode === null) !== (votingDate === null)) {
            throw new ElectoralCatalogParseError(
              `${standPath}.sourceLocationCode y votingDate deben informarse juntos`,
            );
          }
          if (packageElectionDate && (!sourceLocationCode || !votingDate)) {
            throw new ElectoralCatalogParseError(
              `${standPath} no conserva codigo de ubicacion y jornada del paquete RNEC`,
            );
          }
          entries.push({
            namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
            type: ElectoralCatalogEntryType.POLLING_PLACE,
            canonicalCode: pollingPlaceCanonical,
            departmentCode,
            municipalityCode,
            zoneCode,
            pollingPlaceCode,
            sourceLocationCode,
            votingDate,
            timeZone,
            parentCanonicalCode: zoneCanonical,
            name: requiredText(stand.name, `${standPath}.name`, 240),
            nameIsDerived: false,
            address: optionalText(stand.address, `${standPath}.address`, 500),
            commune: optionalText(stand.commune, `${standPath}.commune`, 240),
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            expectedTables,
          });
        });
      });
    });
  });

  const locationMetrics = analyzePhysicalLocations(
    entries,
    packageElectionDate,
  );

  const counts = {
    records: entries.length,
    departments: departments.length,
    municipalities: municipalityCount,
    zones: zoneCount,
    pollingPlaces: pollingPlaceCount,
    physicalPollingPlaces: locationMetrics?.physicalPollingPlaces ?? null,
    additionalVotingDayRepresentations:
      locationMetrics?.additionalVotingDayRepresentations ?? null,
    physicalPollingPlacesWithoutAddress:
      locationMetrics?.physicalPollingPlacesWithoutAddress ?? null,
    physicalPollingPlacesWithoutTimeZone:
      locationMetrics?.physicalPollingPlacesWithoutTimeZone ?? null,
    pollingPlaceRecordsWithoutAddress: entries.filter(
      (entry) =>
        entry.type === ElectoralCatalogEntryType.POLLING_PLACE &&
        entry.address === null,
    ).length,
    expectedTables: expectedTableCount,
  };

  return {
    contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    contentBytes,
    parserVersion: RNEC_DIVIPOLE_TREE_PARSER_VERSION,
    entries,
    counts,
  };
}

export { RNEC_PUBLIC_PACKAGE_FORMAT };

interface PhysicalLocationMetrics {
  physicalPollingPlaces: number;
  additionalVotingDayRepresentations: number;
  physicalPollingPlacesWithoutAddress: number;
  physicalPollingPlacesWithoutTimeZone: number;
}

function analyzePhysicalLocations(
  entries: readonly ParsedElectoralCatalogEntry[],
  electionDate: string | null,
): PhysicalLocationMetrics | null {
  const pollingPlaces = entries.filter(
    (entry) => entry.type === ElectoralCatalogEntryType.POLLING_PLACE,
  );
  const classified = pollingPlaces.filter(
    (entry) => entry.sourceLocationCode !== null || entry.votingDate !== null,
  );
  if (classified.length === 0) return null;
  if (!electionDate || classified.length !== pollingPlaces.length) {
    throw new ElectoralCatalogParseError(
      'Todos los puestos con identidad fisica requieren electionDate, sourceLocationCode y votingDate',
    );
  }

  const departmentNames = new Map(
    entries
      .filter((entry) => entry.type === ElectoralCatalogEntryType.DEPARTMENT)
      .map((entry) => [entry.departmentCode, normalizedName(entry.name)]),
  );
  const byLocation = new Map<string, ParsedElectoralCatalogEntry[]>();
  for (const entry of pollingPlaces) {
    const sourceLocationCode = entry.sourceLocationCode!;
    const votingDate = entry.votingDate!;
    const departmentName = departmentNames.get(entry.departmentCode);
    if (!departmentName) {
      throw new ElectoralCatalogParseError(
        `No se pudo resolver el departamento de ${entry.canonicalCode}`,
      );
    }
    const dayOffset = civilDayDifference(votingDate, electionDate);
    if (departmentName === 'CONSULADOS') {
      if (dayOffset < -6 || dayOffset > 0) {
        throw new ElectoralCatalogParseError(
          `${entry.canonicalCode}.votingDate debe estar entre el lunes consular y la fecha base`,
        );
      }
    } else {
      if (dayOffset !== 0) {
        throw new ElectoralCatalogParseError(
          `${entry.canonicalCode}.votingDate no puede anticipar un puesto fuera de CONSULADOS`,
        );
      }
      if (entry.timeZone !== 'America/Bogota') {
        throw new ElectoralCatalogParseError(
          `${entry.canonicalCode}.timeZone debe ser America/Bogota para un puesto domestico`,
        );
      }
    }
    const related = byLocation.get(sourceLocationCode) ?? [];
    related.push(entry);
    byLocation.set(sourceLocationCode, related);
  }

  let physicalPollingPlacesWithoutAddress = 0;
  let physicalPollingPlacesWithoutTimeZone = 0;
  for (const [sourceLocationCode, related] of byLocation) {
    const first = related[0];
    if (first.address === null) physicalPollingPlacesWithoutAddress += 1;
    if (first.timeZone === null) physicalPollingPlacesWithoutTimeZone += 1;
    const physicalSignature = physicalLocationSignature(first);
    const dates = new Set<string>();
    for (const entry of related) {
      if (
        physicalLocationSignature(entry) !== physicalSignature ||
        dates.has(entry.votingDate!)
      ) {
        throw new ElectoralCatalogParseError(
          `La ubicacion fisica ${sourceLocationCode} tiene geografia o jornada ambigua`,
        );
      }
      dates.add(entry.votingDate!);
      if (
        related.length > 1 &&
        departmentNames.get(entry.departmentCode) !== 'CONSULADOS'
      ) {
        throw new ElectoralCatalogParseError(
          `La ubicacion fisica ${sourceLocationCode} solo puede repetirse bajo CONSULADOS`,
        );
      }
      if (
        related.length > 1 &&
        entry.parentCanonicalCode !== first.parentCanonicalCode
      ) {
        throw new ElectoralCatalogParseError(
          `La ubicacion fisica ${sourceLocationCode} no puede cruzar zonas consulares`,
        );
      }
    }
    if (related.length > 1 && !dates.has(electionDate)) {
      throw new ElectoralCatalogParseError(
        `La ubicacion fisica ${sourceLocationCode} repetida no incluye su registro base del domingo`,
      );
    }
  }

  return {
    physicalPollingPlaces: byLocation.size,
    additionalVotingDayRepresentations: pollingPlaces.length - byLocation.size,
    physicalPollingPlacesWithoutAddress,
    physicalPollingPlacesWithoutTimeZone,
  };
}

function physicalLocationSignature(entry: ParsedElectoralCatalogEntry): string {
  return JSON.stringify([
    entry.departmentCode,
    entry.municipalityCode,
    entry.zoneCode,
    entry.address,
    entry.commune,
    entry.latitude,
    entry.longitude,
    entry.timeZone,
  ]);
}

function civilDayDifference(value: string, base: string): number {
  const valueTime = Date.parse(`${value}T00:00:00.000Z`);
  const baseTime = Date.parse(`${base}T00:00:00.000Z`);
  return Math.round((valueTime - baseTime) / 86_400_000);
}

function normalizedName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function requireObject(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ElectoralCatalogParseError(`${path} debe ser un objeto`);
  }
  return value as JsonObject;
}

function requiredCivilDate(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new ElectoralCatalogParseError(`${path} debe usar YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ElectoralCatalogParseError(
      `${path} no es una fecha civil valida`,
    );
  }
  return value;
}

function optionalSourceLocationCode(
  value: unknown,
  path: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{1,32}$/u.test(value)) {
    throw new ElectoralCatalogParseError(
      `${path} debe contener entre 1 y 32 digitos`,
    );
  }
  return value;
}

function optionalTimeZone(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/u.test(value)
  ) {
    throw new ElectoralCatalogParseError(
      `${path} debe ser un identificador IANA explicito`,
    );
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
  } catch {
    throw new ElectoralCatalogParseError(`${path} no es una zona IANA valida`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ElectoralCatalogParseError(`${path} debe ser un arreglo`);
  }
  return value;
}

function requireNonEmpty(value: unknown[], path: string): void {
  if (value.length === 0) {
    throw new ElectoralCatalogParseError(`${path} no puede estar vacio`);
  }
}

function assertKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new ElectoralCatalogParseError(
      `${path} contiene campos no soportados: ${unknown.join(', ')}`,
    );
  }
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (missing.length) {
    throw new ElectoralCatalogParseError(
      `${path} no contiene campos obligatorios: ${missing.join(', ')}`,
    );
  }
}

function canonicalCodeSegment(
  value: unknown,
  width: number,
  path: string,
): string {
  let digits: string;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ElectoralCatalogParseError(
        `${path} debe ser un codigo entero no negativo`,
      );
    }
    digits = String(value);
  } else if (typeof value === 'string' && /^\d+$/u.test(value)) {
    digits = value;
  } else {
    throw new ElectoralCatalogParseError(`${path} debe contener solo digitos`);
  }
  if (digits.length > width) {
    throw new ElectoralCatalogParseError(`${path} excede ${width} digitos`);
  }
  return digits.padStart(width, '0');
}

function canonicalPollingPlaceCode(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{2}$/u.test(value)) {
    throw new ElectoralCatalogParseError(
      `${path} debe tener exactamente 2 caracteres alfanumericos en mayuscula`,
    );
  }
  return value;
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFC');
}

function requiredText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ElectoralCatalogParseError(`${path} debe ser texto`);
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new ElectoralCatalogParseError(`${path} no puede estar vacio`);
  }
  if (normalized.length > maxLength) {
    throw new ElectoralCatalogParseError(
      `${path} supera ${maxLength} caracteres`,
    );
  }
  if (containsControlCharacters(normalized)) {
    throw new ElectoralCatalogParseError(
      `${path} contiene caracteres de control`,
    );
  }
  return normalized;
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint === 127 ||
      (codePoint >= 0 && codePoint <= 8) ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31)
    ) {
      return true;
    }
  }
  return false;
}

function optionalText(
  value: unknown,
  path: string,
  maxLength: number,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '')
  )
    return null;
  return requiredText(value, path, maxLength);
}

function requiredInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) {
    throw new ElectoralCatalogParseError(`${path} debe ser un entero`);
  }
  const integer = value as number;
  if (integer < minimum || integer > maximum) {
    throw new ElectoralCatalogParseError(
      `${path} debe estar entre ${minimum} y ${maximum}`,
    );
  }
  return integer;
}

function optionalCoordinates(
  rawLatitude: unknown,
  rawLongitude: unknown,
  path: string,
): { latitude: number | null; longitude: number | null } {
  const latitudeMissing = rawLatitude === undefined || rawLatitude === null;
  const longitudeMissing = rawLongitude === undefined || rawLongitude === null;
  if (latitudeMissing !== longitudeMissing) {
    throw new ElectoralCatalogParseError(
      `${path}.lat y ${path}.lng deben informarse juntos`,
    );
  }
  if (latitudeMissing) return { latitude: null, longitude: null };
  if (typeof rawLatitude !== 'number' || !Number.isFinite(rawLatitude)) {
    throw new ElectoralCatalogParseError(`${path}.lat debe ser numerica`);
  }
  if (typeof rawLongitude !== 'number' || !Number.isFinite(rawLongitude)) {
    throw new ElectoralCatalogParseError(`${path}.lng debe ser numerica`);
  }
  if (rawLatitude < -90 || rawLatitude > 90) {
    throw new ElectoralCatalogParseError(
      `${path}.lat debe estar entre -90 y 90`,
    );
  }
  if (rawLongitude < -180 || rawLongitude > 180) {
    throw new ElectoralCatalogParseError(
      `${path}.lng debe estar entre -180 y 180`,
    );
  }
  return { latitude: rawLatitude, longitude: rawLongitude };
}

function rememberUnique(
  seen: Set<string>,
  canonicalCode: string,
  path: string,
): void {
  if (seen.has(canonicalCode)) {
    throw new ElectoralCatalogParseError(
      `${path} duplica el codigo canonico ${canonicalCode}`,
    );
  }
  seen.add(canonicalCode);
}

function enforceLimit(current: number, maximum: number, label: string): void {
  if (current > maximum) {
    throw new ElectoralCatalogParseError(
      `El contenido supera el limite de ${maximum} ${label}`,
    );
  }
}
