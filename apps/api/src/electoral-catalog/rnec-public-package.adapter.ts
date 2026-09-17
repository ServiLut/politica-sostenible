import { createHash } from 'node:crypto';

export const RNEC_PUBLIC_PACKAGE_FORMAT = 'rnec-public-package.v2' as const;

const RNEC_ELECTION_CONTEXTS = {
  FIRST_ROUND: {
    electionDate: '2026-05-31',
    departmentsTreeUrl:
      'https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json',
    geolocationUrl:
      'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json',
  },
  SECOND_ROUND: {
    electionDate: '2026-06-21',
    departmentsTreeUrl:
      'https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json',
    geolocationUrl:
      'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json',
  },
} as const;
const MAX_CANONICAL_DEPTH = 20;

export type ElectionRound = keyof typeof RNEC_ELECTION_CONTEXTS;

interface ElectionContext {
  electionDate: string;
  round: ElectionRound;
}

const MAX_DEPARTMENTS = 100;
const MAX_MUNICIPALITIES = 3_000;
const MAX_ZONES = 25_000;
const MAX_STANDS = 100_000;
const MAX_GEO_ROWS = 100_000;
const MAX_ALIASES = 100;
const MAX_OVERRIDES = 100_000;
const MAX_COORDINATE_OMISSIONS = 1_000;
const MAX_ERROR_CANDIDATES = 20;

type JsonObject = Record<string, unknown>;

export interface CanonicalRnecTree {
  /** Present only after adapting an election-bound public package. */
  electionDate?: string;
  round?: ElectionRound;
  departments: Array<{
    code: string;
    name: string;
    municipalities: Array<{
      code: string;
      name: string;
      zones: Array<{
        code: string;
        name: string;
        stands: Array<{
          code: string;
          name: string;
          address: string | null;
          commune: string | null;
          lat: number | null;
          lng: number | null;
          sourceLocationCode: string;
          votingDate: string;
          timeZone: string | null;
          countTable: number;
        }>;
      }>;
    }>;
  }>;
}

export class RnecPublicPackageAdapterError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
    readonly candidates: readonly string[] = [],
  ) {
    super(
      `${code} en ${path}: ${message}${
        candidates.length ? `; candidatos=${candidates.join(',')}` : ''
      }`,
    );
    this.name = 'RnecPublicPackageAdapterError';
  }
}

interface GeoRow {
  codigo: string;
  department: string;
  municipality: string;
  stand: string;
  address: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  path: string;
}

interface StandTarget {
  canonical: string;
  zoneCanonical: string;
  department: string;
  municipality: string;
  stand: string;
  exterior: boolean;
  output: CanonicalRnecTree['departments'][number]['municipalities'][number]['zones'][number]['stands'][number];
  path: string;
}

