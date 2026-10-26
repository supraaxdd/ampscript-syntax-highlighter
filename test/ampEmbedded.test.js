const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  findEmbeddedRegions,
  regionAt,
  embeddedProblems,
  embeddedBlocks,
  embeddedFolds,
  desiredIndent
} = require("../src/ampEmbedded");

const sample = [
  "<html>",
  "<body>",
  "<p>IF @x == 1 THEN</p>",
  "%%[",
  "IF @active == TRUE THEN",
  'SET @message = "Hi"',
  "ENDIF",
  "]%%",
  '%%=Concat("a", "b")=%%',
  "<!-- %%[ ENDIF ]%% -->",
  "</body>",
  "</html>"
].join("\n");

test("finds block and inline regions and skips comments and loose keywords", () => {
  const regions = findEmbeddedRegions(sample);

  assert.deepEqual(
    regions.map((region) => region.kind),
    ["block", "inline"]
  );
  assert.equal(regions[0].closed, true);
  assert.equal(regions[0].start.line, 3);
  assert.equal(regions[1].start.line, 8);
  assert.equal(regionAt(regions, 2, 3, sample), null);
  assert.equal(regionAt(regions, 5, 0, sample).kind, "block");
  assert.equal(regionAt(regions, 9, 8, sample), null);
});

test("maps an unmatched closer to the HTML line and ignores markup", () => {
  const text = ["<p>", "%%[", "ENDIF", "]%%", "</p>"].join("\n");

  assert.deepEqual(embeddedProblems(text), [
    {
      line: 2,
      startCharacter: 0,
      endCharacter: 5,
      message: "Unmatched ENDIF."
    }
  ]);
});

test("reports an unclosed delimiter without scanning the rest of the page", () => {
  const text = ["<p>%%[</p>", "<p>ENDIF</p>"].join("\n");
  const problems = embeddedProblems(text);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].message, "Unclosed AMPscript block.");
  assert.equal(problems[0].line, 0);
});

test("folds and outlines the embedded block on the HTML lines", () => {
  const text = ["<div>", "%%[", "VAR @name", "]%%", "</div>"].join("\n");

  assert.deepEqual(embeddedFolds(text), [{ start: 1, end: 3 }]);
  assert.equal(embeddedBlocks(text)[0].type, "AMP_OPEN");
  assert.equal(embeddedBlocks(text)[0].openLine, 1);
  assert.equal(embeddedBlocks(text)[0].closeLine, 3);
});

test("indents only a line that belongs entirely to an AMPscript block", () => {
  const text = [
    "<div>",
    "%%[",
    "IF @a == 1 THEN",
    "SET @b = 1",
    "ENDIF",
    "]%%",
    "</div>"
  ].join("\n");

  assert.equal(desiredIndent(text, 3, 0), "        ");
  assert.equal(desiredIndent(text, 2, 0), "    ");
  assert.equal(desiredIndent(text, 0, 1), null);
  assert.equal(
    desiredIndent('<p>%%[ SET @b = 1 ]%%</p>', 0, 10),
    null
  );
});

test("keeps the HTML indent of the block and indents the body under it", () => {
  const text = [
    "<div>",
    "    %%[",
    "IF @a == 1 THEN",
    "",
    "ENDIF",
    "    ]%%",
    "</div>"
  ].join("\n");

  assert.equal(desiredIndent(text, 1, 4), "    ");
  assert.equal(desiredIndent(text, 2, 0), "        ");
  assert.equal(desiredIndent(text, 3, 0), "            ");
  assert.equal(desiredIndent(text, 4, 0), "        ");
  assert.equal(desiredIndent(text, 5, 4), "    ");
});

test("indents an open block without reformatting the HTML after it", () => {
  const text = ["<div>", "%%[", "SET @b = 1", "<p>ENDIF</p>"].join("\n");

  assert.equal(desiredIndent(text, 2, 0), "    ");
  assert.equal(desiredIndent(text, 3, 1), null);
});

test("injects AMPscript highlighting into the HTML grammar VS Code actually uses", () => {
  const manifest = require("../package.json");
  const grammar = require("../syntaxes/ampscript-html-injection.tmLanguage.json");
  const contribution = manifest.contributes.grammars.find(
    (item) => item.scopeName === "html.ampscript.injection"
  );

  assert.ok(contribution.injectTo.includes("text.html.derivative"));
  assert.ok(contribution.injectTo.includes("text.html.basic"));
  assert.equal(contribution.embeddedLanguages["source.ampscript"], "ampscript");
  assert.match(grammar.injectionSelector, /text\.html\.derivative/);
  assert.equal(grammar.patterns[0].contentName, "source.ampscript");
  assert.equal(grammar.patterns[1].contentName, "source.ampscript");
});
