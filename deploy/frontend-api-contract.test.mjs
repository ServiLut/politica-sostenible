import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative } from "node:path";
import test from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);
const WEB_ROOT = new URL("../apps/web/", import.meta.url);
const API_SOURCE_ROOT = new URL("../apps/api/src/", import.meta.url);
const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const ts = requireFromApi("typescript");

async function sourceFiles(directoryUrl, suffixes) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directoryUrl,
    );
    if (entry.isDirectory()) {
      if ([".next", "node_modules", "test-results"].includes(entry.name))
        continue;
      files.push(...(await sourceFiles(entryUrl, suffixes)));
      continue;
    }
    if (
      suffixes.some((suffix) => entry.name.endsWith(suffix)) &&
      !entry.name.includes(".spec.") &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".unit.")
    ) {
      files.push(entryUrl);
    }
  }
  return files;
}

function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function calledName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function literalCandidates(node) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node))
    return literalCandidates(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [
      ...literalCandidates(node.whenTrue),
      ...literalCandidates(node.whenFalse),
    ];
  }
  if (ts.isCallExpression(node)) {
    const name = calledName(node.expression);
    if (name === "withQuery" && node.arguments[0]) {
      return literalCandidates(node.arguments[0]);
    }
    return [];
  }
  if (!ts.isTemplateExpression(node)) return [];

  let value = node.head.text;
  for (const span of node.templateSpans) {
    value += ":value";
    value += span.literal.text;
  }
  return [value];
}

function normalizePath(value) {
  const withoutQuery = value.split("?", 1)[0];
  return (
    withoutQuery
      // A template may append an optional query-string variable whose leading
      // question mark is inside the expression, not in the static span.
      .replace(/(?<=[^/]):value(?=\/|$)/gu, "")
      .replace(/^\/+|\/+$/gu, "")
      .replace(/\/{2,}/gu, "/")
  );
}

function requestMethod(optionsNode) {
  if (!optionsNode) return "GET";
  if (!ts.isObjectLiteralExpression(optionsNode)) return null;
  const property = optionsNode.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === "method") ||
        (ts.isStringLiteral(candidate.name) &&
          candidate.name.text === "method")),
  );
  if (!property || !ts.isPropertyAssignment(property)) return "GET";
  const values = literalCandidates(property.initializer);
  return values.length === 1 ? values[0].toUpperCase() : null;
}

function routeMatches(frontendPath, backendPath) {
  const frontendSegments = frontendPath ? frontendPath.split("/") : [];
  const backendSegments = backendPath ? backendPath.split("/") : [];
  if (frontendSegments.length !== backendSegments.length) return false;
  return frontendSegments.every((segment, index) => {
    const expected = backendSegments[index];
    return (
      segment === expected ||
      segment.startsWith(":") ||
      expected.startsWith(":")
    );
  });
}

async function backendRoutes() {
  const routes = [];
  for (const fileUrl of await sourceFiles(API_SOURCE_ROOT, [
    ".controller.ts",
  ])) {
    const sourceText = await readFile(fileUrl, "utf8");
    const source = ts.createSourceFile(
      fileUrl.pathname,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const controller = decorators(statement)
        .map((decorator) => decorator.expression)
        .find(
          (expression) =>
            ts.isCallExpression(expression) &&
            calledName(expression.expression) === "Controller",
        );
      if (!controller || !ts.isCallExpression(controller)) continue;
      const base = normalizePath(
        literalCandidates(controller.arguments[0])[0] ?? "",
      );

      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        for (const decorator of decorators(member)) {
          if (!ts.isCallExpression(decorator.expression)) continue;
          const method = calledName(
            decorator.expression.expression,
          )?.toUpperCase();
          if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
            continue;
          const suffix = normalizePath(
            literalCandidates(decorator.expression.arguments[0])[0] ?? "",
          );
          routes.push({
            controller: statement.name?.text ?? "<anonymous>",
            method,
            path: normalizePath([base, suffix].filter(Boolean).join("/")),
          });
        }
      }
    }
  }
  return routes;
}

