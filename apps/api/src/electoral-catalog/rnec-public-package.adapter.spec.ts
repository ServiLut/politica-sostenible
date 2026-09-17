import { createHash } from 'node:crypto';
import {
  ElectoralCatalogParseError,
  parseRnecDivipoleTree,
  RNEC_DIVIPOLE_TREE_PARSER_VERSION,
} from './rnec-divipole-tree.parser';
import {
  adaptRnecPublicPackage,
  calculateCanonicalPayloadSha256,
  RNEC_PUBLIC_PACKAGE_FORMAT,
  RnecPublicPackageAdapterError,
} from './rnec-public-package.adapter';

function officialTree(
  department = 'ANTIOQUIA',
  municipality = 'MEDELLIN',
  stands: Array<Record<string, unknown>> = [
    {
      idStand: 'A10100101',
      standCode: 'A1',
      standName: 'INSTITUCION EDUCATIVA CENTRAL',
      countTable: 12,
    },
  ],
) {
  return {
    data: {
      departmentsTree: {
        edges: [
          {
            node: {
              idDepartmentCode: '01',
              departmentName: department,
              municipalities: [
                {
                  idMunicipality: '00101',
                  municipalityCode: '001',
                  municipalityName: municipality,
                  zones: [
                    {
                      idZone: '0100101',
                      idZoneCode: '01',
                      zoneName: 'Zona 01',
                      corporations: ['001'],
                      stands,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function geo(
  codigo = '1',
  department = 'ANTIOQUIA',
  municipality = 'MEDELLIN',
  stand = 'INSTITUCION EDUCATIVA CENTRAL',
) {
  return {
    codigo,
    departamento: department,
    municipio: municipality,
    puesto: stand,
    comuna: 'COMUNA 1',
    direccion: 'CALLE 1 # 2-3',
    lat: 6.25,
    lng: -75.56,
  };
}

function envelope(
  tree: unknown = officialTree(),
  geolocation: unknown = [geo()],
  patch: Record<string, unknown> = {},
) {
  return {
    format: RNEC_PUBLIC_PACKAGE_FORMAT,
    election: {
      name: 'Presidencia 2026 - prueba contractual',
      electionDate: '2026-05-31',
      round: 'FIRST_ROUND',
      cutoffAt: '2026-05-01T12:00:00.000Z',
    },
    sources: {
      departmentsTree: {
        sourceUrl:
          'https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json',
        sourceContext: {
          electionDate: '2026-05-31',
          round: 'FIRST_ROUND',
        },
        retrievedAt: '2026-05-01T12:00:00.000Z',
        rawContentSha256: 'a'.repeat(64),
        payloadCanonicalSha256: calculateCanonicalPayloadSha256(tree),
        payload: tree,
      },
      geolocation: {
        sourceUrl:
          'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json',
        sourceContext: {
          electionDate: '2026-05-31',
          round: 'FIRST_ROUND',
        },
        retrievedAt: '2026-05-01T12:01:00.000Z',
        rawContentSha256: 'b'.repeat(64),
        payloadCanonicalSha256: calculateCanonicalPayloadSha256(geolocation),
        payload: geolocation,
      },
    },
    ...patch,
  };
}

function expectAdapterCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('La prueba esperaba un error del adapter');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RnecPublicPackageAdapterError);
    expect((error as RnecPublicPackageAdapterError).code).toBe(code);
  }
}

describe('RNEC public package v2', () => {
  it('adapts an exact match, preserves geo/table fields and hashes the original envelope', () => {
    const raw = JSON.stringify(envelope());
    const parsed = parseRnecDivipoleTree(raw);

    expect(parsed.parserVersion).toBe(RNEC_DIVIPOLE_TREE_PARSER_VERSION);
    expect(parsed.contentSha256).toBe(
      createHash('sha256').update(raw, 'utf8').digest('hex'),
    );
    expect(parsed.entries.at(-1)).toMatchObject({
      canonicalCode: '01/001/01/A1',
      pollingPlaceCode: 'A1',
      sourceLocationCode: '1',
      votingDate: '2026-05-31',
      timeZone: 'America/Bogota',
      address: 'CALLE 1 # 2-3',
      commune: 'COMUNA 1',
      latitude: 6.25,
      longitude: -75.56,
      expectedTables: 12,
    });
  });

  it('normalizes declared department aliases only', () => {
    const adapted = adaptRnecPublicPackage(
      envelope(
        officialTree('NORTE DE SAN'),
        [
          geo(
            '1',
            'NORTE DE SANTANDER',
            'MEDELLIN',
            'INSTITUCION EDUCATIVA CENTRAL',
          ),
        ],
        {
          departmentAliases: [
            {
              treeName: 'NORTE DE SAN',
              geolocationName: 'NORTE DE SANTANDER',
            },
          ],
        },
      ),
    );
    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0],
    ).toMatchObject({ address: 'CALLE 1 # 2-3' });
  });

  it('matches an exterior weekday to its base polling place', () => {
    const stand = {
      idStand: '810511588',
      standCode: '81',
      standName: 'LUNES ACCRA CONSULADO',
      countTable: 1,
    };
    const adapted = adaptRnecPublicPackage(
      envelope(officialTree('CONSULADOS', 'GHANA', [stand]), [
        geo('13490', 'CONSULADOS', 'GHANA', 'Accra Consulado'),
      ]),
    );
    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0],
    ).toMatchObject({
      code: '81',
      address: 'CALLE 1 # 2-3',
      sourceLocationCode: '13490',
      votingDate: '2026-05-25',
      timeZone: null,
    });
  });

  it('never interprets a domestic place name such as DOMINGO SAVIO as a day prefix', () => {
    const adapted = adaptRnecPublicPackage(
      envelope(
        officialTree('ANTIOQUIA', 'MEDELLIN', [
          {
            idStand: 'DOMINGOSAVIO1',
            standCode: 'D1',
            standName: 'DOMINGO SAVIO SEDE PRINCIPAL',
            countTable: 3,
          },
        ]),
        [geo('77', 'ANTIOQUIA', 'MEDELLIN', 'DOMINGO SAVIO SEDE PRINCIPAL')],
      ),
    );

    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0],
    ).toMatchObject({
      votingDate: '2026-05-31',
      timeZone: 'America/Bogota',
    });
  });

  it('derives the same consular weekday against the independently bound second round', () => {
    const tree = officialTree('CONSULADOS', 'GHANA', [
      {
        idStand: 'SECONDROUND81',
        standCode: '81',
        standName: 'LUNES ACCRA CONSULADO',
        countTable: 1,
      },
    ]);
    const data = [geo('13490', 'CONSULADOS', 'GHANA', 'ACCRA CONSULADO')];
    const second = envelope(tree, data);
    second.election.electionDate = '2026-06-21';
    second.election.round = 'SECOND_ROUND';
    second.sources.departmentsTree.sourceUrl =
      'https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json';
    second.sources.departmentsTree.sourceContext = {
      electionDate: '2026-06-21',
      round: 'SECOND_ROUND',
    };
    second.sources.geolocation.sourceUrl =
      'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json';
    second.sources.geolocation.sourceContext = {
      electionDate: '2026-06-21',
      round: 'SECOND_ROUND',
    };

    const adapted = adaptRnecPublicPackage(second);
    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0],
    ).toMatchObject({
      sourceLocationCode: '13490',
      votingDate: '2026-06-15',
      timeZone: null,
    });
  });

  it('reuses exterior geo for a truncated weekday only with one base in the zone', () => {
    const base = {
      idStand: '883303502',
      standCode: '02',
      standName: 'SANTO DOMINGO TSACHILAS - CONSULADO',
      countTable: 1,
    };
    const monday = {
      idStand: '883303581',
      standCode: '81',
      standName: 'LUNES SANTO DOMINGO TSACHILAS - CONSULAD',
      countTable: 1,
    };
    const adapted = adaptRnecPublicPackage(
      envelope(officialTree('CONSULADOS', 'ECUADOR', [base, monday]), [
        geo(
          '13551',
          'CONSULADOS',
          'ECUADOR',
          'SANTO DOMINGO TSACHILAS - CONSULADO',
        ),
      ]),
    );
    const stands = adapted.departments[0].municipalities[0].zones[0].stands;
    expect(stands.map((stand) => stand.address)).toEqual([
      'CALLE 1 # 2-3',
      'CALLE 1 # 2-3',
    ]);

    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(
            officialTree('CONSULADOS', 'ECUADOR', [
              base,
              {
                idStand: '883303503',
                standCode: '03',
                standName: 'SANTO DOMINGO TSACHILAS - CONSULADO NORTE',
                countTable: 1,
              },
            ]),
            [
              geo(
                '13551',
                'CONSULADOS',
                'ECUADOR',
                'SANTO DOMINGO TSACHILAS - CONSULADO',
              ),
            ],
          ),
        ),
      'RNEC_GEO_REUSED',
    );
  });

  it('accepts a truncated prefix only when it identifies one candidate', () => {
    const adapted = adaptRnecPublicPackage(
      envelope(
        officialTree('ANTIOQUIA', 'MEDELLIN', [
          {
            idStand: '010100101',
            standCode: '01',
            standName: 'INSTITUCION EDUCATIVA MUY LAR',
            countTable: 2,
          },
        ]),
        [
          geo(
            '8',
            'ANTIOQUIA',
            'MEDELLIN',
            'INSTITUCION EDUCATIVA MUY LARGA SEDE PRINCIPAL',
          ),
        ],
      ),
    );
    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0].address,
    ).toBe('CALLE 1 # 2-3');
  });

  it('fails closed with canonical candidate codes on ambiguity', () => {
    try {
      adaptRnecPublicPackage(envelope(officialTree(), [geo('10'), geo('11')]));
      throw new Error('La prueba esperaba ambiguedad');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RnecPublicPackageAdapterError);
      expect((error as RnecPublicPackageAdapterError).code).toBe(
        'RNEC_GEO_MATCH_AMBIGUOUS',
      );
      expect((error as RnecPublicPackageAdapterError).candidates).toEqual([
        '10',
        '11',
      ]);
    }
  });

  it('fails closed when a match is missing', () => {
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [
            geo('1', 'ANTIOQUIA', 'MEDELLIN', 'OTRO PUESTO'),
          ]),
        ),
      'RNEC_GEO_MATCH_MISSING',
    );
  });

  it('uses an explicit canonical override and rejects invalid/reused overrides', () => {
    const adapted = adaptRnecPublicPackage(
      envelope(officialTree(), [geo('99', 'OTRO', 'OTRO', 'OTRO')], {
        overrides: [{ stand: '01/001/01/A1', codigo: '99' }],
      }),
    );
    expect(
      adapted.departments[0].municipalities[0].zones[0].stands[0].address,
    ).toBe('CALLE 1 # 2-3');

    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [geo('99')], {
            overrides: [{ stand: '01/001/01/a1', codigo: '99' }],
          }),
        ),
      'RNEC_OVERRIDE_STAND_INVALID',
    );
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(
            officialTree('ANTIOQUIA', 'MEDELLIN', [
              {
                idStand: '010100101',
                standCode: '01',
                standName: 'UNO',
                countTable: 1,
              },
              {
                idStand: '020100101',
                standCode: '02',
                standName: 'DOS',
                countTable: 1,
              },
            ]),
            [geo('99')],
            {
              overrides: [
                { stand: '01/001/01/01', codigo: '99' },
                { stand: '01/001/01/02', codigo: '99' },
              ],
            },
          ),
        ),
      'RNEC_OVERRIDE_DUPLICATE',
    );
  });

  it('rejects unknown fields and impossible official coordinates without correcting them', () => {
    const badGeo = { ...geo(), lat: 43_558_102 };
    expectAdapterCode(
      () => adaptRnecPublicPackage(envelope(officialTree(), [badGeo])),
      'RNEC_COORDINATE_INVALID',
    );
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage({
          ...envelope(),
          invented: true,
        }),
      'RNEC_UNKNOWN_FIELDS',
    );
  });

  it.each([null, '', '   '])(
    'keeps an unpublished official address as null without inventing text (%p)',
    (address) => {
      const adapted = adaptRnecPublicPackage(
        envelope(officialTree(), [{ ...geo(), direccion: address }]),
      );
      expect(
        adapted.departments[0].municipalities[0].zones[0].stands[0].address,
      ).toBeNull();
    },
  );

  it('omits both coordinates only with an exact auditable rule', () => {
    const badGeo = { ...geo('13606'), lat: 25_857_689_574_473_300 };
    const rule = {
      action: 'OMIT_COORDINATES',
      codigo: '13606',
      originalLat: 25_857_689_574_473_300,
      originalLng: -75.56,
      justification: 'La fuente oficial publica una latitud fuera de rango.',
      evidenceReference:
        'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json',
    };
    const adapted = adaptRnecPublicPackage(
      envelope(officialTree(), [badGeo], { coordinateOmissions: [rule] }),
    );
    const stand = adapted.departments[0].municipalities[0].zones[0].stands[0];
    expect(stand.lat).toBeNull();
    expect(stand.lng).toBeNull();
    const parsedStand = parseRnecDivipoleTree(
      JSON.stringify(
        envelope(officialTree(), [badGeo], { coordinateOmissions: [rule] }),
      ),
    ).entries.find((entry) => entry.type === 'POLLING_PLACE');
    expect(parsedStand?.latitude).toBeNull();
    expect(parsedStand?.longitude).toBeNull();

    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [badGeo], {
            coordinateOmissions: [{ ...rule, originalLat: 1 }],
          }),
        ),
      'RNEC_COORDINATE_OMISSION_TAMPERED',
    );
  });

  it('rejects unused and duplicate coordinate omission rules', () => {
    const rule = {
      action: 'OMIT_COORDINATES',
      codigo: '1',
      originalLat: 6.25,
      originalLng: -75.56,
      justification: 'Justificacion suficientemente extensa para auditar.',
      evidenceReference:
        'https://wapp.registraduria.gov.co/electoral/evidencia-publica.json',
    };
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [geo()], { coordinateOmissions: [rule] }),
        ),
      'RNEC_COORDINATE_OMISSION_UNUSED',
    );
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [geo()], {
            coordinateOmissions: [rule, rule],
          }),
        ),
      'RNEC_COORDINATE_OMISSION_DUPLICATE',
    );
  });

  it.each([
    'referencia libre no verificable',
    'https://example.test/evidencia',
    'https://wapp.registraduria.gov.co/evidencia?token=secreto',
    'https://usuario:clave@wapp.registraduria.gov.co/evidencia',
  ])('rejects unsafe coordinate omission evidence: %s', (evidenceReference) => {
    const badGeo = { ...geo('13606'), lat: 25_857_689_574_473_300 };
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [badGeo], {
            coordinateOmissions: [
              {
                action: 'OMIT_COORDINATES',
                codigo: '13606',
                originalLat: 25_857_689_574_473_300,
                originalLng: -75.56,
                justification:
                  'La fuente oficial publica una latitud fuera de rango.',
                evidenceReference,
              },
            ],
          }),
        ),
      'RNEC_COORDINATE_OMISSION_EVIDENCE_INVALID',
    );
  });

  it('surfaces adapter codes through the canonical parser', () => {
    expect(() =>
      parseRnecDivipoleTree(
        JSON.stringify(envelope(officialTree(), [geo('1', 'X', 'Y', 'Z')])),
      ),
    ).toThrow(ElectoralCatalogParseError);
    expect(() =>
      parseRnecDivipoleTree(
        JSON.stringify(envelope(officialTree(), [geo('1', 'X', 'Y', 'Z')])),
      ),
    ).toThrow('RNEC_GEO_MATCH_MISSING');
  });

  it('rejects impossible civil dates and source hosts outside RNEC', () => {
    expectAdapterCode(
      () =>
        adaptRnecPublicPackage(
          envelope(officialTree(), [geo()], {
            election: {
              name: 'Presidencia 2026',
              electionDate: '2026-99-31',
              round: 'FIRST_ROUND',
              cutoffAt: '2026-05-01T12:00:00.000Z',
            },
          }),
        ),
      'RNEC_ELECTION_DATE_INVALID',
    );
    const invalidSource = envelope() as {
      sources: { geolocation: { sourceUrl: string } };
    };
    invalidSource.sources.geolocation.sourceUrl =
      'https://registraduria.gov.co.example.test/data.json';
    expectAdapterCode(
      () => adaptRnecPublicPackage(invalidSource),
      'RNEC_SOURCE_URL_INVALID',
    );
    const invalidSha = envelope() as {
      sources: { departmentsTree: { rawContentSha256: string } };
    };
    invalidSha.sources.departmentsTree.rawContentSha256 =
      'declaracion-no-verificable';
    expectAdapterCode(
      () => adaptRnecPublicPackage(invalidSha),
      'RNEC_SOURCE_SHA256_INVALID',
    );
  });

  it('binds every source to the declared election round and known official URL', () => {
    const mixed = envelope();
    mixed.election.electionDate = '2026-06-21';
    mixed.election.round = 'SECOND_ROUND';
    mixed.sources.departmentsTree.sourceContext = {
      electionDate: '2026-06-21',
      round: 'SECOND_ROUND',
    };
    mixed.sources.geolocation.sourceContext = {
      electionDate: '2026-06-21',
      round: 'SECOND_ROUND',
    };
    expectAdapterCode(
      () => adaptRnecPublicPackage(mixed),
      'RNEC_SOURCE_URL_CONTEXT_MISMATCH',
    );

    mixed.sources.departmentsTree.sourceUrl =
      'https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json';
    expectAdapterCode(
      () => adaptRnecPublicPackage(mixed),
      'RNEC_SOURCE_URL_CONTEXT_MISMATCH',
    );
    mixed.sources.geolocation.sourceUrl =
      'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json';
    expect(() => adaptRnecPublicPackage(mixed)).not.toThrow();

    const firstRoundWithSecondGeo = envelope();
    firstRoundWithSecondGeo.sources.geolocation.sourceUrl =
      'https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json';
    expectAdapterCode(
      () => adaptRnecPublicPackage(firstRoundWithSecondGeo),
      'RNEC_SOURCE_URL_CONTEXT_MISMATCH',
    );

    const sourceContextMismatch = envelope();
    sourceContextMismatch.sources.geolocation.sourceContext.round =
      'SECOND_ROUND';
    expectAdapterCode(
      () => adaptRnecPublicPackage(sourceContextMismatch),
      'RNEC_SOURCE_CONTEXT_MISMATCH',
    );
  });

  it('rejects a manipulated embedded payload when its declared hash stays intact', () => {
    const manipulated = envelope();
    const payload = manipulated.sources.departmentsTree.payload as ReturnType<
      typeof officialTree
    >;
    payload.data.departmentsTree.edges[0].node.departmentName =
      'CONTENIDO ALTERADO';
    expectAdapterCode(
      () => adaptRnecPublicPackage(manipulated),
      'RNEC_SOURCE_PAYLOAD_SHA256_MISMATCH',
    );
  });

  it('preserves the verified 14,438 logical / 13,742 physical / 696 consular-day semantics and 65 missing physical addresses', () => {
    const domesticPhysicalCount = 13_626;
    const consularPhysicalCount = 116;
    const weekdays = [
      '',
      'LUNES ',
      'MARTES ',
      'MIERCOLES ',
      'JUEVES ',
      'VIERNES ',
      'SABADO ',
    ];
    const domesticZones = Array.from({ length: 14 }, (_, zoneIndex) => {
      const first = zoneIndex * 1_000;
      const last = Math.min(first + 1_000, domesticPhysicalCount);
      return {
        idZone: String(10_000 + zoneIndex),
        idZoneCode: String(zoneIndex + 1).padStart(2, '0'),
        zoneName: `ZONA ${zoneIndex + 1}`,
        corporations: ['001'],
        stands: Array.from({ length: last - first }, (_, localIndex) => {
          const absolute = first + localIndex;
          return {
            idStand: `D${absolute}`,
            standCode: localIndex.toString(36).toUpperCase().padStart(2, '0'),
            standName: `PUESTO DOMESTICO ${absolute}`,
            countTable: 1,
          };
        }),
      };
    });
    const consularStands = Array.from(
      { length: consularPhysicalCount },
      (_, locationIndex) =>
        weekdays.map((prefix, dayIndex) => ({
          idStand: `C${locationIndex}D${dayIndex}`,
          standCode: (locationIndex * weekdays.length + dayIndex)
            .toString(36)
            .toUpperCase()
            .padStart(2, '0'),
          standName: `${prefix}SEDE CONSULAR ${String(locationIndex).padStart(3, '0')}`,
          countTable: 1,
        })),
    ).flat();
    const tree = {
      data: {
        departmentsTree: {
          edges: [
            {
              node: {
                idDepartmentCode: '01',
                departmentName: 'COLOMBIA',
                municipalities: [
                  {
                    idMunicipality: '10001',
                    municipalityCode: '001',
                    municipalityName: 'MUNICIPIO',
                    zones: domesticZones,
                  },
                ],
              },
            },
            {
              node: {
                idDepartmentCode: '02',
                departmentName: 'CONSULADOS',
                municipalities: [
                  {
                    idMunicipality: '20001',
                    municipalityCode: '001',
                    municipalityName: 'EXTERIOR',
                    zones: [
                      {
                        idZone: '2000101',
                        idZoneCode: '01',
                        zoneName: 'CONSULADOS',
                        corporations: ['001'],
                        stands: consularStands,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    };
    const domesticGeo = Array.from(
      { length: domesticPhysicalCount },
      (_, index) => ({
        ...geo(
          String(index + 1),
          'COLOMBIA',
          'MUNICIPIO',
          `PUESTO DOMESTICO ${index}`,
        ),
        direccion: index < 65 ? null : `DIRECCION ${index}`,
      }),
    );
    const consularGeo = Array.from(
      { length: consularPhysicalCount },
      (_, index) =>
        geo(
          String(domesticPhysicalCount + index + 1),
          'CONSULADOS',
          'EXTERIOR',
          `SEDE CONSULAR ${String(index).padStart(3, '0')}`,
        ),
    );

    const parsed = parseRnecDivipoleTree(
      JSON.stringify(envelope(tree, [...domesticGeo, ...consularGeo])),
    );

    expect(parsed.counts).toMatchObject({
      pollingPlaces: 14_438,
      physicalPollingPlaces: 13_742,
      additionalVotingDayRepresentations: 696,
      physicalPollingPlacesWithoutAddress: 65,
    });
    const earlyRecords = parsed.entries.filter(
      (entry) =>
        entry.type === 'POLLING_PLACE' && entry.votingDate !== '2026-05-31',
    );
    expect(earlyRecords).toHaveLength(696);
    expect(earlyRecords.every((entry) => entry.departmentCode === '02')).toBe(
      true,
    );
  }, 30_000);
});
