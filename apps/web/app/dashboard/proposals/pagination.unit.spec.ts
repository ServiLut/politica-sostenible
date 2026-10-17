import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createPageRequestState } from '../../../lib/use-page-request-state';
import type { PoliticalProposal, ProposalPage } from '../../../lib/proposals-api';

// Execute the real page query and reconciliation callbacks, not a second implementation.
const source = ts.createSourceFile('page.tsx', readFileSync(join(__dirname, 'page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations: string[] = [];
function collect(node: ts.Node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
    ['request', 'setProposals', 'loadProposals'].includes(declaration.name.getText(source)),
  )) declarations.push(node.getText(source));
  ts.forEachChild(node, collect);
}
collect(source);
expect(declarations).toHaveLength(3);
const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const record = (id: string) => ({ id, title: id, status: 'DRAFT' } as PoliticalProposal);
const pageOf = (id: string, page = 1): ProposalPage => ({ items: [record(id)], pagination: { page, limit: 20, total: 21, totalPages: 2 } });

function callbacks(overrides: Record<string, unknown> = {}) {
  const scope = {
    scopeKey: 'tenant-a:user-a:ADMIN', page: 2, statusFilter: 'DRAFT', categoryFilter: 'HEALTH',
    debouncedSearch: 'agua', deepLinkProposalId: null, PROPOSALS_PAGE_SIZE: 20,
    useCallback: (value: unknown) => value,
    listProposals: async () => pageOf('filtered', 2),
    getProposal: async () => record('direct'),
    activeList: { current: null },
    ...overrides,
  };
  return runInNewContext(`${code}\n({request,setProposals,loadProposals})`, scope) as {
    request: (signal: AbortSignal) => Promise<ProposalPage>;
    setProposals: (update: (items: PoliticalProposal[]) => PoliticalProposal[]) => void;
    loadProposals: () => Promise<ProposalPage | undefined>;
  };
}

test('envía página y filtros juntos al servidor sin filtrar ni descargar el resto', async () => {
  const calls: unknown[] = [];
  const signal = new AbortController().signal;
  const model = callbacks({ listProposals: async (params: unknown, receivedSignal: AbortSignal) => {
    calls.push(params); expect(receivedSignal).toBe(signal); return pageOf('server-result', 2);
  } });
  expect((await model.request(signal)).items[0].id).toBe('server-result');
  expect(calls).toEqual([{ page: 2, limit: 20, search: 'agua', status: 'DRAFT', category: 'HEALTH' }]);
});

test('el enlace directo no depende de la página, estado o categoría seleccionados', async () => {
  let listCalls = 0;
  const ids: string[] = [];
  const model = callbacks({ deepLinkProposalId: 'beyond-page',
    listProposals: async () => { listCalls += 1; return pageOf('wrong'); },
    getProposal: async (id: string) => { ids.push(id); return record(id); },
  });
  const response = await model.request(new AbortController().signal);
  expect(response.items[0].id).toBe('beyond-page');
  expect(response.pagination.total).toBe(1);
  expect(ids).toEqual(['beyond-page']);
  expect(listCalls).toBe(0);
});

test('el cambio de página descarta respuestas tardías aunque la red no respete AbortSignal', async () => {
  const late = Promise.withResolvers<ProposalPage>();
  let oldSignal: AbortSignal | undefined;
  const first = createPageRequestState(callbacks({ listProposals: async (_params: unknown, signal: AbortSignal) => { oldSignal = signal; return late.promise; } }).request);
  const pending = first.start();
  first.stop();
  const second = createPageRequestState(callbacks({ page: 3, listProposals: async () => pageOf('page-three', 3) }).request);
  await second.start();
  late.resolve(pageOf('old-page', 2));
  await pending;
  expect(oldSignal?.aborted).toBe(true);
  expect(first.getSnapshot().data).toBeNull();
  expect(second.getSnapshot().data?.items[0].id).toBe('page-three');
  second.stop();
});

test('una mutación que termina después de navegar recarga la página actual sin insertar la ficha de otra página', async () => {
  const first = createPageRequestState(async () => pageOf('old-page'), true, true);
  await first.start();
  const activeList = { current: { scopeKey: 'tenant-a:user-a:ADMIN', refresh: first.refresh, setData: first.setData } };
  const captured = callbacks({ activeList });
  first.stop();
  let reads = 0;
  const current = createPageRequestState(async () => { reads += 1; return pageOf('current-page', 2); }, true, true);
  await current.start();
  activeList.current = { scopeKey: 'tenant-a:user-a:ADMIN', refresh: current.refresh, setData: current.setData };
  captured.setProposals((items) => items.map((item) => item.id === 'old-page' ? { ...item, status: 'PROPOSED' } : item));
  await captured.loadProposals();
  expect(reads).toBe(2);
  expect(current.getSnapshot().data?.items.map((item) => item.id)).toEqual(['current-page']);
  expect(current.getSnapshot().data?.pagination.total).toBe(21);
  current.stop();
});

test('una respuesta de mutación de otra sesión no modifica ni recarga el tenant actual', async () => {
  let reads = 0;
  const current = createPageRequestState(async () => { reads += 1; return pageOf('tenant-b'); }, true, true);
  await current.start();
  const captured = callbacks({ activeList: { current: { scopeKey: 'tenant-b:user-b:ADMIN', refresh: current.refresh, setData: current.setData } } });
  captured.setProposals(() => [record('tenant-a')]);
  await captured.loadProposals();
  expect(reads).toBe(1);
  expect(current.getSnapshot().data?.items[0].id).toBe('tenant-b');
  current.stop();
});
