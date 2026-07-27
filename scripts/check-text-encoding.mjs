import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "documents", "supabase"];
const EXTENSIONS = new Set([".css", ".md", ".sql", ".ts", ".tsx"]);
const IGNORED_DIRS = new Set([".git", ".next", ".open-next", ".wrangler", "node_modules"]);

const mojibakePattern = /[\uFFFD]|\u00e1[\u00ba\u00bb]|\u00c4|\u00c6|\u0102[\u00a0-\u00bf]/u;
const knownBadRepairPattern = /\bchờn\b|\bChờn\b/u;

function isScannedFile(filePath) {
  return Array.from(EXTENSIONS).some((extension) => filePath.endsWith(extension));
}

function listFiles(path) {
  const stats = statSync(path);

  if (stats.isDirectory()) {
    const directoryName = path.split(/[\\/]/).at(-1);

    if (directoryName && IGNORED_DIRS.has(directoryName)) {
      return [];
    }

    return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
  }

  return isScannedFile(path) ? [path] : [];
}

function findLineIssue(line) {
  const match = mojibakePattern.exec(line) ?? knownBadRepairPattern.exec(line);

  if (!match) {
    return null;
  }

  return {
    column: match.index + 1,
    sample: line.trim().slice(0, 160),
  };
}

const issues = [];

for (const root of ROOTS) {
  for (const filePath of listFiles(root)) {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      const issue = findLineIssue(line);

      if (issue) {
        issues.push({
          filePath,
          line: index + 1,
          ...issue,
        });
      }
    });
  }
}

if (issues.length > 0) {
  console.error("Text encoding check failed. Possible mojibake was found:");

  for (const issue of issues) {
    console.error(`${issue.filePath}:${issue.line}:${issue.column} ${issue.sample}`);
  }

  process.exit(1);
}

console.log("Text encoding check passed.");