export function adaptRnecPublicPackage(value: unknown): CanonicalRnecTree {
  const envelope = object(value, '$');
  keys(
    envelope,
    ['format', 'election', 'sources'],
    ['departmentAliases', 'overrides', 'coordinateOmissions'],
    '$',
  );
  if (envelope.format !== RNEC_PUBLIC_PACKAGE_FORMAT) {
    fail(
      'RNEC_PACKAGE_FORMAT_UNSUPPORTED',
      '$.format',
      `debe ser ${RNEC_PUBLIC_PACKAGE_FORMAT}`,
    );
  }
  const election = validateElection(envelope.election);
  const sources = object(envelope.sources, '$.sources');
  keys(sources, ['departmentsTree', 'geolocation'], [], '$.sources');
  const treeSource = source(
    sources.departmentsTree,
    '$.sources.departmentsTree',
    'departmentsTree',
    election,
  );
  const geoSource = source(
    sources.geolocation,
    '$.sources.geolocation',
    'geolocation',
    election,
  );
  const aliases = parseAliases(envelope.departmentAliases);
  const overrides = parseOverrides(envelope.overrides);
  const coordinateOmissions = parseCoordinateOmissions(
    envelope.coordinateOmissions,
  );
  const geo = parseGeo(geoSource.payload, coordinateOmissions);
  for (const omission of coordinateOmissions.values()) {
    if (!omission.used) {
      fail(
        'RNEC_COORDINATE_OMISSION_UNUSED',
        omission.path,
        `codigo ${omission.codigo} no corresponde a una coordenada invalida`,
      );
    }
  }
  const geoByCode = new Map<string, GeoRow>();
  const geoByArea = new Map<string, GeoRow[]>();
  const geoByAreaAndName = new Map<string, GeoRow[]>();
  for (const row of geo) {
    if (geoByCode.has(row.codigo)) {
      fail(
        'RNEC_GEO_CODIGO_DUPLICATE',
        row.path,
        `codigo ${row.codigo} repetido`,
      );
    }
    geoByCode.set(row.codigo, row);
    const area = geoAreaKey(row.department, row.municipality);
    const areaRows = geoByArea.get(area) ?? [];
    areaRows.push(row);
    geoByArea.set(area, areaRows);
    const matchName =
      row.department === 'CONSULADOS' ? exteriorName(row.stand) : row.stand;
    const namedRows = geoByAreaAndName.get(`${area}\0${matchName}`) ?? [];
    namedRows.push(row);
    geoByAreaAndName.set(`${area}\0${matchName}`, namedRows);
  }

  const { tree, stands } = parseOfficialTree(treeSource.payload);
  tree.electionDate = election.electionDate;
  tree.round = election.round;
  const standsByCanonical = new Map(
    stands.map((stand) => [stand.canonical, stand]),
  );
  for (const [canonical, codigo] of overrides) {
    if (!standsByCanonical.has(canonical)) {
      fail(
        'RNEC_OVERRIDE_STAND_UNKNOWN',
        '$.overrides',
        `stand ${canonical} no existe en el arbol canonico`,
      );
    }
    if (!geoByCode.has(codigo)) {
      fail(
        'RNEC_OVERRIDE_GEO_UNKNOWN',
        '$.overrides',
        `codigo geo ${codigo} no existe`,
      );
    }
  }

  const usedGeo = new Map<
    string,
    { stand: StandTarget; overridden: boolean }
  >();
  for (const stand of stands) {
    const override = overrides.get(stand.canonical);
    const expectedDepartment =
      aliases.get(stand.department) ?? stand.department;
    const areaKey = geoAreaKey(expectedDepartment, stand.municipality);
    const localGeo = geoByArea.get(areaKey) ?? [];
    const targetName = stand.exterior ? exteriorName(stand.stand) : stand.stand;
    const exactGeo = geoByAreaAndName.get(`${areaKey}\0${targetName}`) ?? [];
    const candidates = override
      ? [geoByCode.get(override)!]
      : exactGeo.length
        ? exactGeo
        : matchGeoPrefixCandidates(stand, localGeo);
    if (candidates.length === 0) {
      fail(
        'RNEC_GEO_MATCH_MISSING',
        stand.path,
        `sin geolocalizacion para ${stand.canonical}`,
      );
    }
    if (candidates.length > 1) {
      fail(
        'RNEC_GEO_MATCH_AMBIGUOUS',
        stand.path,
        `mas de una geolocalizacion coincide con ${stand.canonical}`,
        candidates.slice(0, MAX_ERROR_CANDIDATES).map((row) => row.codigo),
      );
    }
    const match = candidates[0];
    const previous = usedGeo.get(match.codigo);
    const intentionalExteriorReuse = Boolean(
      previous &&
      !override &&
      !previous.overridden &&
      previous.stand.exterior &&
      stand.exterior &&
      previous.stand.zoneCanonical === stand.zoneCanonical &&
      exteriorNamesShareUniqueBase(previous.stand, stand, match, stands),
    );
    if (previous && !intentionalExteriorReuse) {
      fail(
        'RNEC_GEO_REUSED',
        stand.path,
        `codigo ${match.codigo} ya fue asignado a ${previous.stand.canonical}`,
        [previous.stand.canonical, stand.canonical],
      );
    }
    if (!previous) {
      usedGeo.set(match.codigo, { stand, overridden: Boolean(override) });
    }
    stand.output.address = match.address;
    stand.output.commune = match.commune;
    stand.output.lat = match.lat;
    stand.output.lng = match.lng;
    stand.output.sourceLocationCode = match.codigo;
    stand.output.votingDate = votingDateForStand(stand, election.electionDate);
    stand.output.timeZone = stand.exterior ? null : 'America/Bogota';
  }

  const unused = geo.filter((row) => !usedGeo.has(row.codigo));
  if (unused.length) {
    fail(
      'RNEC_GEO_UNUSED',
      '$.sources.geolocation.payload',
      `${unused.length} filas no corresponden a ningun stand del arbol`,
      unused.slice(0, MAX_ERROR_CANDIDATES).map((row) => row.codigo),
    );
  }
  return tree;
}

