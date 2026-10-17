import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This regression deliberately resolves the package used by the application,
// not a separately installed fixture or an ignored patch-working directory.
const root = fileURLToPath(new URL("../", import.meta.url));
const webRequire = createRequire(join(root, "apps/web/package.json"));
const configRequire = createRequire(webRequire.resolve("eslint-config-next"));
const pluginRequire = createRequire(configRequire.resolve("@next/eslint-plugin-next/package.json"));
const globRequire = createRequire(pluginRequire.resolve("fast-glob/package.json"));
const micromatchRequire = createRequire(globRequire.resolve("micromatch/package.json"));
const bracesPath = micromatchRequire.resolve("braces");

function isolated(body) {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const braces = require(${JSON.stringify(bracesPath)});
    function rejected(callback, code) {
      assert.throws(callback, error => error instanceof SyntaxError && error.code === code
        && !/call stack/i.test(error.message));
    }
    ${body}
    process.stdout.write(JSON.stringify({ passed: true }));
  `], { cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 128 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { passed: true });
}

test("the installed braces mitigation retains its real upstream version", () => {
  const installedRequire = createRequire(bracesPath);
  assert.equal(installedRequire("./package.json").version, "3.0.3");
  assert.equal(typeof installedRequire(join(dirname(bracesPath), "lib/validate-ast.js")).validateAst, "function");
});

test("all public entry points reject excessive string nesting before recursion", () => {
  isolated(`
    for (const [open, close] of [['{', '}'], ['(', ')'], ['{', '']]) {
      const input = open.repeat(4000) + 'a' + close.repeat(4000);
      for (const api of ['parse', 'compile', 'expand', 'stringify']) {
        rejected(() => braces[api](input), 'BRACES_MAX_DEPTH');
        rejected(() => braces[api](input, { maxDepth: Infinity, maxLength: Infinity }), 'BRACES_MAX_DEPTH');
      }
    }
  `);
});

test("depth limit is fixed at 100 and literal delimiters remain supported", () => {
  isolated(`
    for (const api of ['parse', 'compile', 'expand', 'stringify']) {
      braces[api]('{'.repeat(100) + 'a' + '}'.repeat(100));
      rejected(() => braces[api]('{'.repeat(101) + 'a' + '}'.repeat(101)), 'BRACES_MAX_DEPTH');
      braces[api]('(' .repeat(100) + 'a' + ')'.repeat(100));
      rejected(() => braces[api]('('.repeat(101) + 'a' + ')'.repeat(101)), 'BRACES_MAX_DEPTH');
      braces[api]('[' + '{'.repeat(200) + ']');
      braces[api]('"' + '{'.repeat(200) + '"');
      braces[api]('\\\\{'.repeat(200));
    }
  `);
});

test("direct AST inputs cannot bypass depth, cycle or parent-chain guards", () => {
  isolated(`
    for (const api of ['compile', 'expand', 'stringify']) {
      const deep = { type: 'root', nodes: [] };
      let cursor = deep;
      for (let i = 0; i < 4000; i++) {
        const next = { type: 'brace', nodes: [], parent: cursor };
        cursor.nodes.push(next); cursor = next;
      }
      rejected(() => braces[api](deep), 'BRACES_MAX_DEPTH');
      const cyclic = { type: 'root', nodes: [] }; cyclic.nodes.push(cyclic);
      rejected(() => braces[api](cyclic), 'BRACES_AST_CYCLE');
      const parentCycle = { type: 'root', nodes: [] }; parentCycle.parent = parentCycle;
      rejected(() => braces[api](parentCycle), 'BRACES_AST_CYCLE');
      const malformed = { type: 'root', nodes: [{ type: 'text', value: 'x', parent: {} }] };
      rejected(() => braces[api](malformed), 'BRACES_INVALID_AST');
      rejected(() => braces[api]({ type: 'root', nodes: {} }), 'BRACES_INVALID_AST');
    }
  `);
});

test("AST traversal bounds total work including repeated aliases", () => {
  isolated(`
    for (const api of ['compile', 'expand', 'stringify']) {
      const ast = { type: 'root', nodes: Array.from({ length: 30000 }, () => ({ type: 'text', value: 'x' })) };
      rejected(() => braces[api](ast), 'BRACES_MAX_NODES');
      const leaf = { type: 'text', value: 'x' };
      rejected(() => braces[api]({ type: 'root', nodes: Array(30000).fill(leaf) }), 'BRACES_MAX_NODES');
    }
    const boundary = { type: 'root', nodes: Array.from({ length: 29999 }, () => ({ type: 'text', value: 'x' })) };
    assert.equal(braces.compile(boundary), 'x'.repeat(29999));
  `);
});

test("AST scalar fields cannot hide recursive array coercion", () => {
  isolated(`
    for (const api of ['compile', 'expand', 'stringify']) {
      let nested = 'x';
      for (let i = 0; i < 8000; i++) nested = [nested];
      const cycle = []; cycle.push(cycle);
      for (const value of [nested, cycle, {}, 1, null]) {
        rejected(() => braces[api]({ type: 'root', nodes: [{ type: 'text', value }] }), 'BRACES_INVALID_AST');
      }
      for (const field of ['commas', 'ranges']) {
        for (const value of [nested, cycle, {}, '1', NaN, Infinity, -1]) {
          const branch = { type: 'brace', nodes: [{ type: 'text', value: 'x' }], [field]: value };
          rejected(() => braces[api]({ type: 'root', nodes: [branch] }), 'BRACES_INVALID_AST');
        }
      }
      rejected(() => braces[api]({ type: nested, nodes: [] }), 'BRACES_INVALID_AST');
    }
  `);
});

test("external ancestor queues share the depth, cycle and total-work bounds", () => {
  isolated(`
    const subtree = queue => ({ type: 'paren', parent: { type: 'root', queue }, nodes: [{ type: 'text', value: 'y' }] });
    let nested = 'x';
    for (let i = 0; i < 8000; i++) nested = [nested];
    const cycle = []; cycle.push(cycle);
    rejected(() => braces.expand(subtree([nested])), 'BRACES_MAX_DEPTH');
    rejected(() => braces.expand(subtree(cycle)), 'BRACES_AST_CYCLE');
    rejected(() => braces.expand(subtree([{}])), 'BRACES_INVALID_AST');
    rejected(() => braces.expand(subtree(Array(30000).fill('x'))), 'BRACES_MAX_NODES');
    // Each queue alone is below the bound; their combined budget must still fail.
    const sharedBudget = subtree(Array(16000).fill('x'));
    sharedBudget.queue = Array(16000).fill('x');
    rejected(() => braces.expand(sharedBudget), 'BRACES_MAX_NODES');
    assert.deepEqual(braces.expand(subtree(['x'])), ['xy']);
    const reused = braces.parse('a/{b,c}/d');
    assert.deepEqual(braces.expand(reused), ['a/b/d', 'a/c/d']);
    assert.equal(braces.stringify(reused), 'a/{b,c}/d');
  `);
});

test("normal build globs, ranges, nested alternatives and subtree APIs retain their behavior", () => {
  isolated(`
    assert.equal(braces.compile('src/**/*.{js,jsx,ts,tsx}'), 'src/**/*.(js|jsx|ts|tsx)');
    assert.deepEqual(braces.expand('src/{app,lib}/*.{ts,tsx}'), [
      'src/app/*.ts', 'src/app/*.tsx', 'src/lib/*.ts', 'src/lib/*.tsx',
    ]);
    assert.deepEqual(braces.expand('file-{01..03}.txt'), ['file-01.txt', 'file-02.txt', 'file-03.txt']);
    assert.deepEqual(braces.expand('v{a,{b,c}}'), ['va', 'vb', 'vc']);
    assert.deepEqual(braces.expand('{a,a,b}', { nodupes: true }), ['a', 'b']);
    assert.deepEqual(braces.expand('{,a}', { noempty: true }), ['a']);
    assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
    const subtree = braces.parse('a/{b,c}/d').nodes.find(node => node.type === 'brace');
    assert.equal(braces.stringify(subtree), '{b,c}');
    assert.equal(braces.compile(subtree), '(b|c)');
    assert.deepEqual(braces.expand(braces.parse('a/{b,c}/d')), ['a/b/d', 'a/c/d']);
    for (const literal of ['{a', '{a,b', '(a', 'a/{b,c']) {
      assert.equal(braces.compile(literal), literal);
      assert.deepEqual(braces.expand(literal), [literal]);
      assert.equal(braces.stringify(literal), literal);
    }
    assert.equal(braces.compile('{a/{b,c}'), '{a/(b|c)');
    assert.deepEqual(braces.expand('{a/{b,c}'), ['{a/b', '{a/c']);
    assert.equal(braces.stringify('{a/{b,c}'), '{a/{b,c}');
    assert.throws(() => braces.expand('{1..2000}'), RangeError);
  `);
});

test("parenthesized alternatives preserve the upstream numeric NaN comma sentinel", () => {
  isolated(`
    for (const input of ['{(a,b)}', 'src/{(a,b),c}', 'c2.c_{_(,a)}']) {
      const parsed = braces.parse(input);
      assert.equal(braces.stringify(parsed), input);
      assert.doesNotThrow(() => braces.compile(input));
      assert.doesNotThrow(() => braces.expand(input));
    }
    const input = 'src/{(a,b),c}';
    assert.equal(braces.compile(input), 'src/((a|b)|c)');
    assert.deepEqual(braces.expand(input), ['src/(a,b)', 'src/c']);
  `);
});
