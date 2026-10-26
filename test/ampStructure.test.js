const { test } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../language-configuration.json");

const {
  scanAmpScript,
  collectFoldingRanges,
  collectDeclaredVariables,
  isInsideCommentOrString
} = require("../src/ampStructure");

function problems(text) {
  return scanAmpScript(text).problems;
}

test("accepts an IF whose THEN is on a later line", () => {
  const text = [
    "IF @a == 1 AND",
    "@b == 2",
    "THEN",
    "SET @message = 1",
    "ENDIF"
  ].join("\n");

  assert.deepEqual(problems(text), []);
});

test("reports an unclosed multi-line IF", () => {
  const text = ["IF @a == 1 AND", "@b == 2 THEN"].join("\n");

  assert.deepEqual(problems(text), [
    { line: 0, message: "Unclosed IF block." }
  ]);
});

test("accepts a FOR whose DO is on a later line", () => {
  const text = ["FOR @i = 1 TO", "@count DO", "SET @value = @i", "NEXT @i"].join(
    "\n"
  );

  assert.deepEqual(problems(text), []);
});

test("reports an unclosed IF", () => {
  const text = ["IF @active == TRUE THEN", 'SET @message = "Hello"'].join(
    "\n"
  );

  assert.deepEqual(problems(text), [
    { line: 0, message: "Unclosed IF block." }
  ]);
});

test("reports an unmatched ENDIF", () => {
  assert.deepEqual(problems("ENDIF"), [
    { line: 0, message: "Unmatched ENDIF." }
  ]);
});

test("reports an unclosed FOR and an unmatched NEXT", () => {
  assert.deepEqual(problems("FOR @i = 1 TO @count DO"), [
    { line: 0, message: "Unclosed FOR block." }
  ]);

  assert.deepEqual(problems("NEXT @i"), [
    { line: 0, message: "Unmatched NEXT." }
  ]);
});

test("reports an unclosed AMPscript block and an unmatched closer", () => {
  assert.deepEqual(problems("%%[\nVAR @name"), [
    { line: 0, message: "Unclosed AMPscript block." }
  ]);

  assert.deepEqual(problems("]%%"), [
    { line: 0, message: "Unmatched ']%%'." }
  ]);
});

test("reports an unmatched ELSE", () => {
  assert.deepEqual(problems("ELSE"), [
    { line: 0, message: "Unmatched ELSE." }
  ]);
});

test("accepts a matched IF and FOR nested in an AMPscript block", () => {
  const text = [
    "%%[",
    "IF @active == TRUE THEN",
    'SET @message = "Hello"',
    "ELSE",
    'SET @message = "Welcome"',
    "ENDIF",
    "FOR @i = 1 TO @count DO",
    "SET @value = @i",
    "NEXT @i",
    "]%%"
  ].join("\n");

  assert.deepEqual(problems(text), []);
});

test("reports a nested block closed by an outer closer", () => {
  const text = [
    "IF @active == TRUE THEN",
    "FOR @i = 1 TO @count DO",
    "ENDIF"
  ].join("\n");

  assert.deepEqual(problems(text), [
    { line: 1, message: "Unclosed FOR block." }
  ]);
});

test("does not treat keywords inside strings or comments as blocks", () => {
  const text = [
    'SET @message = "IF @x THEN"',
    "SET @other = 'ENDIF'",
    "/*",
    "FOR @i = 1 TO 2 DO",
    "*/",
    "VAR @name"
  ].join("\n");

  assert.deepEqual(problems(text), []);
});

test("folds nested AMPscript, IF, and FOR blocks", () => {
  const text = [
    "%%[",
    "IF @active == TRUE THEN",
    "FOR @i = 1 TO @count DO",
    "SET @value = @i",
    "NEXT @i",
    "ENDIF",
    "]%%"
  ].join("\n");
  const { blocks } = scanAmpScript(text);

  assert.deepEqual(collectFoldingRanges(blocks, text.split("\n").length), [
    { start: 0, end: 6 },
    { start: 1, end: 5 },
    { start: 2, end: 4 }
  ]);
  assert.equal(blocks[0].type, "AMP_OPEN");
  assert.equal(blocks[0].children[0].type, "IF");
  assert.equal(blocks[0].children[0].children[0].type, "FOR");
  assert.equal(blocks[0].children[0].children[0].header, "FOR @i = 1 TO @count DO");
});

test("collects variables declared with VAR, SET, and FOR", () => {
  const text = [
    "%%[",
    "VAR @Name, @email",
    'SET @Name = "Ada"',
    "SET @count = 1",
    "FOR @i = 1 TO @count DO",
    "NEXT @i",
    "]%%",
    'SET @other = "@skip"'
  ].join("\n");

  assert.deepEqual(collectDeclaredVariables(text), [
    "Name",
    "email",
    "count",
    "i",
    "other"
  ]);
});

test("indent rules keep VAR put and follow multi-line headers", () => {
  const increase = new RegExp(
    config.indentationRules.increaseIndentPattern.pattern,
    config.indentationRules.increaseIndentPattern.flags
  );
  const decrease = new RegExp(
    config.indentationRules.decreaseIndentPattern.pattern,
    config.indentationRules.decreaseIndentPattern.flags
  );

  assert.equal(increase.test("IF @a == 1 AND"), true);
  assert.equal(increase.test("FOR @i = 1 TO"), true);
  assert.equal(increase.test("THEN"), true);
  assert.equal(decrease.test("THEN"), true);
  assert.equal(decrease.test("DO"), true);
  assert.equal(increase.test("VAR @name"), false);
  assert.equal(decrease.test("VAR @name"), false);
  assert.equal(
    config.autoClosingPairs.some((pair) => pair.open === "["),
    false
  );
  assert.equal(
    config.autoClosingPairs.some(
      (pair) => pair.open === "%%[" && pair.close === "]%%"
    ),
    true
  );
});

test("knows when the cursor is inside a string or comment", () => {
  const text = ['SET @message = "Hello"', "/* note */"].join("\n");

  assert.equal(isInsideCommentOrString(text, 0, 18), true);
  assert.equal(isInsideCommentOrString(text, 0, 4), false);
  assert.equal(isInsideCommentOrString(text, 1, 4), true);
});
