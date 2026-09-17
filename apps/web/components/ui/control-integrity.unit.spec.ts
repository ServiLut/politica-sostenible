import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { dashboardConfig } from "@/config/navigation";

const WEB_ROOT = resolve(process.cwd(), "apps/web");

function tsxSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxSources(path);
    return entry.isFile() && path.endsWith(".tsx") && !path.includes(".spec.")
      ? [path]
      : [];
  });
}

function applicationSources() {
  return ["app", "components"].flatMap((directory) =>
    tsxSources(join(WEB_ROOT, directory)),
  );
}

function relativeSourcePath(path: string) {
  return path.slice(WEB_ROOT.length + 1).replaceAll("\\", "/");
}

function parseTsx(path: string) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function jsxAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText(node.getSourceFile()) === name,
  );
}

function expressionLiteralCandidates(
  expression: ts.Expression | undefined,
): string[] {
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) {
    return expressionLiteralCandidates(expression.expression);
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...expressionLiteralCandidates(expression.whenTrue),
      ...expressionLiteralCandidates(expression.whenFalse),
    ];
  }
  if (!ts.isTemplateExpression(expression)) return [];

  let value = expression.head.text;
  for (const span of expression.templateSpans) {
    value += ":value";
    value += span.literal.text;
  }
  return [value];
}

function jsxAttributeLiteralCandidates(attribute?: ts.JsxAttribute): string[] {
  if (!attribute?.initializer) return [];
  if (ts.isStringLiteral(attribute.initializer)) {
    return [attribute.initializer.text];
  }
  if (!ts.isJsxExpression(attribute.initializer)) return [];
  return expressionLiteralCandidates(attribute.initializer.expression);
}

function lineLabel(path: string, node: ts.Node, reason: string) {
  const sourceFile = node.getSourceFile();
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return `${relativeSourcePath(path)}:${line + 1}: ${reason}`;
}

function isExplicitTrue(attribute: ts.JsxAttribute): boolean {
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text.trim().toLowerCase() === "true";
  }
  return Boolean(
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword,
  );
}

function isNoopFunction(node: ts.ArrowFunction | ts.FunctionExpression) {
  if (!ts.isBlock(node.body)) {
    return (
      node.body.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node.body) && node.body.text === "undefined")
    );
  }

  const meaningfulStatements = node.body.statements.filter(
    (statement) => !ts.isEmptyStatement(statement),
  );
  if (meaningfulStatements.length === 0) return true;
  if (meaningfulStatements.length !== 1) return false;

  const [statement] = meaningfulStatements;
  return (
    ts.isReturnStatement(statement) &&
    (!statement.expression ||
      statement.expression.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(statement.expression) &&
        statement.expression.text === "undefined"))
  );
}

function disconnectedEventHandlerViolations(path: string): string[] {
  const sourceFile = parseTsx(path);
  const namedFunctions = new Map<
    string,
    ts.ArrowFunction | ts.FunctionExpression
  >();
  const violations: string[] = [];

  function indexFunctions(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      namedFunctions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, indexFunctions);
  }

  function inspect(node: ts.Node) {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (name !== "onClick" && name !== "onSubmit") {
        ts.forEachChild(node, inspect);
        return;
      }

      const expression =
        node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : undefined;
      const referenced =
        expression && ts.isIdentifier(expression)
          ? namedFunctions.get(expression.text)
          : undefined;
      const handler =
        expression &&
        (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression))
          ? expression
          : referenced;
      if (
        !node.initializer ||
        !expression ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(expression) && expression.text === "undefined") ||
        (handler && isNoopFunction(handler))
      ) {
        violations.push(
          lineLabel(path, node, `${name} ausente, nulo o sin efecto`),
        );
      }
    }
    ts.forEachChild(node, inspect);
  }

  indexFunctions(sourceFile);
  inspect(sourceFile);
  return violations;
}

