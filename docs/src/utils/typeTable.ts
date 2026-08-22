import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export interface PropertyDoc {
  name: string;
  type: string;
  default: string;
  description: string;
  optional: boolean;
}

export function getTypeProperties(
  filePath: string,
  typeName: string,
): PropertyDoc[] {
  const rootDir = process.cwd();
  // Resolve path relative to monorepo root or docs folder
  let absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(rootDir, filePath);

  if (!fs.existsSync(absolutePath)) {
    // If running from docs subdirectory, try resolving relative to parent monorepo root
    absolutePath = path.resolve(rootDir, "..", filePath);
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`getTypeProperties: File not found: "${filePath}" (tried ${absolutePath})`);
  }

  const fileContent = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );

  const properties: PropertyDoc[] = [];

  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      if (ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member)) {
            properties.push(extractProperty(member, sourceFile));
          }
        }
      }
    } else if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
          properties.push(extractProperty(member, sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return properties;
}

function extractProperty(
  node: ts.PropertySignature,
  sourceFile: ts.SourceFile,
): PropertyDoc {
  const name = node.name.getText(sourceFile);
  let type = node.type ? node.type.getText(sourceFile) : "any";
  type = type.replace(/\s*\|\s*undefined/g, "").trim();

  let description = "";
  let defaultValue = "-";

  const jsDocs = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (jsDocs && jsDocs.length > 0) {
    for (const doc of jsDocs) {
      if (typeof doc.comment === "string") {
        description = doc.comment;
      } else if (Array.isArray(doc.comment)) {
        description = doc.comment
          .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
          .join("");
      }

      if (doc.tags) {
        for (const tag of doc.tags) {
          if (tag.tagName.text === "default") {
            if (typeof tag.comment === "string") {
              defaultValue = tag.comment;
            } else if (Array.isArray(tag.comment)) {
              defaultValue = tag.comment
                .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
                .join("");
            }
          }
        }
      }
    }
  }

  return {
    name,
    type,
    default: defaultValue,
    description: description.trim(),
    optional: Boolean(node.questionToken),
  };
}
