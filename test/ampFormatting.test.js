
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { formatAmpScriptText } = require("../src/ampFormatting");

test("keeps VAR indented inside an AMPscript block", () => {
  const input = [
    "%%[",
    "    VAR @name",
    "    SET @name = \"Ada\"",
    "]%%"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("indents statements inside an AMPscript block", () => {
  const input = [
    "%%[",
    "VAR @name",
    "SET @name = \"Ada\"",
    "]%%"
  ].join("\n");

  const expected = [
    "%%[",
    "    VAR @name",
    "    SET @name = \"Ada\"",
    "]%%"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("keeps VAR indented inside IF within an AMPscript block", () => {
  const input = [
    "%%[",
    "IF @active == TRUE THEN",
    "VAR @name",
    "SET @name = \"Ada\"",
    "ENDIF",
    "]%%"
  ].join("\n");

  const expected = [
    "%%[",
    "    IF @active == TRUE THEN",
    "        VAR @name",
    "        SET @name = \"Ada\"",
    "    ENDIF",
    "]%%"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("keeps VAR indented when IF shares a line with the block delimiter", () => {
  const input = [
    "%%[ IF @active == TRUE THEN",
    "    VAR @name",
    "ENDIF ]%%"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("does not treat block delimiters inside strings as blocks", () => {
  const input = [
    'SET @open = "%%["',
    'SET @close = "]%%"',
    "VAR @name"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("indents an IF block", () => {
  const input = [
    'IF @name != "" THEN',
    'SET @message = "Hello"',
    "ENDIF"
  ].join("\n");

  const expected = [
    'IF @name != "" THEN',
    '    SET @message = "Hello"',
    "ENDIF"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("aligns ELSE and ENDIF", () => {
  const input = [
    "IF @active == TRUE THEN",
    "    SET @message = \"Hello\"",
    "        ELSE",
    "        SET @message = \"Welcome\"",
    "            ENDIF"
  ].join("\n");

  const expected = [
    "IF @active == TRUE THEN",
    '    SET @message = "Hello"',
    "ELSE",
    '    SET @message = "Welcome"',
    "ENDIF"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("preserves nested IF structure", () => {
  const input = [
    "IF @outer == TRUE THEN",
    "IF @inner == TRUE THEN",
    'SET @message = "Nested"',
    "ELSE",
    'SET @message = "Inner fallback"',
    "ENDIF",
    "ENDIF"
  ].join("\n");

  const expected = [
    "IF @outer == TRUE THEN",
    "    IF @inner == TRUE THEN",
    '        SET @message = "Nested"',
    "    ELSE",
    '        SET @message = "Inner fallback"',
    "    ENDIF",
    "ENDIF"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("aligns NEXT with FOR", () => {
  const input = [
    "FOR @i = 1 TO @count DO",
    "SET @value = @i",
    "    NEXT @i"
  ].join("\n");

  const expected = [
    "FOR @i = 1 TO @count DO",
    "    SET @value = @i",
    "NEXT @i"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("does not interpret keywords inside strings as blocks", () => {
  const input = [
    'SET @message = "IF @x THEN"',
    "SET @other = 'ENDIF'"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("aligns nested ELSE and ENDIF statements", () => {
  const input = [
    "IF @outer == TRUE THEN",
    "IF @inner == TRUE THEN",
    'SET @message = "Nested"',
    "ELSE",
    'SET @message = "Fallback"',
    "ENDIF",
    "ENDIF"
  ].join("\n");

  const expected = [
    "IF @outer == TRUE THEN",
    "    IF @inner == TRUE THEN",
    '        SET @message = "Nested"',
    "    ELSE",
    '        SET @message = "Fallback"',
    "    ENDIF",
    "ENDIF"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("does not treat keywords inside strings as blocks", () => {
  const input = [
    'SET @message = "IF @x THEN"',
    "SET @other = 'ENDIF'",
    'SET @third = "ELSE"'
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("does not treat keywords inside block comments as blocks", () => {
  const input = [
    "/*",
    "IF @x THEN",
    "ENDIF",
    "*/",
    'SET @message = "Hello"'
  ].join("\n");

  assert.equal(formatAmpScriptText(input), input);
});

test("formatting is idempotent", () => {
  const input = [
    "IF @active == TRUE THEN",
    "SET @message = \"Hello\"",
    "ELSE",
    "SET @message = \"Welcome\"",
    "ENDIF"
  ].join("\n");

  const once = formatAmpScriptText(input);
  const twice = formatAmpScriptText(once);

  assert.equal(twice, once);
});

test("unmatched ENDIF does not corrupt later blocks", () => {
  const input = [
    "ENDIF",
    "IF @active == TRUE THEN",
    "SET @message = \"Hello\"",
    "ENDIF"
  ].join("\n");

  const expected = [
    "ENDIF",
    "IF @active == TRUE THEN",
    '    SET @message = "Hello"',
    "ENDIF"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});

test("supports nested FOR and IF blocks", () => {
  const input = [
    "FOR @i = 1 TO @count DO",
    "IF @i > 1 THEN",
    "SET @value = @i",
    "ENDIF",
    "NEXT @i"
  ].join("\n");

  const expected = [
    "FOR @i = 1 TO @count DO",
    "    IF @i > 1 THEN",
    "        SET @value = @i",
    "    ENDIF",
    "NEXT @i"
  ].join("\n");

  assert.equal(formatAmpScriptText(input), expected);
});