function namedProperty(object, name) {
  return object.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name)),
  );
}

function identifiersWithin(node, suffix) {
  const names = new Set();
  const visit = (candidate) => {
    if (ts.isIdentifier(candidate) && candidate.text.endsWith(suffix)) {
      names.add(candidate.text);
    }
    ts.forEachChild(candidate, visit);
  };
  if (node) visit(node);
  return names;
}

async function nestModuleGraph() {
  const modules = new Map();
  for (const fileUrl of await sourceFiles(API_SOURCE_ROOT, [".module.ts"])) {
    const sourceText = await readFile(fileUrl, "utf8");
    const source = ts.createSourceFile(
      fileUrl.pathname,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const moduleDecorator = decorators(statement)
        .map((decorator) => decorator.expression)
        .find(
          (expression) =>
            ts.isCallExpression(expression) &&
            calledName(expression.expression) === "Module",
        );
      if (!moduleDecorator || !ts.isCallExpression(moduleDecorator)) continue;
      const metadata = moduleDecorator.arguments[0];
      if (!metadata || !ts.isObjectLiteralExpression(metadata)) continue;
      const imports = namedProperty(metadata, "imports");
      const controllers = namedProperty(metadata, "controllers");
      modules.set(statement.name.text, {
        imports: identifiersWithin(
          imports && ts.isPropertyAssignment(imports)
            ? imports.initializer
            : undefined,
          "Module",
        ),
        controllers: identifiersWithin(
          controllers && ts.isPropertyAssignment(controllers)
            ? controllers.initializer
            : undefined,
          "Controller",
        ),
      });
    }
  }
  return modules;
}

