
/**
 * AMPscript formatting utilities.
 *
 * This is a conservative, line-based formatter for %%[ ]%%,
 * IF/ELSE/ENDIF, and FOR/NEXT blocks. It is not a full parser.
 */

const {
  maskCommentsAndStrings,
  getStatement,
  classifyStatement,
  findMatchingBlock
} = require("./ampStructure");

function getIndentation(line) {
  return (line.match(/^[ \t]*/) || [""])[0];
}

function indentUnit(tabSize, insertSpaces) {
  return insertSpaces ? " ".repeat(Math.max(0, tabSize)) : "\t";
}

function applyLine(line, state, stack) {
  const code = maskCommentsAndStrings(line, state).trim();
  const statement = getStatement(code);
  const action = classifyStatement(statement);
  let indentLevel = stack.length;

  if (
    action &&
    (action.role === "align" ||
      action.role === "branch" ||
      action.role === "close")
  ) {
    const targetIndex = findMatchingBlock(stack, action.targetType);

    if (targetIndex >= 0) {
      indentLevel = stack[targetIndex].level;

      if (action.role === "branch") {
        // Keep the IF open, but close any nested blocks
        // left open before the branch.
        stack.splice(targetIndex + 1);
      } else if (action.role === "close") {
        // Close the matched block and any malformed blocks
        // nested inside it.
        stack.splice(targetIndex);
      }
    }
    // Unmatched closing statements do not mutate the stack.
    // A bare THEN or DO only lines up with its opener.
  }

  return { indentLevel, action, statement };
}

function formatAmpScriptText(
  text,
  tabSize = 4,
  insertSpaces = true
) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n/);
  const stack = [];
  const state = {
    inComment: false,
    quote: null
  };
  const unit = indentUnit(tabSize, insertSpaces);
  const formattedLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      formattedLines.push(line);
      continue;
    }

    const { indentLevel, action, statement } = applyLine(line, state, stack);

    formattedLines.push(
      unit.repeat(Math.max(0, indentLevel)) + line.trimStart()
    );

    if (action?.role === "open") {
      stack.push({
        type: statement.type,
        level: indentLevel
      });
    }
  }

  return formattedLines.join(newline);
}

function indentForLine(text, lineIndex, tabSize = 4, insertSpaces = true) {
  const lines = text.split(/\r\n|\n/);
  const stack = [];
  const state = {
    inComment: false,
    quote: null
  };
  const unit = indentUnit(tabSize, insertSpaces);

  for (let index = 0; index <= lineIndex && index < lines.length; index++) {
    const line = lines[index];

    if (!line.trim()) {
      if (index === lineIndex) {
        return unit.repeat(stack.length);
      }

      continue;
    }

    const { indentLevel, action, statement } = applyLine(line, state, stack);

    if (index === lineIndex) {
      return unit.repeat(Math.max(0, indentLevel));
    }

    if (action?.role === "open") {
      stack.push({
        type: statement.type,
        level: indentLevel
      });
    }
  }

  return "";
}

module.exports = {
  formatAmpScriptText,
  indentForLine,
  getIndentation
};
