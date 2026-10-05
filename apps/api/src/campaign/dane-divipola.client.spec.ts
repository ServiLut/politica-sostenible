import { DaneDivipolaClient, DaneDivipolaError } from './dane-divipola.client';

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ spatialReference: { wkid: 4326 }, ...payload }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

describe('DaneDivipolaClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('downloads only the official fields, without geometry, and normalizes valid data', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        features: [
          {
            centroid: { x: -75.611036, y: 6.257588 },
            attributes: {
              DPTO_CCDGO: ' 05 ',
              DPTO_CNMBRE: ' ANTIOQUIA ',
              MPIO_CDPMP: '05001',
              MPIO_CNMBRE: ' MEDELLI\u0301N ',
            },
          },
          {
            centroid: { x: -74.8, y: 10.98 },
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
        latitude: 6.257588,
        longitude: -75.611036,
      },
      {
        departmentCode: '08',
        departmentName: 'ATLÁNTICO',
        municipalityCode: '08001',
        municipalityName: 'BARRANQUILLA',
        latitude: 10.98,
        longitude: -74.8,
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
    expect(url.searchParams.get('returnCentroid')).toBe('true');
    expect(url.searchParams.get('outSR')).toBe('4326');
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

  const municipality = {
    attributes: {
      DPTO_CCDGO: '05',
      DPTO_CNMBRE: 'ANTIOQUIA',
      MPIO_CDPMP: '05001',
      MPIO_CNMBRE: 'MEDELLÍN',
    },
    centroid: { x: -75.611036, y: 6.257588 },
  };

  it('fetches department centroids from the separate official layer 319', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: { DPTO_CCDGO: '05', DPTO_CNMBRE: 'ANTIOQUIA' },
            centroid: { x: -75.565015, y: 6.922838 },
          },
        ],
      }),
    );
    expect(await new DaneDivipolaClient().fetchDepartments()).toEqual([
      {
        code: '05',
        name: 'ANTIOQUIA',
        latitude: 6.922838,
        longitude: -75.565015,
      },
    ]);
    const url = fetchSpy.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://geoportal.dane.gov.co');
    expect(url.pathname).toBe(
      '/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/319/query',
    );
    expect(url.searchParams.get('outFields')).toBe('DPTO_CCDGO,DPTO_CNMBRE');
    expect(url.searchParams.get('outSR')).toBe('4326');
    expect(url.searchParams.get('returnCentroid')).toBe('true');
    expect(url.searchParams.get('returnGeometry')).toBe('false');
    expect(url.searchParams.has('resultRecordCount')).toBe(false);
  });

  it.each([
    undefined,
    null,
    {},
    { x: -75 },
    { x: '-75', y: 6 },
    { x: NaN, y: 6 },
    { x: Infinity, y: 6 },
    { x: -181, y: 6 },
    { x: 181, y: 6 },
    { x: -75, y: -91 },
    { x: -75, y: 91 },
    { x: -75, y: 6, spatialReference: { wkid: 3857 } },
  ])(
    'rejects missing, non-numeric, out-of-range or wrong-CRS centroid %j',
    async (centroid) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          jsonResponse({ features: [{ ...municipality, centroid }] }),
        );
      await expect(
        new DaneDivipolaClient().fetchMunicipalities(),
      ).rejects.toBeInstanceOf(DaneDivipolaError);
    },
  );

  it.each([undefined, null, { wkid: 3857 }, { wkid: 4326, latestWkid: 3857 }])(
    'rejects unconfirmed response CRS %j',
    async (spatialReference) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          jsonResponse({ spatialReference, features: [municipality] }),
        );
      await expect(
        new DaneDivipolaClient().fetchMunicipalities(),
      ).rejects.toThrow('EPSG:4326');
    },
  );

  it.each([
    { error: { code: 400 } },
    { features: [] },
    { features: [municipality, municipality] },
    {
      features: [
        {
          ...municipality,
          attributes: { ...municipality.attributes, DPTO_CNMBRE: '\u0001' },
        },
      ],
    },
  ])(
    'rejects provider errors, empty, duplicate or malformed records',
    async (payload) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payload));
      await expect(
        new DaneDivipolaClient().fetchMunicipalities(),
      ).rejects.toBeInstanceOf(DaneDivipolaError);
    },
  );

  it('rejects repeated department codes and validates department centroids too', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ features: [municipality, municipality] }),
      );
    await expect(new DaneDivipolaClient().fetchDepartments()).rejects.toThrow(
      'dos veces el departamento',
    );
    fetchSpy.mockResolvedValue(
      jsonResponse({ features: [{ ...municipality, centroid: null }] }),
    );
    await expect(new DaneDivipolaClient().fetchDepartments()).rejects.toThrow(
      'centroide',
    );
  });

  it('caps the actual streamed bytes even when content-length is missing', async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_500_000));
        controller.enqueue(new Uint8Array(500_001));
      },
      cancel,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream));
    await expect(
      new DaneDivipolaClient().fetchMunicipalities(),
    ).rejects.toThrow('excede el límite');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized declared bodies before reading and refuses malformed JSON or HTTP failure', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{}', { headers: { 'content-length': '2000001' } }),
      );
    await expect(
      new DaneDivipolaClient().fetchMunicipalities(),
    ).rejects.toThrow('excede el límite');
    fetchSpy.mockResolvedValue(new Response('{invalid'));
    await expect(
      new DaneDivipolaClient().fetchMunicipalities(),
    ).rejects.toThrow('JSON inválido');
    fetchSpy.mockResolvedValue(new Response('failed', { status: 503 }));
    await expect(new DaneDivipolaClient().fetchDepartments()).rejects.toThrow(
      'HTTP 503',
    );
  });

  it('aborts the official request at the configured deadline', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );
    const result = new DaneDivipolaClient().fetchMunicipalities();
    const assertion = expect(result).rejects.toThrow('tiempo límite');
    await jest.advanceTimersByTimeAsync(12_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