function formAndSubmitViolations(path: string): string[] {
  const sourceFile = parseTsx(path);
  const violations: string[] = [];

  function isInsideForm(node: ts.Node) {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (
        ts.isJsxElement(current) &&
        current.openingElement.tagName.getText(sourceFile) === "form"
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  function isFormBoundSubmitProxy(node: ts.Node) {
    let current: ts.Node | undefined = node.parent;
    let componentName: string | null = null;
    while (current && !ts.isSourceFile(current)) {
      if (
        ts.isFunctionDeclaration(current) &&
        current.name &&
        /^[A-Z]/u.test(current.name.text)
      ) {
        componentName = current.name.text;
        break;
      }
      if (
        (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name) &&
        /^[A-Z]/u.test(current.parent.name.text)
      ) {
        componentName = current.parent.name.text;
        break;
      }
      current = current.parent;
    }
    if (!componentName) return false;

    let callSites = 0;
    let disconnectedCallSites = 0;
    function inspectCallSites(candidate: ts.Node) {
      if (
        (ts.isJsxOpeningElement(candidate) ||
          ts.isJsxSelfClosingElement(candidate)) &&
        candidate.tagName.getText(sourceFile) === componentName
      ) {
        callSites += 1;
        if (!isInsideForm(candidate)) disconnectedCallSites += 1;
      }
      ts.forEachChild(candidate, inspectCallSites);
    }
    inspectCallSites(sourceFile);
    return callSites > 0 && disconnectedCallSites === 0;
  }

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === "form") {
        const hasSubmit = Boolean(jsxAttribute(node, "onSubmit"));
        const hasAction = Boolean(jsxAttribute(node, "action"));
        const hasSpread = node.attributes.properties.some(
          ts.isJsxSpreadAttribute,
        );
        if (!hasSubmit && !hasAction && !hasSpread) {
          violations.push(
            lineLabel(path, node, "formulario sin onSubmit ni action"),
          );
        }
      }

      const isButton = tagName === "button" || tagName === "Button";
      const isSubmitInput =
        tagName === "input" &&
        jsxAttributeLiteralCandidates(jsxAttribute(node, "type")).includes(
          "submit",
        );
      const isSubmitButton =
        isButton &&
        jsxAttributeLiteralCandidates(jsxAttribute(node, "type")).includes(
          "submit",
        );
      if (
        (isSubmitInput || isSubmitButton) &&
        !isInsideForm(node) &&
        !jsxAttribute(node, "form") &&
        !isFormBoundSubmitProxy(node)
      ) {
        violations.push(
          lineLabel(path, node, "control submit fuera de un formulario"),
        );
      }

      if (isButton || isSubmitInput) {
        const disabled = jsxAttribute(node, "disabled");
        if (disabled && isExplicitTrue(disabled)) {
          violations.push(
            lineLabel(path, node, "control de accion permanentemente disabled"),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function applicationPageRoutes(): Set<string> {
  const appRoot = join(WEB_ROOT, "app");
  return new Set(
    tsxSources(appRoot)
      .filter((path) => /[\\/]page\.tsx$/u.test(path))
      .map((path) =>
        relativeSourcePath(path)
          .replace(/^app\//u, "")
          .replace(/(?:^|\/)page\.tsx$/u, "")
          .split("/")
          .filter(
            (segment) =>
              segment.length > 0 &&
              !segment.startsWith("(") &&
              !segment.startsWith("@"),
          ),
      )
      .map((segments) => `/${segments.join("/")}`.replace(/\/$/u, "") || "/"),
  );
}

function routeExists(pathname: string, routes: Set<string>) {
  if (routes.has(pathname)) return true;
  const segments = pathname.split("/").filter(Boolean);
  return [...routes].some((route) => {
    const routeSegments = route.split("/").filter(Boolean);
    return (
      routeSegments.length === segments.length &&
      routeSegments.every(
        (segment, index) =>
          segment === segments[index] || /^\[.+\]$/u.test(segment),
      )
    );
  });
}

function staticLinkViolations(path: string, routes: Set<string>): string[] {
  const sourceFile = parseTsx(path);
  const sourceText = sourceFile.getFullText();
  const violations: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ["a", "Link"].includes(node.tagName.getText(sourceFile))
    ) {
      const href = jsxAttribute(node, "href");
      for (const rawCandidate of jsxAttributeLiteralCandidates(href)) {
        const candidate = rawCandidate.trim();
        if (
          candidate.length === 0 ||
          candidate === "#" ||
          /^(?:javascript|vbscript|data):/iu.test(candidate)
        ) {
          violations.push(
            lineLabel(path, node, `href no accionable: ${candidate}`),
          );
          continue;
        }
        if (candidate.startsWith("#")) {
          const id = candidate.slice(1);
          const escapedId = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
          if (
            !new RegExp(`\\bid\\s*=\\s*["']${escapedId}["']`, "u").test(
              sourceText,
            )
          ) {
            violations.push(
              lineLabel(path, node, `ancla sin destino local: ${candidate}`),
            );
          }
          continue;
        }
        if (!candidate.startsWith("/")) continue;

        const pathname =
          candidate.split(/[?#]/u, 1)[0].replace(/\/$/u, "") || "/";
        if (!routeExists(pathname, routes)) {
          violations.push(
            lineLabel(path, node, `ruta interna sin pagina: ${pathname}`),
          );
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const isRedirect =
        ts.isIdentifier(node.expression) && node.expression.text === "redirect";
      const isRouterNavigation =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "router" &&
        ["push", "replace"].includes(node.expression.name.text);
      if (isRedirect || isRouterNavigation) {
        for (const candidate of expressionLiteralCandidates(
          node.arguments[0],
        ).filter((value) => value.startsWith("/"))) {
          const pathname =
            candidate.split(/[?#]/u, 1)[0].replace(/\/$/u, "") || "/";
          if (!routeExists(pathname, routes)) {
            violations.push(
              lineLabel(
                path,
                node,
                `navegacion imperativa sin pagina: ${pathname}`,
              ),
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function nativeButtonViolations(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "button"
    ) {
      const attributes = node.attributes.properties;
      const hasSpread = attributes.some(ts.isJsxSpreadAttribute);
      const hasClickHandler = attributes.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "onClick" &&
          attribute.initializer !== undefined,
      );
      const typeAttribute = attributes.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "type",
      );
      const buttonType =
        typeAttribute?.initializer &&
        ts.isStringLiteral(typeAttribute.initializer)
          ? typeAttribute.initializer.text
          : null;

      if (buttonType === "button" && !hasClickHandler && !hasSpread) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push(
          `${path.slice(WEB_ROOT.length + 1)}:${line + 1}: botón type=button sin onClick`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function designSystemButtonViolations(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "Button"
    ) {
      const attributes = node.attributes.properties;
      const hasSpread = attributes.some(ts.isJsxSpreadAttribute);
      const hasClickHandler = attributes.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "onClick" &&
          attribute.initializer !== undefined,
      );
      const asChildAttribute = jsxAttribute(node, "asChild");
      const hasAsChild = Boolean(
        asChildAttribute && isExplicitTrue(asChildAttribute),
      );
      const typeAttribute = attributes.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sourceFile) === "type",
      );
      const buttonType =
        typeAttribute?.initializer &&
        ts.isStringLiteral(typeAttribute.initializer)
          ? typeAttribute.initializer.text
          : null;
      const hasNativeFormBehavior =
        buttonType === "submit" || buttonType === "reset";

      if (
        !hasAsChild &&
        !hasClickHandler &&
        !hasNativeFormBehavior &&
        !hasSpread
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push(
          `${path.slice(WEB_ROOT.length + 1)}:${line + 1}: Button sin navegación, submit ni onClick`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

test("todos los botones nativos declaran un tipo y no dependen del submit implícito", () => {
  const violations = applicationSources().flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return [...source.matchAll(/<button\b[\s\S]*?>/gu)]
      .filter(([openingTag]) => !/\btype\s*=/u.test(openingTag))
      .map(() => path.slice(WEB_ROOT.length + 1));
  });

  expect(violations).toEqual([]);
});

test("la interfaz no contiene enlaces vacíos ni handlers ornamentales", () => {
  const violations = applicationSources().flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const reasons = [
      /href\s*=\s*["']#["']/u.test(source) ? "href=#" : null,
      /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/u.test(source)
        ? "onClick vacío"
        : null,
      /\b(?:window\.)?alert\s*\(/u.test(source)
        ? "alerta bloqueante del navegador"
        : null,
      /\bwindow\.confirm\s*\(/u.test(source)
        ? "confirmacion bloqueante del navegador"
        : null,
      /\bwindow\.prompt\s*\(/u.test(source)
        ? "entrada bloqueante del navegador"
        : null,
    ].filter((reason): reason is string => Boolean(reason));
    return reasons.map(
      (reason) => `${path.slice(WEB_ROOT.length + 1)}: ${reason}`,
    );
  });

  expect(violations).toEqual([]);
});

test("ningún botón de acción nativo queda desconectado", () => {
  const violations = applicationSources().flatMap(nativeButtonViolations);
  expect(violations).toEqual([]);
});

test("ningún Button del sistema de diseño queda desconectado", () => {
  const violations = applicationSources().flatMap(designSystemButtonViolations);
  expect(violations).toEqual([]);
});

test("Button usa type=button por defecto y exige submit explícito", () => {
  const source = readFileSync(
    join(WEB_ROOT, "components/ui/button.tsx"),
    "utf8",
  );
  expect(source).toContain('type = "button"');
  expect(source).toContain("...(!asChild ? { type } : {})");
});

test("cada enlace estático del dashboard termina en una página real", () => {
  const sourceLinks = applicationSources().flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return [
      ...source.matchAll(/href\s*=\s*["'](\/dashboard(?:\/[^"'?#]*))/gu),
    ].map((match) => match[1]);
  });
  const links = new Set([
    ...dashboardConfig.map(({ href }) => href),
    ...sourceLinks,
  ]);
  const missing = [...links]
    .filter((href) => href !== "/dashboard")
    .filter((href) => {
      const relativeRoute = href.replace(/^\/dashboard\/?/u, "");
      return !existsSync(
        join(WEB_ROOT, "app", "dashboard", relativeRoute, "page.tsx"),
      );
    })
    .sort();

  expect(missing).toEqual([]);
});

test("cada página del dashboard es descubrible o declara una redirección legado", () => {
  const sources = applicationSources();
  const linkedRoutes = new Set([
    ...dashboardConfig.map(({ href }) => href),
    ...sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [
        ...source.matchAll(/href\s*=\s*["'](\/dashboard(?:\/[^"'?#]*))/gu),
      ].map((match) => match[1]);
    }),
  ]);
  const dashboardRoot = join(WEB_ROOT, "app", "dashboard");
  const orphaned = tsxSources(dashboardRoot)
    .filter((path) => /[\\/]page\.tsx$/u.test(path))
    .map((path) => {
      const relative = path
        .slice(join(WEB_ROOT, "app").length)
        .replaceAll("\\", "/")
        .replace(/\/page\.tsx$/u, "");
      return { path, route: relative || "/dashboard" };
    })
    .filter(({ route }) => route !== "/dashboard")
    .filter(({ path, route }) => {
      if (linkedRoutes.has(route)) return false;
      return !/\bredirect\s*\(/u.test(readFileSync(path, "utf8"));
    })
    .map(({ route }) => route)
    .sort();

  expect(orphaned).toEqual([]);
});

test("los callbacks de controles no pueden ser nulos ni funciones sin efecto", () => {
  const violations = applicationSources().flatMap(
    disconnectedEventHandlerViolations,
  );
  expect(violations).toEqual([]);
});

test("cada formulario y submit tiene una accion real", () => {
  const violations = applicationSources().flatMap(formAndSubmitViolations);
  expect(violations).toEqual([]);
});

test("cada enlace interno estatico y cada ancla terminan en un destino real", () => {
  const routes = applicationPageRoutes();
  const violations = applicationSources().flatMap((path) =>
    staticLinkViolations(path, routes),
  );
  expect(violations).toEqual([]);
});
