/**
 * AMPscript regions inside an HTML document.
 *
 * Editors run the existing scanners on each %%[ ]%% or %%= =%% slice
 * and map the results back to the HTML file. The surrounding markup
 * is not treated as AMPscript.
 */

const { scanAmpScript, collectFoldingRanges } = require("./ampStructure");
const { indentForLine } = require("./ampFormatting");

function offsetToPosition(text, offset) {
  let line = 0;
  let character = 0;
  const end = Math.min(offset, text.length);

  for (let index = 0; index < end; index++) {
    if (text[index] === "\n") {
      line++;
      character = 0;
    } else if (text[index] !== "\r") {
      character++;
    }
  }

  return { line, character };
}

function positionToOffset(text, line, character) {
  let currentLine = 0;
  let currentCharacter = 0;

  for (let index = 0; index < text.length; index++) {
    if (currentLine === line && currentCharacter === character) {
      return index;
    }

    if (text[index] === "\n") {
      currentLine++;
      currentCharacter = 0;
    } else if (text[index] !== "\r") {
      currentCharacter++;
    }
  }

  return text.length;
}

function makeRegion(kind, text, startOffset, endOffset, closed) {
  return {
    kind,
    startOffset,
    endOffset,
    closed,
    start: offsetToPosition(text, startOffset),
    end: offsetToPosition(text, endOffset)
  };
}

function findEmbeddedRegions(text) {
  const regions = [];
  let index = 0;
  let inComment = false;

  while (index < text.length) {
    if (!inComment && text.startsWith("<!--", index)) {
      inComment = true;
      index += 4;
      continue;
    }

    if (inComment) {
      if (text.startsWith("-->", index)) {
        inComment = false;
        index += 3;
        continue;
      }

      index++;
      continue;
    }

    if (text.startsWith("%%[", index) || text.startsWith("%%=", index)) {
      const block = text.startsWith("%%[", index);
      const closer = block ? "]%%" : "=%%";
      const closeAt = text.indexOf(closer, index + 3);
      const closed = closeAt !== -1;
      const endOffset = closed ? closeAt + closer.length : text.length;

      regions.push(
        makeRegion(block ? "block" : "inline", text, index, endOffset, closed)
      );
      index = endOffset;
      continue;
    }

    index++;
  }

  return regions;
}

function regionAt(regions, line, character, text) {
  const offset = positionToOffset(text, line, character);

  return (
    regions.find(
      (region) => offset >= region.startOffset && offset < region.endOffset
    ) || null
  );
}

function sliceOf(text, region) {
  return text.slice(region.startOffset, region.endOffset);
}

function relativePosition(text, region, line, character) {
  const offset = positionToOffset(text, line, character);
  const slice = text.slice(region.startOffset, Math.max(region.startOffset, offset));
  const lines = slice.split(/\r\n|\n/);

  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length
  };
}

function mapSlice(text, region, sliceLine, sliceCharacter) {
  let line = 0;
  let character = 0;

  for (let index = region.startOffset; index < region.endOffset; index++) {
    if (line === sliceLine && character === sliceCharacter) {
      return offsetToPosition(text, index);
    }

    if (text[index] === "\n") {
      line++;
      character = 0;
    } else if (text[index] !== "\r") {
      character++;
    }
  }

  return offsetToPosition(text, region.endOffset);
}

function lineEntirelyInRegion(text, line, region) {
  const lineStart = positionToOffset(text, line, 0);
  let lineEnd = lineStart;

  while (lineEnd < text.length && text[lineEnd] !== "\n") {
    lineEnd++;
  }

  if (text[lineEnd - 1] === "\r") {
    lineEnd--;
  }

  const coveredFrom = Math.max(lineStart, region.startOffset);
  const coveredTo = Math.min(lineEnd, region.endOffset);
  const before = text.slice(lineStart, coveredFrom);
  const after = text.slice(coveredTo, lineEnd);

  return before.trim() === "" && after.trim() === "";
}

