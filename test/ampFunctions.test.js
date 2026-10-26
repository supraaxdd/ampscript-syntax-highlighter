const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  catalogue,
  findFunction,
  buildSignature,
  callAtCursor,
  variableCompletion,
  variablePrefix
} = require("../src/ampFunctions");

test("catalogue entries have a name, summary, arguments, and docs link", () => {
  assert.ok(catalogue.length > 90);

  for (const entry of catalogue) {
    assert.match(entry.name, /^[A-Za-z_][A-Za-z0-9_]*$/);
    assert.equal(typeof entry.summary, "string");
    assert.ok(entry.summary.length > 0);
    assert.ok(Array.isArray(entry.arguments));
    assert.match(entry.docs, /^https:\/\/ampscript\.guide\/[a-z0-9]+\/$/);
  }

  assert.ok(findFunction("CloudPagesURL"));
  assert.ok(findFunction("EncryptSymmetric"));
  assert.ok(findFunction("DecryptSymmetric"));
  assert.equal(findFunction("concat").name, "Concat");
  assert.equal(findFunction("IF"), null);
});

test("does not insert a second @ when the user already typed one", () => {
  assert.deepEqual(variableCompletion("email", true), {
    label: "@email",
    filterText: "email",
    insertText: "email"
  });
  assert.deepEqual(variableCompletion("email", false), {
    label: "@email",
    filterText: "email",
    insertText: "@email"
  });

  assert.deepEqual(variablePrefix("SET @em", 7, 5, "@em"), {
    atAlready: true,
    typed: "em",
    dropAt: true
  });
  assert.deepEqual(variablePrefix("SET @", 5, null, ""), {
    atAlready: true,
    typed: "",
    dropAt: false
  });
  assert.deepEqual(variablePrefix("SET em", 6, 4, "em"), {
    atAlready: false,
    typed: "em",
    dropAt: false
  });
});

test("signature labels include every argument", () => {
  const signature = buildSignature(findFunction("IIF"));

  assert.equal(signature.label, "IIF(condition, trueValue, falseValue)");
  assert.equal(signature.parameters.length, 3);
  assert.deepEqual(signature.parameters[0].label, [4, 13]);
});

test("finds the function call around the cursor", () => {
  const line = 'SET @name = Concat("Ada", " Lovelace")';
  const afterComma = line.indexOf(",") + 1;

  assert.deepEqual(callAtCursor(line, 0, line.indexOf("(") + 1), {
    name: "Concat",
    commas: 0
  });
  assert.deepEqual(callAtCursor(line, 0, afterComma), {
    name: "Concat",
    commas: 1
  });
  assert.equal(callAtCursor('SET @name = "Concat("', 0, 20), null);
});
