
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

  const unit = insertSpaces
    ? " ".repeat(Math.max(0, tabSize))
    : "\t";

  const formattedLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      formattedLines.push(line);
      continue;
    }

    const code = maskCommentsAndStrings(line, state).trim();
    const statement = getStatement(code);
    const action = classifyStatement(statement);

    let indentLevel = stack.length;

    if (action && (action.role === "branch" || action.role === "close")) {
      const targetIndex = findMatchingBlock(stack, action.targetType);

      if (targetIndex >= 0) {
        indentLevel = stack[targetIndex].level;

        if (action.role === "branch") {
          // Keep the IF open, but close any nested blocks
          // left open before the branch.
          stack.splice(targetIndex + 1);
        } else {
          // Close the matched block and any malformed blocks
          // nested inside it.
          stack.splice(targetIndex);
        }
      }
      // Unmatched closing statements do not mutate the stack.
    }

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

module.exports = {
  formatAmpScriptText,
  getIndentation
};