function validateElection(value: unknown): ElectionContext {
  const election = object(value, '$.election');
  keys(
    election,
    ['name', 'electionDate', 'round', 'cutoffAt'],
    [],
    '$.election',
  );
  text(election.name, '$.election.name', 200);
  const electionDate = text(
    election.electionDate,
    '$.election.electionDate',
    10,
  );
  const parsedElectionDate = new Date(`${electionDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(electionDate) ||
    Number.isNaN(parsedElectionDate.getTime()) ||
    parsedElectionDate.toISOString().slice(0, 10) !== electionDate
  ) {
    fail(
      'RNEC_ELECTION_DATE_INVALID',
      '$.election.electionDate',
      'debe usar YYYY-MM-DD',
    );
  }
  const round = text(election.round, '$.election.round', 20);
  if (!(round in RNEC_ELECTION_CONTEXTS)) {
    fail(
      'RNEC_ELECTION_ROUND_INVALID',
      '$.election.round',
      'debe ser FIRST_ROUND o SECOND_ROUND',
    );
  }
  const typedRound = round as ElectionRound;
  if (RNEC_ELECTION_CONTEXTS[typedRound].electionDate !== electionDate) {
    fail(
      'RNEC_ELECTION_CONTEXT_MISMATCH',
      '$.election.electionDate',
      'la fecha no corresponde a la vuelta declarada',
    );
  }
  iso(election.cutoffAt, '$.election.cutoffAt');
  return { electionDate, round: typedRound };
}

function source(
  value: unknown,
  path: string,
  kind: 'departmentsTree' | 'geolocation',
  election: ElectionContext,
): { payload: unknown } {
  const result = object(value, path);
  keys(
    result,
    [
      'sourceUrl',
      'sourceContext',
      'retrievedAt',
      'rawContentSha256',
      'payloadCanonicalSha256',
      'payload',
    ],
    [],
    path,
  );
  const urlValue = text(result.sourceUrl, `${path}.sourceUrl`, 1_024);
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    fail(
      'RNEC_SOURCE_URL_INVALID',
      `${path}.sourceUrl`,
      'debe ser URL HTTPS valida',
    );
  }
  if (url!.protocol !== 'https:') {
    fail('RNEC_SOURCE_URL_INVALID', `${path}.sourceUrl`, 'debe usar HTTPS');
  }
  const host = url!.hostname.toLowerCase().replace(/\.$/u, '');
  if (
    host !== 'registraduria.gov.co' &&
    !host.endsWith('.registraduria.gov.co')
  ) {
    fail(
      'RNEC_SOURCE_URL_INVALID',
      `${path}.sourceUrl`,
      'debe pertenecer a registraduria.gov.co',
    );
  }
  if (url!.username || url!.password || url!.search || url!.hash) {
    fail(
      'RNEC_SOURCE_URL_INVALID',
      `${path}.sourceUrl`,
      'no admite credenciales, query ni fragmento',
    );
  }
  const expectedUrl =
    kind === 'departmentsTree'
      ? RNEC_ELECTION_CONTEXTS[election.round].departmentsTreeUrl
      : RNEC_ELECTION_CONTEXTS[election.round].geolocationUrl;
  if (url!.toString() !== expectedUrl) {
    fail(
      'RNEC_SOURCE_URL_CONTEXT_MISMATCH',
      `${path}.sourceUrl`,
      `la URL no corresponde a ${election.round} y ${kind}`,
    );
  }
  const sourceContext = object(result.sourceContext, `${path}.sourceContext`);
  keys(sourceContext, ['electionDate', 'round'], [], `${path}.sourceContext`);
  if (
    sourceContext.electionDate !== election.electionDate ||
    sourceContext.round !== election.round
  ) {
    fail(
      'RNEC_SOURCE_CONTEXT_MISMATCH',
      `${path}.sourceContext`,
      'debe coincidir exactamente con election',
    );
  }
  const rawContentSha256 = text(
    result.rawContentSha256,
    `${path}.rawContentSha256`,
    64,
  );
  if (!/^[a-f0-9]{64}$/u.test(rawContentSha256)) {
    fail(
      'RNEC_SOURCE_SHA256_INVALID',
      `${path}.rawContentSha256`,
      'debe ser SHA-256 hexadecimal en minuscula; se conserva como evidencia declarada de los bytes locales',
    );
  }
  const declaredCanonicalSha256 = text(
    result.payloadCanonicalSha256,
    `${path}.payloadCanonicalSha256`,
    64,
  );
  if (!/^[a-f0-9]{64}$/u.test(declaredCanonicalSha256)) {
    fail(
      'RNEC_SOURCE_SHA256_INVALID',
      `${path}.payloadCanonicalSha256`,
      'debe ser SHA-256 hexadecimal en minuscula',
    );
  }
  const calculatedCanonicalSha256 = calculateCanonicalPayloadSha256(
    result.payload,
    `${path}.payload`,
  );
  if (declaredCanonicalSha256 !== calculatedCanonicalSha256) {
    fail(
      'RNEC_SOURCE_PAYLOAD_SHA256_MISMATCH',
      `${path}.payloadCanonicalSha256`,
      'no coincide con la huella recalculada del payload embebido',
    );
  }
  iso(result.retrievedAt, `${path}.retrievedAt`);
  return { payload: result.payload };
}

export function calculateCanonicalPayloadSha256(
  value: unknown,
  path = '$',
): string {
  return createHash('sha256')
    .update(canonicalJson(value, path, 0, new WeakSet<object>()), 'utf8')
    .digest('hex');
}

function canonicalJson(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>,
): string {
  if (depth > MAX_CANONICAL_DEPTH) {
    fail('RNEC_SOURCE_PAYLOAD_INVALID', path, 'excede la profundidad segura');
  }
  if (value === null || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (typeof value !== 'object') {
    fail('RNEC_SOURCE_PAYLOAD_INVALID', path, 'contiene un valor no JSON');
  }
  if (ancestors.has(value)) {
    fail(
      'RNEC_SOURCE_PAYLOAD_INVALID',
      path,
      'contiene una referencia circular',
    );
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) =>
          canonicalJson(item, `${path}[${index}]`, depth + 1, ancestors),
        )
        .join(',')}]`;
    }
    const record = value as JsonObject;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            record[key],
            `${path}.${key}`,
            depth + 1,
            ancestors,
          )}`,
      )
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function parseAliases(value: unknown): Map<string, string> {
  if (value === undefined) return new Map();
  const list = array(value, '$.departmentAliases', MAX_ALIASES);
  const result = new Map<string, string>();
  const usedGeo = new Set<string>();
  list.forEach((raw, index) => {
    const path = `$.departmentAliases[${index}]`;
    const alias = object(raw, path);
    keys(alias, ['treeName', 'geolocationName'], [], path);
    const treeName = normalized(text(alias.treeName, `${path}.treeName`, 240));
    const geoName = normalized(
      text(alias.geolocationName, `${path}.geolocationName`, 240),
    );
    if (result.has(treeName) || usedGeo.has(geoName)) {
      fail(
        'RNEC_DEPARTMENT_ALIAS_DUPLICATE',
        path,
        'alias duplicado o reutilizado',
      );
    }
    result.set(treeName, geoName);
    usedGeo.add(geoName);
  });
  return result;
}

function parseOverrides(value: unknown): Map<string, string> {
  if (value === undefined) return new Map();
  const list = array(value, '$.overrides', MAX_OVERRIDES);
  const result = new Map<string, string>();
  const usedCodes = new Set<string>();
  list.forEach((raw, index) => {
    const path = `$.overrides[${index}]`;
    const override = object(raw, path);
    keys(override, ['stand', 'codigo'], [], path);
    const stand = text(override.stand, `${path}.stand`, 14);
    if (!/^\d{2}\/\d{3}\/\d{2}\/[A-Z0-9]{2}$/u.test(stand)) {
      fail(
        'RNEC_OVERRIDE_STAND_INVALID',
        `${path}.stand`,
        'codigo canonico invalido',
      );
    }
    const codigo = scalarCode(override.codigo, `${path}.codigo`);
    if (result.has(stand) || usedCodes.has(codigo)) {
      fail('RNEC_OVERRIDE_DUPLICATE', path, 'stand o codigo geo repetido');
    }
    result.set(stand, codigo);
    usedCodes.add(codigo);
  });
  return result;
}

interface CoordinateOmission {
  codigo: string;
  originalLat: number;
  originalLng: number;
  path: string;
  used: boolean;
}

function parseCoordinateOmissions(
  value: unknown,
): Map<string, CoordinateOmission> {
  if (value === undefined) return new Map();
  const list = array(value, '$.coordinateOmissions', MAX_COORDINATE_OMISSIONS);
  const result = new Map<string, CoordinateOmission>();
  list.forEach((raw, index) => {
    const path = `$.coordinateOmissions[${index}]`;
    const omission = object(raw, path);
    keys(
      omission,
      [
        'action',
        'codigo',
        'originalLat',
        'originalLng',
        'justification',
        'evidenceReference',
      ],
      [],
      path,
    );
    if (omission.action !== 'OMIT_COORDINATES') {
      fail(
        'RNEC_COORDINATE_OMISSION_ACTION_INVALID',
        `${path}.action`,
        'debe ser OMIT_COORDINATES',
      );
    }
    const codigo = scalarCode(omission.codigo, `${path}.codigo`);
    if (result.has(codigo)) {
      fail(
        'RNEC_COORDINATE_OMISSION_DUPLICATE',
        path,
        `codigo ${codigo} repetido`,
      );
    }
    const originalLat = finiteNumber(
      omission.originalLat,
      `${path}.originalLat`,
    );
    const originalLng = finiteNumber(
      omission.originalLng,
      `${path}.originalLng`,
    );
    const justification = text(
      omission.justification,
      `${path}.justification`,
      1_000,
    );
    if (justification.length < 20) {
      fail(
        'RNEC_COORDINATE_OMISSION_JUSTIFICATION_INVALID',
        `${path}.justification`,
        'debe tener al menos 20 caracteres',
      );
    }
    officialEvidenceUrl(
      omission.evidenceReference,
      `${path}.evidenceReference`,
    );
    result.set(codigo, {
      codigo,
      originalLat,
      originalLng,
      path,
      used: false,
    });
  });
  return result;
}

function parseGeo(
  value: unknown,
  omissions: Map<string, CoordinateOmission>,
): GeoRow[] {
  const list = array(value, '$.sources.geolocation.payload', MAX_GEO_ROWS);
  if (!list.length)
    fail(
      'RNEC_GEO_EMPTY',
      '$.sources.geolocation.payload',
      'no puede estar vacio',
    );
  return list.map((raw, index) => {
    const path = `$.sources.geolocation.payload[${index}]`;
    const row = object(raw, path);
    keys(
      row,
      [
        'codigo',
        'departamento',
        'municipio',
        'puesto',
        'comuna',
        'direccion',
        'lat',
        'lng',
      ],
      [],
      path,
    );
    const codigo = scalarCode(row.codigo, `${path}.codigo`);
    const rawLat = finiteNumber(row.lat, `${path}.lat`);
    const rawLng = finiteNumber(row.lng, `${path}.lng`);
    const coordinatesInvalid =
      rawLat < -90 || rawLat > 90 || rawLng < -180 || rawLng > 180;
    const omission = omissions.get(codigo);
    if (coordinatesInvalid && !omission) {
      fail(
        'RNEC_COORDINATE_INVALID',
        rawLat < -90 || rawLat > 90 ? `${path}.lat` : `${path}.lng`,
        'coordenada fuera de rango sin regla OMIT_COORDINATES',
      );
    }
    if (
      omission &&
      (!Object.is(omission.originalLat, rawLat) ||
        !Object.is(omission.originalLng, rawLng))
    ) {
      fail(
        'RNEC_COORDINATE_OMISSION_TAMPERED',
        omission.path,
        'los valores originales declarados no coinciden exactamente con la fuente',
      );
    }
    if (omission && !coordinatesInvalid) {
      fail(
        'RNEC_COORDINATE_OMISSION_UNUSED',
        omission.path,
        'no se permite omitir coordenadas validas',
      );
    }
    if (omission) omission.used = true;
    return {
      codigo,
      department: normalized(
        text(row.departamento, `${path}.departamento`, 240),
      ),
      municipality: normalized(text(row.municipio, `${path}.municipio`, 240)),
      stand: normalized(text(row.puesto, `${path}.puesto`, 500)),
      address: nullableText(row.direccion, `${path}.direccion`, 500),
      commune: nullableText(row.comuna, `${path}.comuna`, 240),
      lat: omission ? null : coordinate(rawLat, `${path}.lat`, -90, 90),
      lng: omission ? null : coordinate(rawLng, `${path}.lng`, -180, 180),
      path,
    };
  });
}

function parseOfficialTree(value: unknown): {
  tree: CanonicalRnecTree;
  stands: StandTarget[];
} {
  const root = object(value, '$.sources.departmentsTree.payload');
  keys(root, ['data'], [], '$.sources.departmentsTree.payload');
  const data = object(root.data, '$.sources.departmentsTree.payload.data');
  keys(data, ['departmentsTree'], [], '$.sources.departmentsTree.payload.data');
  const graph = object(
    data.departmentsTree,
    '$.sources.departmentsTree.payload.data.departmentsTree',
  );
  keys(
    graph,
    ['edges'],
    [],
    '$.sources.departmentsTree.payload.data.departmentsTree',
  );
  const edges = array(
    graph.edges,
    '$.sources.departmentsTree.payload.data.departmentsTree.edges',
    MAX_DEPARTMENTS,
  );
  if (!edges.length)
    fail(
      'RNEC_TREE_EMPTY',
      '$.sources.departmentsTree.payload.data.departmentsTree.edges',
      'no puede estar vacio',
    );
  const tree: CanonicalRnecTree = { departments: [] };
  const stands: StandTarget[] = [];
  let municipalityCount = 0;
  let zoneCount = 0;
  let standCount = 0;
  const canonicals = new Set<string>();
  edges.forEach((rawEdge, departmentIndex) => {
    const edgePath = `$.sources.departmentsTree.payload.data.departmentsTree.edges[${departmentIndex}]`;
    const edge = object(rawEdge, edgePath);
    keys(edge, ['node'], [], edgePath);
    const raw = object(edge.node, `${edgePath}.node`);
    keys(
      raw,
      ['idDepartmentCode', 'departmentName', 'municipalities'],
      [],
      `${edgePath}.node`,
    );
    const departmentCode = numericCode(
      raw.idDepartmentCode,
      2,
      `${edgePath}.node.idDepartmentCode`,
    );
    unique(canonicals, departmentCode, edgePath);
    const departmentName = text(
      raw.departmentName,
      `${edgePath}.node.departmentName`,
      240,
    );
    const department = {
      code: departmentCode,
      name: departmentName,
      municipalities:
        [] as CanonicalRnecTree['departments'][number]['municipalities'],
    };
    tree.departments.push(department);
    const municipalities = array(
      raw.municipalities,
      `${edgePath}.node.municipalities`,
      MAX_MUNICIPALITIES,
    );
    if (!municipalities.length)
      fail(
        'RNEC_TREE_EMPTY_LEVEL',
        `${edgePath}.node.municipalities`,
        'no puede estar vacio',
      );
    municipalityCount += municipalities.length;
    limit(
      municipalityCount,
      MAX_MUNICIPALITIES,
      'RNEC_TREE_LIMIT',
      'municipios',
    );
    municipalities.forEach((rawMunicipality, municipalityIndex) => {
      const path = `${edgePath}.node.municipalities[${municipalityIndex}]`;
      const sourceMunicipality = object(rawMunicipality, path);
      keys(
        sourceMunicipality,
        ['idMunicipality', 'municipalityCode', 'municipalityName', 'zones'],
        [],
        path,
      );
      scalarCode(sourceMunicipality.idMunicipality, `${path}.idMunicipality`);
      const municipalityCode = numericCode(
        sourceMunicipality.municipalityCode,
        3,
        `${path}.municipalityCode`,
      );
      const municipalityCanonical = `${departmentCode}/${municipalityCode}`;
      unique(canonicals, municipalityCanonical, path);
      const municipalityName = text(
        sourceMunicipality.municipalityName,
        `${path}.municipalityName`,
        240,
      );
      const municipality = {
        code: municipalityCode,
        name: municipalityName,
        zones:
          [] as CanonicalRnecTree['departments'][number]['municipalities'][number]['zones'],
      };
      department.municipalities.push(municipality);
      const zones = array(sourceMunicipality.zones, `${path}.zones`, MAX_ZONES);
      if (!zones.length)
        fail('RNEC_TREE_EMPTY_LEVEL', `${path}.zones`, 'no puede estar vacio');
      zoneCount += zones.length;
      limit(zoneCount, MAX_ZONES, 'RNEC_TREE_LIMIT', 'zonas');
      zones.forEach((rawZone, zoneIndex) => {
        const zonePath = `${path}.zones[${zoneIndex}]`;
        const sourceZone = object(rawZone, zonePath);
        keys(
          sourceZone,
          ['idZone', 'idZoneCode', 'zoneName', 'corporations', 'stands'],
          [],
          zonePath,
        );
        scalarCode(sourceZone.idZone, `${zonePath}.idZone`);
        const zoneCode = numericCode(
          sourceZone.idZoneCode,
          2,
          `${zonePath}.idZoneCode`,
        );
        const zoneCanonical = `${municipalityCanonical}/${zoneCode}`;
        unique(canonicals, zoneCanonical, zonePath);
        const corporations = array(
          sourceZone.corporations,
          `${zonePath}.corporations`,
          100,
        );
        corporations.forEach((code, index) =>
          scalarCode(code, `${zonePath}.corporations[${index}]`),
        );
        const zone = {
          code: zoneCode,
          name: text(sourceZone.zoneName, `${zonePath}.zoneName`, 240),
          stands:
            [] as CanonicalRnecTree['departments'][number]['municipalities'][number]['zones'][number]['stands'],
        };
        municipality.zones.push(zone);
        const rawStands = array(
          sourceZone.stands,
          `${zonePath}.stands`,
          MAX_STANDS,
        );
        if (!rawStands.length)
          fail(
            'RNEC_TREE_EMPTY_LEVEL',
            `${zonePath}.stands`,
            'no puede estar vacio',
          );
        standCount += rawStands.length;
        limit(standCount, MAX_STANDS, 'RNEC_TREE_LIMIT', 'puestos');
        rawStands.forEach((rawStand, standIndex) => {
          const standPath = `${zonePath}.stands[${standIndex}]`;
          const sourceStand = object(rawStand, standPath);
          keys(
            sourceStand,
            ['idStand', 'standCode', 'standName', 'countTable'],
            [],
            standPath,
          );
          sourceId(sourceStand.idStand, `${standPath}.idStand`);
          const standCode = standCodeValue(
            sourceStand.standCode,
            `${standPath}.standCode`,
          );
          const canonical = `${zoneCanonical}/${standCode}`;
          unique(canonicals, canonical, standPath);
          const standName = text(
            sourceStand.standName,
            `${standPath}.standName`,
            240,
          );
          const countTable = integer(
            sourceStand.countTable,
            `${standPath}.countTable`,
            1,
            99_999,
          );
          const output: CanonicalRnecTree['departments'][number]['municipalities'][number]['zones'][number]['stands'][number] =
            {
              code: standCode,
              name: standName,
              address: null,
              commune: null,
              lat: null,
              lng: null,
              sourceLocationCode: '',
              votingDate: '',
              timeZone: null,
              countTable,
            };
          zone.stands.push(output);
          stands.push({
            canonical,
            zoneCanonical,
            department: normalized(departmentName),
            municipality: normalized(municipalityName),
            stand: normalized(standName),
            exterior: normalized(departmentName) === 'CONSULADOS',
            output,
            path: standPath,
          });
        });
      });
    });
  });
  return { tree, stands };
}

function matchGeoPrefixCandidates(
  stand: StandTarget,
  geo: readonly GeoRow[],
): GeoRow[] {
  const targetName = stand.exterior ? exteriorName(stand.stand) : stand.stand;
  if (targetName.length < 12) return [];
  return geo.filter((row) => {
    const candidate = stand.exterior ? exteriorName(row.stand) : row.stand;
    return candidate.startsWith(targetName) || targetName.startsWith(candidate);
  });
}

function geoAreaKey(department: string, municipality: string): string {
  return `${department}\0${municipality}`;
}

const CONSULAR_VOTING_DAY_OFFSET = {
  LUNES: -6,
  MARTES: -5,
  MIERCOLES: -4,
  JUEVES: -3,
  VIERNES: -2,
  SABADO: -1,
  DOMINGO: 0,
} as const;

/**
 * The declared electionDate is the Sunday/base civil date. Only a leading,
 * unambiguous weekday on a CONSULADOS stand denotes an earlier logical voting
 * day. Names elsewhere (for example "DOMINGO SAVIO") are ordinary names.
 */
function votingDateForStand(stand: StandTarget, electionDate: string): string {
  if (!stand.exterior) return electionDate;
  const weekday = Object.keys(CONSULAR_VOTING_DAY_OFFSET).find((candidate) =>
    stand.stand.startsWith(`${candidate} `),
  ) as keyof typeof CONSULAR_VOTING_DAY_OFFSET | undefined;
  if (!weekday) return electionDate;

  const date = new Date(`${electionDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + CONSULAR_VOTING_DAY_OFFSET[weekday]);
  return date.toISOString().slice(0, 10);
}

