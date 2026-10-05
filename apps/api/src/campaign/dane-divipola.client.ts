import { Injectable } from '@nestjs/common';

/**
 * Fuente oficial de la división político-administrativa colombiana.
 *
 * DANE, DIVIPOLA según el Marco Geoestadístico Nacional (MGN), versión 2025.
 * Las capas 317 y 319 contienen municipios y departamentos respectivamente.
 * Sus centroides administrativos no representan puestos de votación.
 */
export const DANE_DIVIPOLA_SOURCE = Object.freeze({
  organization: 'Departamento Administrativo Nacional de Estadística (DANE)',
  dataset: 'DIVIPOLA según Marco Geoestadístico Nacional (MGN)',
  version: '2025',
  layer: 'Municipio (317)',
  layerUrl:
    'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/317',
  departmentLayer: 'Departamento (319)',
  departmentLayerUrl:
    'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/319',
  coordinateSystem: 'EPSG:4326',
});

const DANE_HOSTNAME = 'geoportal.dane.gov.co';
const DANE_QUERY_BASE =
  '/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer';
const DANE_REQUEST_TIMEOUT_MS = 12_000;
const DANE_MAX_RECORDS = 2_000;
const DANE_MAX_RESPONSE_BYTES = 2_000_000;

export interface DaneDepartment {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface DaneMunicipality {
  departmentCode: string;
  departmentName: string;
  municipalityCode: string;
  municipalityName: string;
  latitude: number;
  longitude: number;
}

export class DaneDivipolaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = DaneDivipolaError.name;
  }
}

@Injectable()
export class DaneDivipolaClient {
  async fetchMunicipalities(): Promise<DaneMunicipality[]> {
    return this.parseMunicipalities(await this.fetchLayer('317'));
  }

  async fetchDepartments(): Promise<DaneDepartment[]> {
    const features = this.parseFeatures(await this.fetchLayer('319'));
    const codes = new Set<string>();
    return features.map((feature) => {
      const attributes = this.parseAttributes(feature);
      const code = parseCode(attributes.DPTO_CCDGO, /^\d{2}$/, 'DPTO_CCDGO');
      if (codes.has(code)) {
        throw new DaneDivipolaError(
          `DANE reportó dos veces el departamento ${code}`,
        );
      }
      codes.add(code);
      return {
        code,
        name: parseName(attributes.DPTO_CNMBRE, 'DPTO_CNMBRE'),
        ...parseCentroid(feature),
      };
    });
  }

  private async fetchLayer(layer: '317' | '319'): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      DANE_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(this.createQueryUrl(layer), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DaneDivipolaError(
          `DANE respondió con estado HTTP ${response.status}`,
        );
      }

