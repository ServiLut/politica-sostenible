import { createHash } from 'node:crypto';
import {
  ElectoralCatalogEntryType,
  ElectoralCodeNamespace,
} from '../../prisma/generated/prisma';
import {
  ElectoralCatalogParseError,
  parseRnecDivipoleTree,
  RNEC_DIVIPOLE_TREE_PARSER_VERSION,
} from './rnec-divipole-tree.parser';

function validTree(): Record<string, unknown> {
  return {
    departments: [
      {
        code: 1,
        name: '  Antioquia  ',
        municipalities: [
          {
            code: '001',
            name: 'Medelli\u0301n',
            zones: [
              {
                code: 1,
                stands: [
                  {
                    code: '01',
                    name: 'Institucion educativa de prueba',
                    address: 'Calle 1 # 2-3',
                    commune: 'Comuna 1',
                    lat: 6.25184,
                    lng: -75.56359,
                    countTable: 12,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function content(tree = validTree()): string {
  return JSON.stringify(tree);
}

function stand(tree: Record<string, unknown>): Record<string, unknown> {
  const departments = tree.departments as Array<Record<string, unknown>>;
  const municipalities = departments[0].municipalities as Array<
    Record<string, unknown>
  >;
  const zones = municipalities[0].zones as Array<Record<string, unknown>>;
  return (zones[0].stands as Array<Record<string, unknown>>)[0];
}

describe('parseRnecDivipoleTree', () => {
  it('flattens the strict hierarchy, canonicalizes codes and hashes raw content', () => {
    const raw = content();

    const parsed = parseRnecDivipoleTree(raw);

    expect(parsed).toMatchObject({
      contentSha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
      contentBytes: Buffer.byteLength(raw, 'utf8'),
      parserVersion: RNEC_DIVIPOLE_TREE_PARSER_VERSION,
      counts: {
        records: 4,
        departments: 1,
        municipalities: 1,
        zones: 1,
        pollingPlaces: 1,
        expectedTables: 12,
      },
    });
    expect(parsed.entries).toEqual([
      expect.objectContaining({
        namespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        type: ElectoralCatalogEntryType.DEPARTMENT,
        canonicalCode: '01',
        name: 'Antioquia',
        parentCanonicalCode: null,
      }),
      expect.objectContaining({
        type: ElectoralCatalogEntryType.MUNICIPALITY,
        canonicalCode: '01/001',
        name: 'Medellín',
        parentCanonicalCode: '01',
      }),
      expect.objectContaining({
        type: ElectoralCatalogEntryType.ZONE,
        canonicalCode: '01/001/01',
        name: 'Zona 01',
        nameIsDerived: true,
        parentCanonicalCode: '01/001',
      }),
      expect.objectContaining({
        type: ElectoralCatalogEntryType.POLLING_PLACE,
        canonicalCode: '01/001/01/01',
        parentCanonicalCode: '01/001/01',
        expectedTables: 12,
        latitude: 6.25184,
        longitude: -75.56359,
      }),
    ]);
  });

  it('marks a supplied zone name as official source text instead of derived', () => {
    const tree = validTree();
    const departments = tree.departments as Array<Record<string, unknown>>;
    const municipality = (
      departments[0].municipalities as Array<Record<string, unknown>>
    )[0];
    const zone = (municipality.zones as Array<Record<string, unknown>>)[0];
    zone.name = 'Zona urbana central';

    const parsed = parseRnecDivipoleTree(content(tree));

    expect(parsed.entries[2]).toMatchObject({
      name: 'Zona urbana central',
      nameIsDerived: false,
    });
  });

  it.each(['A1', 'B1', 'W9'])(
    'accepts the official uppercase alphanumeric polling-place code %s',
    (code) => {
      const tree = validTree();
      stand(tree).code = code;
      expect(parseRnecDivipoleTree(content(tree)).entries.at(-1)).toMatchObject(
        {
          pollingPlaceCode: code,
          canonicalCode: `01/001/01/${code}`,
        },
      );
    },
  );

  it.each(['a1', 'A-', 'A', 'ABC', 1])(
    'rejects an ambiguous or non-contract polling-place code %p',
    (code) => {
      const tree = validTree();
      stand(tree).code = code;
      expect(() => parseRnecDivipoleTree(content(tree))).toThrow(
        'exactamente 2 caracteres alfanumericos en mayuscula',
      );
    },
  );

  it('treats whitespace as part of the immutable source hash', () => {
    const compact = content();
    const indented = JSON.stringify(validTree(), null, 2);

    expect(parseRnecDivipoleTree(compact).contentSha256).not.toBe(
      parseRnecDivipoleTree(indented).contentSha256,
    );
  });

  it.each([
    ['empty content', '', 'esta vacio'],
    ['invalid JSON', '{', 'no es JSON valido'],
    ['non-object root', '[]', 'debe ser un objeto'],
    [
      'unknown root field',
      JSON.stringify({ departments: [], version: 1 }),
      'campos no soportados',
    ],
    ['missing departments', JSON.stringify({}), 'campos obligatorios'],
    [
      'empty departments',
      JSON.stringify({ departments: [] }),
      'no puede estar vacio',
    ],
  ])('rejects malformed envelopes: %s', (_label, raw, expectedMessage) => {
    expect(() => parseRnecDivipoleTree(raw)).toThrow(expectedMessage);
  });

  it.each([
    ['non-digit code', 'A1', 'solo digitos'],
    ['oversized code', '001', 'excede 2 digitos'],
    ['negative code', -1, 'entero no negativo'],
    ['fractional code', 1.5, 'entero no negativo'],
  ])('rejects invalid official codes: %s', (_label, code, message) => {
    const tree = validTree();
    const departments = tree.departments as Array<Record<string, unknown>>;
    departments[0].code = code;

    expect(() => parseRnecDivipoleTree(content(tree))).toThrow(message);
  });

  it.each([
    ['departments', () => validTree().departments, 'codigo canonico 01'],
    [
      'municipalities',
      () => {
        const tree = validTree();
        const departments = tree.departments as Array<Record<string, unknown>>;
        return departments[0].municipalities;
      },
      'codigo canonico 01/001',
    ],
    [
      'zones',
      () => {
        const tree = validTree();
        const departments = tree.departments as Array<Record<string, unknown>>;
        const municipalities = departments[0].municipalities as Array<
          Record<string, unknown>
        >;
        return municipalities[0].zones;
      },
      'codigo canonico 01/001/01',
    ],
    [
      'stands',
      () => {
        const tree = validTree();
        const departments = tree.departments as Array<Record<string, unknown>>;
        const municipalities = departments[0].municipalities as Array<
          Record<string, unknown>
        >;
        const zones = municipalities[0].zones as Array<Record<string, unknown>>;
        return zones[0].stands;
      },
      'codigo canonico 01/001/01/01',
    ],
  ])('rejects duplicate %s', (_label, locate, message) => {
    const tree = validTree();
    let target: unknown[];
    if (_label === 'departments') {
      target = tree.departments as unknown[];
    } else if (_label === 'municipalities') {
      const departments = tree.departments as Array<Record<string, unknown>>;
      target = departments[0].municipalities as unknown[];
    } else if (_label === 'zones') {
      const departments = tree.departments as Array<Record<string, unknown>>;
      const municipalities = departments[0].municipalities as Array<
        Record<string, unknown>
      >;
      target = municipalities[0].zones as unknown[];
    } else {
      const departments = tree.departments as Array<Record<string, unknown>>;
      const municipalities = departments[0].municipalities as Array<
        Record<string, unknown>
      >;
      const zones = municipalities[0].zones as Array<Record<string, unknown>>;
      target = zones[0].stands as unknown[];
    }
    target.push(structuredClone(target[0]));

    expect(locate).toBeDefined();
    expect(() => parseRnecDivipoleTree(content(tree))).toThrow(message);
  });

  it.each([
    ['zero table count', { countTable: 0 }, 'entre 1 y 99999'],
    ['fractional table count', { countTable: 1.5 }, 'debe ser un entero'],
    ['string table count', { countTable: '12' }, 'debe ser un entero'],
    ['latitude alone', { lng: undefined }, 'deben informarse juntos'],
    ['longitude alone', { lat: undefined }, 'deben informarse juntos'],
    ['latitude out of range', { lat: 91 }, 'entre -90 y 90'],
    ['longitude out of range', { lng: -181 }, 'entre -180 y 180'],
    ['non-numeric latitude', { lat: '6.2' }, 'debe ser numerica'],
    ['control character', { name: 'Puesto\u0001' }, 'caracteres de control'],
  ])('rejects invalid polling-place data: %s', (_label, patch, message) => {
    const tree = validTree();
    Object.assign(stand(tree), patch);

    expect(() => parseRnecDivipoleTree(content(tree))).toThrow(message);
  });

  it.each([null, '', '   '])(
    'preserves an officially unpublished address as null (%p)',
    (address) => {
      const tree = validTree();
      stand(tree).address = address;

      const pollingPlace = parseRnecDivipoleTree(content(tree)).entries.find(
        (entry) => entry.type === 'POLLING_PLACE',
      );
      expect(pollingPlace?.address).toBeNull();
    },
  );

  it.each(['municipalities', 'zones', 'stands'])(
    'rejects an empty %s hierarchy level',
    (level) => {
      const tree = validTree();
      const departments = tree.departments as Array<Record<string, unknown>>;
      const municipality = (
        departments[0].municipalities as Array<Record<string, unknown>>
      )[0];
      const zone = (municipality.zones as Array<Record<string, unknown>>)[0];
      if (level === 'municipalities') departments[0].municipalities = [];
      if (level === 'zones') municipality.zones = [];
      if (level === 'stands') zone.stands = [];

      expect(() => parseRnecDivipoleTree(content(tree))).toThrow(
        'no puede estar vacio',
      );
    },
  );

  it('rejects content over the bounded internal parser size', () => {
    const oversized = ' '.repeat(25 * 1024 * 1024 + 1);

    expect(() => parseRnecDivipoleTree(oversized)).toThrow(
      ElectoralCatalogParseError,
    );
    expect(() => parseRnecDivipoleTree(oversized)).toThrow('supera el limite');
  });
});
