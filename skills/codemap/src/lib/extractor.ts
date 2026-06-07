/**
 * TypeScript/JavaScript symbol extractor.
 *
 * Uses the TypeScript compiler API to extract exported symbols (functions,
 * classes, interfaces, types, consts, enums) and their one-line signatures
 * from source files, plus the list of import specifiers.
 *
 * No function bodies are included — only names + concise signatures.
 */

import ts from "typescript";
import fs from "node:fs";
import { SymbolSignature } from "./types.js";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface ExtractResult {
  exports: SymbolSignature[];
  imports: string[];
}

export function extractSymbols(absPath: string): ExtractResult {
  let src: string;
  try {
    src = fs.readFileSync(absPath, "utf8");
  } catch {
    return { exports: [], imports: [] };
  }

  const sourceFile = ts.createSourceFile(
    absPath,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );

  const exports: SymbolSignature[] = [];
  const importsSet = new Set<string>();

  visit(sourceFile, exports, importsSet, src);

  return { exports, imports: Array.from(importsSet) };
}

// ---------------------------------------------------------------------------
// AST visitor
// ---------------------------------------------------------------------------

function visit(
  node: ts.Node,
  exports: SymbolSignature[],
  imports: Set<string>,
  src: string
): void {
  // Import declarations
  if (ts.isImportDeclaration(node)) {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }
    return;
  }

  // export { foo } from '...'  /  export * from '...'
  if (ts.isExportDeclaration(node)) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }
    return;
  }

  // export default function / export default class
  if (ts.isExportAssignment(node)) {
    // e.g. export default someExpr — not easy to produce a useful signature
    return;
  }

  // Check if node has an export modifier at the top level
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isExported =
    mods?.some(
      (m) =>
        m.kind === ts.SyntaxKind.ExportKeyword ||
        m.kind === ts.SyntaxKind.DefaultKeyword
    ) ?? false;

  if (!isExported) {
    // Still recurse for module-level statements
    if (ts.isModuleBlock(node) || ts.isSourceFile(node)) {
      ts.forEachChild(node, (child) => visit(child, exports, imports, src));
    }
    return;
  }

  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    const sig = buildFunctionSignature(node, src);
    exports.push({
      name: node.name.text,
      kind: "function",
      signature: sig,
    });
    return;
  }

  // Arrow function / const function expression
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;

      if (
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) ||
          ts.isFunctionExpression(decl.initializer))
      ) {
        const sig = buildArrowSignature(name, decl.initializer, src);
        exports.push({ name, kind: "function", signature: sig });
      } else {
        // const / let / var
        const typeStr = decl.type ? printType(decl.type, src) : inferLiteralType(decl.initializer);
        exports.push({
          name,
          kind: "const",
          signature: `${name}${typeStr ? `: ${typeStr}` : ""}`,
        });
      }
    }
    return;
  }

  // Class declarations
  if (ts.isClassDeclaration(node) && node.name) {
    const sig = buildClassSignature(node, src);
    exports.push({ name: node.name.text, kind: "class", signature: sig });
    return;
  }

  // Interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    const sig = buildInterfaceSignature(node, src);
    exports.push({ name: node.name.text, kind: "interface", signature: sig });
    return;
  }

  // Type alias
  if (ts.isTypeAliasDeclaration(node)) {
    const typeStr = printType(node.type, src);
    const generics = node.typeParameters?.length
      ? `<${node.typeParameters.map((p) => p.name.text).join(", ")}>`
      : "";
    exports.push({
      name: node.name.text,
      kind: "type",
      signature: `type ${node.name.text}${generics} = ${typeStr}`,
    });
    return;
  }

  // Enum
  if (ts.isEnumDeclaration(node)) {
    const members = node.members
      .slice(0, 5)
      .map((m) => (ts.isIdentifier(m.name) ? m.name.text : "?"))
      .join(", ");
    const more = node.members.length > 5 ? `, ...${node.members.length - 5} more` : "";
    exports.push({
      name: node.name.text,
      kind: "enum",
      signature: `enum ${node.name.text} { ${members}${more} }`,
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// Signature builders
// ---------------------------------------------------------------------------

function buildFunctionSignature(node: ts.FunctionDeclaration, src: string): string {
  const name = node.name?.text ?? "anonymous";
  const generics = node.typeParameters?.length
    ? `<${node.typeParameters.map((p) => p.name.text).join(", ")}>`
    : "";
  const params = buildParams(node.parameters, src);
  const ret = node.type ? `: ${printType(node.type, src)}` : "";
  const fnMods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const asyncMod = fnMods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ? "async "
    : "";
  return `${asyncMod}function ${name}${generics}(${params})${ret}`;
}

function buildArrowSignature(
  name: string,
  node: ts.ArrowFunction | ts.FunctionExpression,
  src: string
): string {
  const params = buildParams(node.parameters, src);
  const ret = node.type ? `: ${printType(node.type, src)}` : "";
  const arrowMods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const asyncMod = arrowMods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ? "async "
    : "";
  return `${asyncMod}${name}(${params})${ret}`;
}

function buildClassSignature(node: ts.ClassDeclaration, src: string): string {
  const name = node.name?.text ?? "AnonymousClass";
  const generics = node.typeParameters?.length
    ? `<${node.typeParameters.map((p) => p.name.text).join(", ")}>`
    : "";

  const publicMethods: string[] = [];
  for (const member of node.members) {
    const memberModifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const isPrivate = memberModifiers?.some(
      (m) =>
        m.kind === ts.SyntaxKind.PrivateKeyword ||
        m.kind === ts.SyntaxKind.ProtectedKeyword
    );
    if (isPrivate) continue;

    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
      const mName = member.name.text;
      if (mName === "constructor") {
        const params = buildParams(member.parameters, src);
        publicMethods.push(`constructor(${params})`);
      } else {
        const params = buildParams(member.parameters, src);
        const ret = member.type ? `: ${printType(member.type, src)}` : "";
        const memberMods = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
        const asyncMod = memberMods?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword
        )
          ? "async "
          : "";
        publicMethods.push(`${asyncMod}${mName}(${params})${ret}`);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      const params = buildParams(member.parameters, src);
      publicMethods.push(`constructor(${params})`);
    } else if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
      const pName = member.name.text;
      const typeStr = member.type ? `: ${printType(member.type, src)}` : "";
      publicMethods.push(`${pName}${typeStr}`);
    }
  }

  const body =
    publicMethods.length > 0 ? ` { ${publicMethods.slice(0, 6).join("; ")} }` : "";
  return `class ${name}${generics}${body}`;
}

function buildInterfaceSignature(node: ts.InterfaceDeclaration, src: string): string {
  const name = node.name.text;
  const generics = node.typeParameters?.length
    ? `<${node.typeParameters.map((p) => p.name.text).join(", ")}>`
    : "";

  const members: string[] = [];
  for (const member of node.members) {
    if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
      const opt = member.questionToken ? "?" : "";
      const typeStr = member.type ? `: ${printType(member.type, src)}` : "";
      members.push(`${member.name.text}${opt}${typeStr}`);
    } else if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
      const params = buildParams(member.parameters, src);
      const ret = member.type ? `: ${printType(member.type, src)}` : "";
      members.push(`${member.name.text}(${params})${ret}`);
    }
  }

  const body =
    members.length > 0
      ? ` { ${members.slice(0, 6).join("; ")}${members.length > 6 ? `; ...${members.length - 6} more` : ""} }`
      : " {}";
  return `interface ${name}${generics}${body}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(params: ts.NodeArray<ts.ParameterDeclaration>, src: string): string {
  if (params.length === 0) return "";
  // Cap at 4 params for compactness
  const shown = params.slice(0, 4);
  const parts = shown.map((p) => {
    const nameStr = ts.isIdentifier(p.name)
      ? p.name.text
      : ts.isObjectBindingPattern(p.name)
        ? "{ ... }"
        : ts.isArrayBindingPattern(p.name)
          ? "[ ... ]"
          : "arg";
    const opt = p.questionToken ? "?" : "";
    const rest = p.dotDotDotToken ? "..." : "";
    const typeStr = p.type ? `: ${printType(p.type, src)}` : "";
    return `${rest}${nameStr}${opt}${typeStr}`;
  });
  if (params.length > 4) parts.push(`...${params.length - 4} more`);
  return parts.join(", ");
}

function printType(node: ts.TypeNode, src: string): string {
  // Use the source text for the type node — most concise
  const text = src.slice(node.getStart(), node.getEnd()).trim();
  // Cap long type strings
  if (text.length > 60) return text.slice(0, 57) + "...";
  return text;
}

function inferLiteralType(
  init: ts.Expression | undefined
): string | null {
  if (!init) return null;
  if (ts.isStringLiteral(init)) return "string";
  if (ts.isNumericLiteral(init)) return "number";
  if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword)
    return "boolean";
  if (ts.isArrayLiteralExpression(init)) return "unknown[]";
  if (ts.isObjectLiteralExpression(init)) return "object";
  return null;
}
