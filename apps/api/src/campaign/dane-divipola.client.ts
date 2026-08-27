import { Injectable } from '@nestjs/common';

/**
 * Fuente oficial de la división político-administrativa colombiana.
 *
 * DANE, DIVIPOLA según el Marco Geoestadístico Nacional (MGN), versión 2025.
 * La capa 317 contiene un registro por municipio e incluye su departamento.
 */
export const DANE_DIVIPOLA_SOURCE = Object.freeze({
  organization: 'Departamento Administrativo Nacional de Estadística (DANE)',
  dataset: 'DIVIPOLA según Marco Geoestadístico Nacional (MGN)',
  version: '2025',
  layer: 'Municipio (317)',
  layerUrl:
    'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/317',
});

const DANE_HOSTNAME = 'geoportal.dane.gov.co';
const DANE_QUERY_PATH =
  '/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/317/query';
const DANE_REQUEST_TIMEOUT_MS = 12_000;
const DANE_MAX_RECORDS = 2_000;
const DANE_MAX_RESPONSE_CHARACTERS = 2_000_000;

export interface DaneMunicipality {
  departmentCode: string;
  departmentName: string;
  municipalityCode: string;
  municipalityName: string;
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
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      DANE_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(this.createQueryUrl(), {
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

      const body = await response.text();
      if (body.length > DANE_MAX_RESPONSE_CHARACTERS) {
        throw new DaneDivipolaError('La respuesta de DANE excede el límite');
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch (error) {
        throw new DaneDivipolaError('DANE devolvió JSON inválido', {
          cause: error,
        });
      }

      return this.parseResponse(payload);
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

  private createQueryUrl(): URL {
    const url = new URL(`${DANE_DIVIPOLA_SOURCE.layerUrl}/query`);

    // Defensa en profundidad: el destino no puede alterarse mediante variables
    // de entorno ni datos de la solicitud.
    if (
      url.protocol !== 'https:' ||
      url.hostname !== DANE_HOSTNAME ||
      url.pathname !== DANE_QUERY_PATH
    ) {
      throw new DaneDivipolaError('La fuente DANE configurada no es válida');
    }

    url.search = new URLSearchParams({
      f: 'json',
      where: '1=1',
      outFields: 'DPTO_CCDGO,DPTO_CNMBRE,MPIO_CDPMP,MPIO_CNMBRE',
      returnGeometry: 'false',
      orderByFields: 'MPIO_CDPMP ASC',
    }).toString();

    return url;
  }

  private parseResponse(payload: unknown): DaneMunicipality[] {
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

    if (!Array.isArray(payload.features)) {
      throw new DaneDivipolaError(
        'La respuesta de DANE no contiene una lista de municipios',
      );
    }

    if (
      payload.features.length === 0 ||
      payload.features.length > DANE_MAX_RECORDS
    ) {
      throw new DaneDivipolaError(
        'La cantidad de municipios reportada por DANE no es válida',
      );
    }

    const departmentNames = new Map<string, string>();
    const municipalityCodes = new Set<string>();

    return payload.features.map((feature, index) => {
      if (!isRecord(feature) || !isRecord(feature.attributes)) {
        throw new DaneDivipolaError(
          `El municipio DANE en la posición ${index} no es válido`,
        );
      }

      const departmentCode = parseCode(
        feature.attributes.DPTO_CCDGO,
        /^\d{2}$/,
        'DPTO_CCDGO',
      );
      const municipalityCode = parseCode(
        feature.attributes.MPIO_CDPMP,
        /^\d{5}$/,
        'MPIO_CDPMP',
      );
      const departmentName = parseName(
        feature.attributes.DPTO_CNMBRE,
        'DPTO_CNMBRE',
      );
      const municipalityName = parseName(
        feature.attributes.MPIO_CNMBRE,
        'MPIO_CNMBRE',
      );

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
      };
    });
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
