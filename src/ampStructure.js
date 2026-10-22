/**
 * Shared line scan for AMPscript blocks.
 *
 * Formatting, diagnostics, folding, and outline all use this so a
 * keyword inside a string or comment is not treated as structure.
 */

function maskCommentsAndStrings(line, state) {
  let output = "";
  let quote = state.quote || null;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (state.inComment) {
      if (char === "*" && next === "/") {
        output += "  ";
        state.inComment = false;
        i++;
      } else {
        output += " ";
      }
      continue;
    }

    if (quote) {
      if (char === "\\") {
        output += " ";
        escaped = !escaped;
        continue;
      }

      if (char === quote && !escaped) {
        quote = null;
      }

      output += " ";
      escaped = false;
      continue;
    }

    if (char === "/" && next === "*") {
      output += "  ";
      state.inComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      output += " ";
      continue;
    }

    output += char;
  }

  state.quote = quote;
  return output;
}

function statementSource(text) {
  return text
    .trim()
    .replace(/^%%\[\s*/, "")
    .replace(/\s*\]%%$/, "")
    .trim();
}

function getStatement(code) {
  const text = code.trim();

  // A delimiter on its own line opens or closes an AMPscript block.
  // VAR and other statements inside that block keep the extra indent.
  if (/^%%\[\s*$/.test(text)) {
    return { type: "AMP_OPEN" };
  }

  if (/^\]%%\s*$/.test(text)) {
    return { type: "AMP_CLOSE" };
  }

  // Inline delimiters do not add another indent level, but they must
  // not hide the keyword that shares their line.
  const source = statementSource(text);

  if (!source) {
    return null;
  }

  if (/^ELSEIF\b/i.test(source) && /\bTHEN\s*$/i.test(source)) {
    return { type: "ELSEIF" };
  }

  if (/^ELSE\b/i.test(source)) {
    return { type: "ELSE" };
  }

  if (/^ENDIF\b/i.test(source)) {
    return { type: "ENDIF" };
  }

  if (/^NEXT\b/i.test(source)) {
    return { type: "NEXT" };
  }

  if (/^IF\b/i.test(source) && /\bTHEN\s*$/i.test(source)) {
    return { type: "IF" };
  }

  if (/^FOR\b/i.test(source) && /\bDO\s*$/i.test(source)) {
    return { type: "FOR" };
  }

  return null;
}

function classifyStatement(statement) {
  if (!statement) {
    return null;
  }

  if (statement.type === "ELSE" || statement.type === "ELSEIF") {
    return { role: "branch", targetType: "IF" };
  }

  if (statement.type === "ENDIF") {
    return { role: "close", targetType: "IF" };
  }

  if (statement.type === "NEXT") {
    return { role: "close", targetType: "FOR" };
  }

  if (statement.type === "AMP_CLOSE") {
    return { role: "close", targetType: "AMP_OPEN" };
  }

  if (
    statement.type === "IF" ||
    statement.type === "FOR" ||
    statement.type === "AMP_OPEN"
  ) {
    return { role: "open" };
  }

  return null;
}

function findMatchingBlock(stack, targetType) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].type === targetType) {
      return i;
    }
  }

  return -1;
}

function unclosedMessage(type) {
  if (type === "AMP_OPEN") {
    return "Unclosed AMPscript block.";
  }

  if (type === "FOR") {
    return "Unclosed FOR block.";
  }

  return "Unclosed IF block.";
}

function unmatchedMessage(type) {
  if (type === "AMP_CLOSE") {
    return "Unmatched ']%%'.";
  }

  if (type === "NEXT") {
    return "Unmatched NEXT.";
  }

  if (type === "ELSE") {
    return "Unmatched ELSE.";
  }

  if (type === "ELSEIF") {
    return "Unmatched ELSEIF.";
  }

  return "Unmatched ENDIF.";
}

function rememberUnclosed(block, lineNumber, problems) {
  block.closeLine = lineNumber;
  problems.push({
    line: block.openLine,
    message: unclosedMessage(block.type)
  });
}

