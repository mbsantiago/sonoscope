import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const corePkgPath = path.join(rootDir, "packages/core/package.json");
const rootPkgPath = path.join(rootDir, "package.json");
const pyprojectPath = path.join(rootDir, "packages/anywidget/pyproject.toml");

const { version } = JSON.parse(fs.readFileSync(corePkgPath, "utf-8"));

// Sync root package.json
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
if (rootPkg.version !== version) {
  rootPkg.version = version;
  fs.writeFileSync(
    rootPkgPath,
    `${JSON.stringify(rootPkg, null, 2)}\n`,
    "utf-8",
  );
}

// Sync Python pyproject.toml
let pyproject = fs.readFileSync(pyprojectPath, "utf-8");
pyproject = pyproject.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${version}"`,
);
fs.writeFileSync(pyprojectPath, pyproject, "utf-8");

console.log(
  `Synced version to ${version} in package.json and packages/anywidget/pyproject.toml`,
);