function exteriorName(value: string): string {
  return value.replace(
    /^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+/u,
    '',
  );
}

function hasExteriorWeekday(value: string): boolean {
  return /^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+/u.test(
    value,
  );
}

function prefixRelated(first: string, second: string): boolean {
  return (
    Math.min(first.length, second.length) >= 12 &&
    (first.startsWith(second) || second.startsWith(first))
  );
}

function exteriorNamesShareUniqueBase(
  previous: StandTarget,
  current: StandTarget,
  geo: GeoRow,
  allStands: StandTarget[],
): boolean {
  const previousName = exteriorName(previous.stand);
  const currentName = exteriorName(current.stand);
  if (
    previousName !== currentName &&
    !prefixRelated(previousName, currentName)
  ) {
    return false;
  }
  const geoName = exteriorName(geo.stand);
  const baseCandidates = allStands.filter(
    (candidate) =>
      candidate.exterior &&
      candidate.zoneCanonical === current.zoneCanonical &&
      !hasExteriorWeekday(candidate.stand) &&
      (exteriorName(candidate.stand) === geoName ||
        prefixRelated(exteriorName(candidate.stand), geoName)),
  );
  return baseCandidates.length === 1;
}

function normalized(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail('RNEC_TYPE_OBJECT', path, 'debe ser objeto');
  return value as JsonObject;
}

