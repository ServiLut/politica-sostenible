import { DaneDivipolaClient, DaneDivipolaError } from './dane-divipola.client';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('DaneDivipolaClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads only the official fields, without geometry, and normalizes valid data', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              DPTO_CCDGO: ' 05 ',
              DPTO_CNMBRE: ' ANTIOQUIA ',
              MPIO_CDPMP: '05001',
              MPIO_CNMBRE: ' MEDELLI\u0301N ',
            },
          },
          {
            attributes: {
              DPTO_CCDGO: '08',
              DPTO_CNMBRE: 'ATLÁNTICO',
              MPIO_CDPMP: '08001',
              MPIO_CNMBRE: 'BARRANQUILLA',
            },
          },
        ],
      }),
    );

    const result = await new DaneDivipolaClient().fetchMunicipalities();

    expect(result).toEqual([
      {
        departmentCode: '05',
        departmentName: 'ANTIOQUIA',
        municipalityCode: '05001',
        municipalityName: 'MEDELLÍN',
      },
      {
        departmentCode: '08',
        departmentName: 'ATLÁNTICO',
        municipalityCode: '08001',
        municipalityName: 'BARRANQUILLA',
      },
    ]);

    const requestUrl = fetchSpy.mock.calls[0]?.[0];
    expect(requestUrl).toBeInstanceOf(URL);
    const url = requestUrl as URL;
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('geoportal.dane.gov.co');
    expect(url.pathname).toBe(
      '/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/317/query',
    );
    expect(url.searchParams.get('outFields')).toBe(
      'DPTO_CCDGO,DPTO_CNMBRE,MPIO_CDPMP,MPIO_CNMBRE',
    );
    expect(url.searchParams.get('returnGeometry')).toBe('false');
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('rejects a structurally invalid or inconsistent DANE response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              DPTO_CCDGO: '05',
              DPTO_CNMBRE: 'ANTIOQUIA',
              MPIO_CDPMP: '76001',
              MPIO_CNMBRE: 'CALI',
            },
          },
        ],
      }),
    );

    await expect(
      new DaneDivipolaClient().fetchMunicipalities(),
    ).rejects.toBeInstanceOf(DaneDivipolaError);
  });

  it('rejects a truncated ArcGIS response instead of treating it as success', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        exceededTransferLimit: true,
        features: [],
      }),
    );

    await expect(
      new DaneDivipolaClient().fetchMunicipalities(),
    ).rejects.toThrow('respuesta incompleta');
  });
});