function scanAmpScript(text) {
  const lines = text.split(/\r\n|\n/);
  const stack = [];
  const blocks = [];
  const problems = [];
  const state = {
    inComment: false,
    quote: null
  };

  const parentChildren = () =>
    stack.length === 0 ? blocks : stack[stack.length - 1].children;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];

    if (!line.trim()) {
      continue;
    }

    const code = maskCommentsAndStrings(line, state).trim();
    const statement = getStatement(code);
    const action = classifyStatement(statement);

    if (!action) {
      continue;
    }

    if (action.role === "branch" || action.role === "close") {
      const targetIndex = findMatchingBlock(stack, action.targetType);

      if (targetIndex < 0) {
        problems.push({
          line: lineNumber,
          message: unmatchedMessage(statement.type)
        });
      } else if (action.role === "branch") {
        for (let i = stack.length - 1; i > targetIndex; i--) {
          rememberUnclosed(stack[i], lineNumber, problems);
        }

        stack.splice(targetIndex + 1);
      } else {
        for (let i = stack.length - 1; i > targetIndex; i--) {
          rememberUnclosed(stack[i], lineNumber, problems);
        }

        stack[targetIndex].closeLine = lineNumber;
        stack.splice(targetIndex);
      }
    }

    if (action.role === "open") {
      const block = {
        type: statement.type,
        openLine: lineNumber,
        closeLine: null,
        header: line.trim(),
        children: []
      };

      parentChildren().push(block);
      stack.push(block);
    }
  }

  for (const block of stack) {
    problems.push({
      line: block.openLine,
      message: unclosedMessage(block.type)
    });
  }

  return { blocks, problems };
}

function collectFoldingRanges(blocks, lineCount, ranges = []) {
  for (const block of blocks) {
    const end =
      block.closeLine === null ? lineCount - 1 : block.closeLine;

    if (end > block.openLine) {
      ranges.push({
        start: block.openLine,
        end
      });
    }

    collectFoldingRanges(block.children, lineCount, ranges);
  }

  return ranges;
}

function addVariable(names, seen, name) {
  const key = name.toLowerCase();

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  names.push(name);
}

function collectDeclaredVariables(text) {
  const lines = text.split(/\r\n|\n/);
  const state = {
    inComment: false,
    quote: null
  };
  const names = [];
  const seen = new Set();

  for (const line of lines) {
    const source = statementSource(maskCommentsAndStrings(line, state));

    if (/^VAR\b/i.test(source)) {
      for (const match of source.matchAll(/@[A-Za-z_][A-Za-z0-9_]*/g)) {
        addVariable(names, seen, match[0].slice(1));
      }
      continue;
    }

    const setMatch = source.match(/^SET\s+@([A-Za-z_][A-Za-z0-9_]*)/i);

    if (setMatch) {
      addVariable(names, seen, setMatch[1]);
      continue;
    }

    const forMatch = source.match(/^FOR\s+@([A-Za-z_][A-Za-z0-9_]*)/i);

    if (forMatch) {
      addVariable(names, seen, forMatch[1]);
    }
  }

  return names;
}

function isInsideCommentOrString(text, lineNumber, character) {
  const lines = text.split(/\r\n|\n/);
  const state = {
    inComment: false,
    quote: null
  };
  const lastLine = Math.min(lineNumber, lines.length);

  for (let i = 0; i < lastLine; i++) {
    maskCommentsAndStrings(lines[i], state);
  }

  if (lineNumber >= 0 && lineNumber < lines.length) {
    maskCommentsAndStrings(
      lines[lineNumber].slice(0, Math.max(0, character)),
      state
    );
  }

  return Boolean(state.inComment || state.quote);
}

module.exports = {
  maskCommentsAndStrings,
  getStatement,
  classifyStatement,
  findMatchingBlock,
  scanAmpScript,
  collectFoldingRanges,
  collectDeclaredVariables,
  isInsideCommentOrString
};