function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) fail('RNEC_TYPE_ARRAY', path, 'debe ser arreglo');
  limit(value.length, maximum, 'RNEC_ARRAY_LIMIT', path);
  return value;
}

function keys(
  value: JsonObject,
  required: string[],
  optional: string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail('RNEC_UNKNOWN_FIELDS', path, unknown.join(','));
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (missing.length) fail('RNEC_REQUIRED_FIELDS', path, missing.join(','));
}

function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string') fail('RNEC_TYPE_TEXT', path, 'debe ser texto');
  const result = value.trim().normalize('NFC');
  const hasForbiddenControl = Array.from(result).some((character) => {
    const code = character.charCodeAt(0);
    return (
      code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
    );
  });
  if (!result || result.length > maximum || hasForbiddenControl)
    fail(
      'RNEC_TEXT_INVALID',
      path,
      `texto vacio, mayor a ${maximum} o con controles`,
    );
  return result;
}

function nullableText(
  value: unknown,
  path: string,
  maximum: number,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '')
  )
    return null;
  return text(value, path, maximum);
}

function scalarCode(value: unknown, path: string): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^\d+$/u.test(String(value))
  )
    fail('RNEC_CODE_INVALID', path, 'debe contener digitos');
  const result = String(value);
  if (result.length > 32) fail('RNEC_CODE_INVALID', path, 'supera 32 digitos');
  return result;
}

