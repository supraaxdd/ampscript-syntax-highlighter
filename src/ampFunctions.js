const { maskCommentsAndStrings, isInsideCommentOrString } = require("./ampStructure");

const catalogue = require("../syntaxes/ampscript-functions.json");

function argumentLabel(argument) {
  let label = argument.name;

  if (argument.repeatable) {
    label += "...";
  }

  if (argument.optional || argument.repeatable) {
    label = `[${label}]`;
  }

  return label;
}

function variableCompletion(name, atAlready) {
  return {
    label: `@${name}`,
    filterText: name,
    insertText: atAlready ? name : `@${name}`
  };
}

/**
 * The word range may include the @, or the @ may sit just before it.
 * Either way the user has already typed the sigil.
 */
function variablePrefix(line, character, wordStart, wordText) {
  if (wordText && wordText.startsWith("@")) {
    return {
      atAlready: true,
      typed: wordText.slice(1),
      dropAt: true
    };
  }

  const before =
    wordStart === null || wordStart === undefined
      ? line[character - 1]
      : wordStart > 0
        ? line[wordStart - 1]
        : "";

  if (before === "@") {
    return {
      atAlready: true,
      typed: wordText || "",
      dropAt: false
    };
  }

  return {
    atAlready: false,
    typed: wordText || "",
    dropAt: false
  };
}

function findFunction(name) {
  if (typeof name !== "string") {
    return null;
  }

  const key = name.toLowerCase();

  return (
    catalogue.find(
      (entry) => entry && entry.name && entry.name.toLowerCase() === key
    ) || null
  );
}

function buildSignature(entry) {
  const args = Array.isArray(entry.arguments) ? entry.arguments : [];
  let cursor = entry.name.length + 1;
  const parameters = args.map((argument) => {
    const rendered = argumentLabel(argument);
    const start = cursor;
    const end = start + rendered.length;
    cursor = end + 2;

    return {
      label: [start, end],
      rendered,
      documentation: argument.description || ""
    };
  });

  return {
    label: `${entry.name}(${parameters.map((parameter) => parameter.rendered).join(", ")})`,
    parameters
  };
}

function callAtCursor(text, lineNumber, character) {
  if (isInsideCommentOrString(text, lineNumber, character)) {
    return null;
  }

  const lines = text.split(/\r\n|\n/);
  const state = {
    inComment: false,
    quote: null
  };
  const masked = lines.map((line) => maskCommentsAndStrings(line, state));
  let line = lineNumber;
  let column = character;
  let depth = 0;
  let commas = 0;

  while (line >= 0) {
    const content = masked[line] || "";
    const start = line === lineNumber ? column - 1 : content.length - 1;

    for (let index = start; index >= 0; index--) {
      const char = content[index];

      if (char === ")") {
        depth++;
      } else if (char === "(") {
        if (depth === 0) {
          const prefix = content.slice(0, index).match(/[A-Za-z_][A-Za-z0-9_]*\s*$/);

          if (!prefix) {
            return null;
          }

          return {
            name: prefix[0].trim(),
            commas
          };
        }

        depth--;
      } else if (char === "," && depth === 0) {
        commas++;
      }
    }

    line--;
  }

  return null;
}

module.exports = {
  catalogue,
  findFunction,
  buildSignature,
  callAtCursor,
  variableCompletion,
  variablePrefix
};