      const body = await readBoundedBody(response);

      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch (error) {
        throw new DaneDivipolaError('DANE devolvió JSON inválido', {
          cause: error,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof DaneDivipolaError) {
        throw error;
      }

      const message = controller.signal.aborted
        ? 'La consulta a DANE excedió el tiempo límite'
        : 'No fue posible consultar el servicio de DANE';
      throw new DaneDivipolaError(message, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  private createQueryUrl(layer: '317' | '319'): URL {
    const source =
      layer === '317'
        ? DANE_DIVIPOLA_SOURCE.layerUrl
        : DANE_DIVIPOLA_SOURCE.departmentLayerUrl;
    const url = new URL(`${source}/query`);

    // Defensa en profundidad: el destino no puede alterarse mediante variables
    // de entorno ni datos de la solicitud.
    if (
      url.protocol !== 'https:' ||
      url.hostname !== DANE_HOSTNAME ||
      !['317', '319'].includes(layer) ||
      url.pathname !== `${DANE_QUERY_BASE}/${layer}/query` ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      throw new DaneDivipolaError('La fuente DANE configurada no es válida');
    }

    url.search = new URLSearchParams({
      f: 'json',
      where: '1=1',
      outFields:
        layer === '317'
          ? 'DPTO_CCDGO,DPTO_CNMBRE,MPIO_CDPMP,MPIO_CNMBRE'
          : 'DPTO_CCDGO,DPTO_CNMBRE',
      returnGeometry: 'false',
      returnCentroid: 'true',
      outSR: '4326',
      orderByFields: layer === '317' ? 'MPIO_CDPMP ASC' : 'DPTO_CCDGO ASC',
    }).toString();

    return url;
  }

  private parseFeatures(payload: unknown): Record<string, unknown>[] {
    if (!isRecord(payload)) {
      throw new DaneDivipolaError('La respuesta de DANE no es un objeto');
    }

    if ('error' in payload) {
      throw new DaneDivipolaError('DANE reportó un error en la consulta');
    }

    if (payload.exceededTransferLimit === true) {
      throw new DaneDivipolaError(
        'DANE entregó una respuesta incompleta por límite de transferencia',
      );
    }

    assertSpatialReference(payload.spatialReference);

    if (!Array.isArray(payload.features)) {
      throw new DaneDivipolaError(
        'La respuesta de DANE no contiene una lista de divisiones',
      );
    }

    if (
      payload.features.length === 0 ||
      payload.features.length > DANE_MAX_RECORDS
    ) {
      throw new DaneDivipolaError(
        'La cantidad de divisiones reportada por DANE no es válida',
      );
    }

    return payload.features.map((feature, index) => {
      if (!isRecord(feature) || !isRecord(feature.attributes)) {
        throw new DaneDivipolaError(
          `La división DANE en la posición ${index} no es válida`,
        );
      }
      return feature;
    });
  }

  private parseAttributes(
    feature: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!isRecord(feature.attributes)) {
      throw new DaneDivipolaError(
        'La división DANE no contiene atributos válidos',
      );
    }
    return feature.attributes;
  }

  private parseMunicipalities(payload: unknown): DaneMunicipality[] {
    const departmentNames = new Map<string, string>();
    const municipalityCodes = new Set<string>();
    return this.parseFeatures(payload).map((feature) => {
      const attributes = this.parseAttributes(feature);

      const departmentCode = parseCode(
        attributes.DPTO_CCDGO,
        /^\d{2}$/,
        'DPTO_CCDGO',
      );
      const municipalityCode = parseCode(
        attributes.MPIO_CDPMP,
        /^\d{5}$/,
        'MPIO_CDPMP',
      );
      const departmentName = parseName(attributes.DPTO_CNMBRE, 'DPTO_CNMBRE');
      const municipalityName = parseName(attributes.MPIO_CNMBRE, 'MPIO_CNMBRE');

      if (!municipalityCode.startsWith(departmentCode)) {
        throw new DaneDivipolaError(
          `El municipio ${municipalityCode} no pertenece al departamento ${departmentCode}`,
        );
      }

      const knownDepartmentName = departmentNames.get(departmentCode);
      if (
        knownDepartmentName !== undefined &&
        knownDepartmentName !== departmentName
      ) {
        throw new DaneDivipolaError(
          `DANE reportó nombres incompatibles para el departamento ${departmentCode}`,
        );
      }
      departmentNames.set(departmentCode, departmentName);

      if (municipalityCodes.has(municipalityCode)) {
        throw new DaneDivipolaError(
          `DANE reportó dos veces el municipio ${municipalityCode}`,
        );
      }
      municipalityCodes.add(municipalityCode);

      return {
        departmentCode,
        departmentName,
        municipalityCode,
        municipalityName,
        ...parseCentroid(feature),
      };
    });
  }
}

function assertSpatialReference(value: unknown): void {
  if (
    !isRecord(value) ||
    value.wkid !== 4326 ||
    (value.latestWkid !== undefined && value.latestWkid !== 4326)
  ) {
    throw new DaneDivipolaError('DANE no confirmó coordenadas EPSG:4326');
  }
}

function parseCentroid(feature: Record<string, unknown>) {
  const centroid = feature.centroid;
  if (
    !isRecord(centroid) ||
    typeof centroid.x !== 'number' ||
    typeof centroid.y !== 'number' ||
    !Number.isFinite(centroid.x) ||
    !Number.isFinite(centroid.y) ||
    centroid.x < -180 ||
    centroid.x > 180 ||
    centroid.y < -90 ||
    centroid.y > 90
  ) {
    throw new DaneDivipolaError(
      'DANE devolvió un centroide ausente o inválido',
    );
  }
  if (centroid.spatialReference !== undefined)
    assertSpatialReference(centroid.spatialReference);
  return { latitude: centroid.y, longitude: centroid.x };
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > DANE_MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new DaneDivipolaError('La respuesta de DANE excede el límite');
  }
  if (!response.body)
    throw new DaneDivipolaError('DANE devolvió una respuesta vacía');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > DANE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new DaneDivipolaError('La respuesta de DANE excede el límite');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCode(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string') {
    throw new DaneDivipolaError(`El campo DANE ${field} no es texto`);
  }

  const normalized = value.trim();
  if (!pattern.test(normalized)) {
    throw new DaneDivipolaError(`El campo DANE ${field} no es válido`);
  }

  return normalized;
}

function parseName(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new DaneDivipolaError(`El campo DANE ${field} no es texto`);
  }

  const normalized = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (
    normalized.length === 0 ||
    normalized.length > 250 ||
    hasControlCharacters(normalized)
  ) {
    throw new DaneDivipolaError(`El campo DANE ${field} no es válido`);
  }

  return normalized;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}