function sourceId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Z0-9]+$/u.test(value) ||
    value.length > 32
  ) {
    fail(
      'RNEC_SOURCE_ID_INVALID',
      path,
      'debe contener entre 1 y 32 caracteres A-Z/0-9',
    );
  }
  return value;
}

function numericCode(value: unknown, width: number, path: string): string {
  const result = scalarCode(value, path);
  if (result.length !== width)
    fail('RNEC_CODE_WIDTH', path, `debe tener exactamente ${width} digitos`);
  return result;
}

function standCodeValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{2}$/u.test(value))
    fail(
      'RNEC_STAND_CODE_INVALID',
      path,
      'debe tener exactamente 2 caracteres A-Z/0-9 en mayuscula',
    );
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(
      'RNEC_INTEGER_INVALID',
      path,
      `debe ser entero entre ${minimum} y ${maximum}`,
    );
  return value as number;
}

function coordinate(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    fail(
      'RNEC_COORDINATE_INVALID',
      path,
      `debe estar entre ${minimum} y ${maximum}`,
    );
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('RNEC_COORDINATE_INVALID', path, 'debe ser un numero finito');
  }
  return value;
}

function officialEvidenceUrl(value: unknown, path: string): void {
  const reference = text(value, path, 2_048);
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    fail(
      'RNEC_COORDINATE_OMISSION_EVIDENCE_INVALID',
      path,
      'debe ser URL publica HTTPS de RNEC',
    );
  }
  const host = url!.hostname.toLowerCase().replace(/\.$/u, '');
  if (
    url!.protocol !== 'https:' ||
    url!.username !== '' ||
    url!.password !== '' ||
    url!.search !== '' ||
    url!.hash !== '' ||
    (host !== 'registraduria.gov.co' && !host.endsWith('.registraduria.gov.co'))
  ) {
    fail(
      'RNEC_COORDINATE_OMISSION_EVIDENCE_INVALID',
      path,
      'debe ser URL publica HTTPS de RNEC sin credenciales, query ni fragmento',
    );
  }
}

function iso(value: unknown, path: string): string {
  const result = text(value, path, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T/u.test(result) ||
    !Number.isFinite(new Date(result).getTime())
  )
    fail('RNEC_DATE_INVALID', path, 'debe ser fecha ISO');
  return result;
}

function unique(seen: Set<string>, value: string, path: string): void {
  if (seen.has(value)) fail('RNEC_CANONICAL_DUPLICATE', path, value);
  seen.add(value);
}

function limit(
  current: number,
  maximum: number,
  code: string,
  label: string,
): void {
  if (current > maximum) fail(code, label, `supera ${maximum}`);
}

function fail(
  code: string,
  path: string,
  message: string,
  candidates: string[] = [],
): never {
  throw new RnecPublicPackageAdapterError(code, path, message, candidates);
}