async function frontendPathBuilders() {
  const builders = new Map();
  for (const fileUrl of await sourceFiles(WEB_ROOT, [".ts", ".tsx"])) {
    const sourceText = await readFile(fileUrl, "utf8");
    const source = ts.createSourceFile(
      fileUrl.pathname,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      fileUrl.pathname.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const indexFunction = (name, functionNode) => {
      const candidates = new Set();
      const inspectReturns = (node) => {
        if (node !== functionNode && ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node)) {
          for (const candidate of literalCandidates(node.expression)) {
            candidates.add(candidate);
          }
        }
        ts.forEachChild(node, inspectReturns);
      };
      if (ts.isBlock(functionNode.body)) inspectReturns(functionNode.body);
      else {
        for (const candidate of literalCandidates(functionNode.body)) {
          candidates.add(candidate);
        }
      }
      if (candidates.size === 0) return;
      const registered = builders.get(name) ?? new Set();
      for (const candidate of candidates) registered.add(candidate);
      builders.set(name, registered);
    };

    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        indexFunction(node.name.text, node);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        indexFunction(node.name.text, node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return builders;
}

function frontendPathCandidates(node, pathBuilders) {
  const direct = literalCandidates(node);
  if (direct.length > 0 || !node || !ts.isCallExpression(node)) return direct;
  return [...(pathBuilders.get(calledName(node.expression)) ?? [])];
}

async function frontendRequests() {
  const requests = [];
  const unresolved = [];
  const pathBuilders = await frontendPathBuilders();
  for (const fileUrl of await sourceFiles(WEB_ROOT, [".ts", ".tsx"])) {
    const sourceText = await readFile(fileUrl, "utf8");
    const source = ts.createSourceFile(
      fileUrl.pathname,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      fileUrl.pathname.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const requestForwarders = new Map();

    const enclosingNamedFunction = (node) => {
      let current = node.parent;
      while (current && !ts.isSourceFile(current)) {
        if (ts.isFunctionDeclaration(current) && current.name) {
          return { name: current.name.text, parameters: current.parameters };
        }
        if (
          (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
          ts.isVariableDeclaration(current.parent) &&
          ts.isIdentifier(current.parent.name)
        ) {
          return {
            name: current.parent.name.text,
            parameters: current.parameters,
          };
        }
        current = current.parent;
      }
      return null;
    };

    const indexRequestForwarders = (node) => {
      if (
        ts.isCallExpression(node) &&
        calledName(node.expression) === "apiRequest" &&
        ts.isIdentifier(node.arguments[0])
      ) {
        const owner = enclosingNamedFunction(node);
        const pathParameter = owner?.parameters.find(
          (parameter) =>
            ts.isIdentifier(parameter.name) &&
            parameter.name.text === node.arguments[0].text,
        );
        if (owner && pathParameter) {
          const options = node.arguments[1];
          const methodProperty =
            options && ts.isObjectLiteralExpression(options)
              ? options.properties.find(
                  (property) =>
                    (ts.isPropertyAssignment(property) ||
                      ts.isShorthandPropertyAssignment(property)) &&
                    ((ts.isIdentifier(property.name) &&
                      property.name.text === "method") ||
                      (ts.isStringLiteral(property.name) &&
                        property.name.text === "method")),
                )
              : undefined;
          const methodExpression =
            methodProperty && ts.isPropertyAssignment(methodProperty)
              ? methodProperty.initializer
              : methodProperty &&
                  ts.isShorthandPropertyAssignment(methodProperty)
                ? methodProperty.name
                : undefined;
          const fixedMethods = literalCandidates(methodExpression);
          const methodParameterName =
            methodExpression && ts.isIdentifier(methodExpression)
              ? methodExpression.text
              : null;
          const methodParameterIndex = methodParameterName
            ? owner.parameters.findIndex(
                (parameter) =>
                  ts.isIdentifier(parameter.name) &&
                  parameter.name.text === methodParameterName,
              )
            : -1;
          const methodParameter =
            methodParameterIndex >= 0
              ? owner.parameters[methodParameterIndex]
              : undefined;
          const defaultMethods = literalCandidates(
            methodParameter?.initializer,
          );
          requestForwarders.set(owner.name, {
            fixedMethod:
              fixedMethods.length === 1
                ? fixedMethods[0].toUpperCase()
                : methodProperty
                  ? null
                  : "GET",
            methodParameterIndex,
            defaultMethod:
              defaultMethods.length === 1
                ? defaultMethods[0].toUpperCase()
                : null,
          });
        }
      }
      ts.forEachChild(node, indexRequestForwarders);
    };
    indexRequestForwarders(source);

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = calledName(node.expression);
        const isDirectRequest = name === "apiRequest" || name === "apiDownload";
        const isForwardedRequest = requestForwarders.has(name);
        const forwarder = requestForwarders.get(name);
        const forwardedMethodCandidates =
          forwarder?.methodParameterIndex >= 0
            ? literalCandidates(node.arguments[forwarder.methodParameterIndex])
            : [];
        if (isDirectRequest || isForwardedRequest) {
          const method =
            name === "apiDownload"
              ? "GET"
              : isForwardedRequest
                ? (forwarder.fixedMethod ??
                  (forwardedMethodCandidates.length === 1
                    ? forwardedMethodCandidates[0].toUpperCase()
                    : forwarder.defaultMethod))
                : requestMethod(node.arguments[1]);
          const candidates = frontendPathCandidates(
            node.arguments[0],
            pathBuilders,
          );
          const owner = enclosingNamedFunction(node);
          const isForwarderDefinition =
            isDirectRequest &&
            ts.isIdentifier(node.arguments[0]) &&
            requestForwarders.has(owner?.name) &&
            owner?.parameters.some(
              (parameter) =>
                ts.isIdentifier(parameter.name) &&
                parameter.name.text === node.arguments[0].text,
            );
          if (candidates.length === 0 && !isForwarderDefinition) {
            const position = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            unresolved.push({
              method,
              expression: node.arguments[0]?.getText(source) ?? "<missing>",
              location: `${relative(
                new URL(PROJECT_ROOT).pathname,
                fileUrl.pathname,
              )}:${position.line + 1}`,
            });
          }
          for (const candidate of candidates) {
            const path = normalizePath(candidate);
            if (!path || path === "protected-resource") continue;
            const position = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            requests.push({
              method,
              path,
              via: isForwardedRequest ? name : null,
              location: `${relative(
                new URL(PROJECT_ROOT).pathname,
                fileUrl.pathname,
              )}:${position.line + 1}`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { requests, unresolved };
}

test("cada llamada API resoluble del frontend tiene una ruta NestJS compatible", async () => {
  const [routes, requestInventory] = await Promise.all([
    backendRoutes(),
    frontendRequests(),
  ]);
  const { requests, unresolved } = requestInventory;
  if (process.env.UI_AUDIT_INVENTORY === "1") {
    console.info(
      JSON.stringify({
        backendRoutes: routes.length,
        frontendRequests: requests.length,
        forwardedRequests: requests.filter(({ via }) => via !== null).length,
        unresolvedRequests: unresolved.length,
      }),
    );
  }
  assert.ok(
    routes.length >= 220,
    `se esperaban al menos 220 rutas NestJS; hay ${routes.length}`,
  );
  assert.ok(
    requests.length >= 210,
    `se esperaban al menos 210 llamadas frontend resolubles; hay ${requests.length}`,
  );
  assert.ok(
    requests.filter(({ via }) => via !== null).length >= 60,
    "el inventario debe conservar cobertura de los wrappers HTTP tipados",
  );
  assert.deepEqual(
    requests.filter(({ method }) => method === null),
    [],
    "cada llamada frontend debe resolver tambien su metodo HTTP",
  );
  assert.deepEqual(
    unresolved,
    [],
    `llamadas cuyo destino no pudo auditarse:\n${unresolved
      .map(
        ({ method, expression, location }) =>
          `${method ?? "*"} ${expression} (${location})`,
      )
      .join("\n")}`,
  );
  assert.ok(
    requests.some(
      ({ path, via }) =>
        via === "postCommand" && path.startsWith("inventory-logistics/"),
    ),
    "el contrato debe expandir los comandos indirectos de inventario",
  );
  assert.ok(
    requests.some(
      ({ path, via }) =>
        via === "postCommand" && path.startsWith("signature-collection/"),
    ),
    "el contrato debe expandir los comandos indirectos de recoleccion de firmas",
  );

  const missing = requests.filter(
    (request) =>
      !routes.some(
        (route) =>
          (request.method === null || request.method === route.method) &&
          routeMatches(request.path, route.path),
      ),
  );
  assert.deepEqual(
    missing,
    [],
    `llamadas sin contrato NestJS:\n${missing
      .map(
        ({ method, path, location }) =>
          `${method ?? "*"} ${path} (${location})`,
      )
      .join("\n")}`,
  );
});

test("cada controller HTTP esta registrado en un modulo alcanzable desde AppModule", async () => {
  const [routes, modules] = await Promise.all([
    backendRoutes(),
    nestModuleGraph(),
  ]);
  assert.ok(modules.has("AppModule"), "AppModule debe estar presente");

  const reachableModules = new Set();
  const pending = ["AppModule"];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || reachableModules.has(name)) continue;
    reachableModules.add(name);
    for (const imported of modules.get(name)?.imports ?? []) {
      if (modules.has(imported)) pending.push(imported);
    }
  }

  const registeredControllers = new Set();
  for (const moduleName of reachableModules) {
    for (const controller of modules.get(moduleName)?.controllers ?? []) {
      registeredControllers.add(controller);
    }
  }
  const routedControllers = new Set(routes.map(({ controller }) => controller));
  const missing = [...routedControllers]
    .filter((controller) => !registeredControllers.has(controller))
    .sort();
  assert.deepEqual(
    missing,
    [],
    `controllers desconectados de AppModule: ${missing.join(", ")}`,
  );
});
