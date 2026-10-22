
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cataloguePath = path.join(
  root,
  "syntaxes",
  "ampscript-functions.json"
);
const grammarPath = path.join(
  root,
  "syntaxes",
  "ampscript.tmLanguage.json"
);

const functions = JSON.parse(
  fs.readFileSync(cataloguePath, "utf8")
);

if (!Array.isArray(functions) || functions.length === 0) {
  throw new Error("The AMPscript function catalogue must be a non-empty array.");
}

const seen = new Set();

for (const name of functions) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid AMPscript function name: ${String(name)}`);
  }

  const normalised = name.toLowerCase();

  if (seen.has(normalised)) {
    throw new Error(`Duplicate AMPscript function: ${name}`);
  }

  seen.add(normalised);
}

// Longer names first makes the generated regex easier to inspect.
const escapedNames = [...functions]
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const functionPattern =
  `(?i:\\b(?:${escapedNames.join("|")})\\b)(?=\\s*\\()`;

const grammar = JSON.parse(
  fs.readFileSync(grammarPath, "utf8")
);

const patterns = grammar.repository?.["amp-token-patterns"]?.patterns;

if (!Array.isArray(patterns)) {
  throw new Error("Could not find amp-token-patterns in the grammar.");
}

const functionRule = patterns.find(
  (rule) => rule.name === "support.function.ampscript"
);

if (!functionRule) {
  throw new Error("Could not find the AMPscript function highlighting rule.");
}

functionRule.match = functionPattern;

fs.writeFileSync(
  grammarPath,
  `${JSON.stringify(grammar, null, 2)}\n`,
  "utf8"
);

console.log(`Generated highlighting rule for ${functions.length} functions.`);