function embeddedProblems(text) {
  const problems = [];

  for (const region of findEmbeddedRegions(text)) {
    if (!region.closed) {
      const end = offsetToPosition(text, region.startOffset + 3);
      problems.push({
        line: region.start.line,
        startCharacter: region.start.character,
        endCharacter: end.character,
        message:
          region.kind === "block"
            ? "Unclosed AMPscript block."
            : "Unclosed AMPscript expression."
      });
      continue;
    }

    const slice = sliceOf(text, region);
    const sliceLines = slice.split(/\r\n|\n/);

    for (const problem of scanAmpScript(slice).problems) {
      const lineText = sliceLines[problem.line] || "";
      const start = Math.max(0, lineText.search(/\S/));
      const from = mapSlice(text, region, problem.line, start);
      const to = mapSlice(text, region, problem.line, lineText.length);

      problems.push({
        line: from.line,
        startCharacter: from.character,
        endCharacter: to.line === from.line ? to.character : from.character,
        message: problem.message
      });
    }
  }

  return problems;
}

function mapBlocks(blocks, text, region) {
  return blocks.map((block) => ({
    type: block.type,
    header: block.header,
    openLine: mapSlice(text, region, block.openLine, 0).line,
    closeLine:
      block.closeLine === null
        ? null
        : mapSlice(text, region, block.closeLine, 0).line,
    children: mapBlocks(block.children, text, region)
  }));
}

function embeddedBlocks(text) {
  const blocks = [];

  for (const region of findEmbeddedRegions(text)) {
    if (region.kind !== "block" || !region.closed) {
      continue;
    }

    blocks.push(
      ...mapBlocks(scanAmpScript(sliceOf(text, region)).blocks, text, region)
    );
  }

  return blocks;
}

function embeddedFolds(text) {
  const folds = [];

  for (const region of findEmbeddedRegions(text)) {
    if (region.kind !== "block" || !region.closed) {
      continue;
    }

    const slice = sliceOf(text, region);
    const ranges = collectFoldingRanges(
      scanAmpScript(slice).blocks,
      slice.split(/\r\n|\n/).length
    );

    for (const range of ranges) {
      const start = mapSlice(text, region, range.start, 0);
      const end = mapSlice(text, region, range.end, 0);

      if (end.line > start.line) {
        folds.push({
          start: start.line,
          end: end.line
        });
      }
    }
  }

  return folds;
}

function lineBounds(text, line) {
  const lineStart = positionToOffset(text, line, 0);
  let lineEnd = lineStart;

  while (lineEnd < text.length && text[lineEnd] !== "\n") {
    lineEnd++;
  }

  const contentEnd = text[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;

  return {
    lineStart,
    lineEnd,
    text: text.slice(lineStart, contentEnd)
  };
}

function openerBase(text, region) {
  const { lineStart } = lineBounds(text, region.start.line);
  const before = text.slice(lineStart, region.startOffset);

  return before.trim() === "" ? before : "";
}

function desiredIndent(text, line, character, tabSize = 4, insertSpaces = true) {
  const region = regionAt(findEmbeddedRegions(text), line, character, text);

  if (!region || region.kind !== "block") {
    return null;
  }

  if (!lineEntirelyInRegion(text, line, region)) {
    return null;
  }

  const bounds = lineBounds(text, line);

  if (!region.closed && /[<>]/.test(bounds.text)) {
    return null;
  }

  const relative = relativePosition(text, region, line, 0);
  const slice = text.slice(region.startOffset, region.endOffset);

  return (
    openerBase(text, region) +
    indentForLine(slice, relative.line, tabSize, insertSpaces)
  );
}

function declaredSource(text) {
  return findEmbeddedRegions(text)
    .filter((region) => region.closed)
    .map((region) => sliceOf(text, region))
    .join("\n");
}

module.exports = {
  findEmbeddedRegions,
  regionAt,
  relativePosition,
  sliceOf,
  embeddedProblems,
  embeddedBlocks,
  embeddedFolds,
  desiredIndent,
  declaredSource,
  lineEntirelyInRegion,
  positionToOffset
};
