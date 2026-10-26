const vscode = require("vscode");
const { formatAmpScriptText, indentForLine } = require("./ampFormatting");
const {
  scanAmpScript,
  collectFoldingRanges,
  collectDeclaredVariables,
  isInsideCommentOrString
} = require("./ampStructure");
const {
  findEmbeddedRegions,
  regionAt,
  relativePosition,
  sliceOf,
  embeddedProblems,
  embeddedBlocks,
  embeddedFolds,
  desiredIndent,
  declaredSource,
  positionToOffset
} = require("./ampEmbedded");
const {
  catalogue,
  findFunction,
  buildSignature,
  callAtCursor,
  variableCompletion,
  variablePrefix
} = require("./ampFunctions");

const KEYWORDS = [
  "SET",
  "VAR",
  "IF",
  "THEN",
  "ELSE",
  "ELSEIF",
  "ENDIF",
  "FOR",
  "TO",
  "DO",
  "NEXT",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "MOD",
  "DOWNTO",
  "TRUE",
  "FALSE"
];

const WORD_PATTERN = /@?[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?/;

function activate(context) {
  const ampscriptSelector = { language: "ampscript" };
  const htmlSelector = { language: "html" };
  const both = [ampscriptSelector, htmlSelector];
  const diagnostics = vscode.languages.createDiagnosticCollection("ampscript");

  const refreshDiagnostics = (document) => {
    if (!isSupported(document)) {
      return;
    }

    diagnostics.set(document.uri, diagnosticsFor(document));
  };

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => {
      refreshDiagnostics(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
    }),
    vscode.languages.registerOnTypeFormattingEditProvider(
      both,
      onTypeProvider,
      "F",
      "f",
      "E",
      "e",
      "T",
      "t",
      " ",
      "\n",
      "%",
      "N",
      "n",
      "O",
      "o"
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      ampscriptSelector,
      documentFormatter
    ),
    vscode.languages.registerCompletionItemProvider(
      both,
      completionProvider,
      "@"
    ),
    vscode.languages.registerHoverProvider(both, hoverProvider),
    vscode.languages.registerSignatureHelpProvider(
      both,
      signatureProvider,
      "(",
      ","
    ),
    vscode.languages.registerDocumentSymbolProvider(both, symbolProvider),
    vscode.languages.registerFoldingRangeProvider(both, foldingProvider)
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnostics(document);
  }
}

function isSupported(document) {
  return (
    document.languageId === "ampscript" || document.languageId === "html"
  );
}

function htmlRegion(document, position) {
  if (document.languageId !== "html") {
    return { embedded: false, region: null, text: document.getText() };
  }

  const text = document.getText();
  const regions = findEmbeddedRegions(text);

  return {
    embedded: true,
    text,
    regions,
    region: regionAt(regions, position.line, position.character, text)
  };
}

const onTypeProvider = {
  provideOnTypeFormattingEdits(document, position, ch, options) {
    if (!isSupported(document)) {
      return [];
    }

    const text = document.getText();
    let desired = null;

    if (document.languageId === "html") {
      desired = desiredIndent(
        text,
        position.line,
        position.character,
        options.tabSize,
        options.insertSpaces
      );
    } else if (ch === "\n") {
      desired = indentForLine(
        text,
        position.line,
        options.tabSize,
        options.insertSpaces
      );
    } else {
      const formatted = formatAmpScriptText(
        text,
        options.tabSize,
        options.insertSpaces
      );
      const formattedLines = formatted.split(/\r?\n/);
      desired = (
        (formattedLines[position.line] || "").match(/^[ \t]*/) || [""]
      )[0];
    }

    if (desired === null) {
      return [];
    }

    const currentLine = document.lineAt(position.line);
    const currentIndent = (
      currentLine.text.match(/^[ \t]*/) || [""]
    )[0];

    if (desired === currentIndent) {
      return [];
    }

    return [
      vscode.TextEdit.replace(
        new vscode.Range(
          position.line,
          0,
          position.line,
          currentIndent.length
        ),
        desired
      )
    ];
  }
};

const documentFormatter = {
  provideDocumentFormattingEdits(document, options) {
    const original = document.getText();
    const formatted = formatAmpScriptText(
      original,
      options.tabSize,
      options.insertSpaces
    );

    if (formatted === original) {
      return [];
    }

    return [
      vscode.TextEdit.replace(
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(original.length)
        ),
        formatted
      )
    ];
  }
};

const completionProvider = {
  provideCompletionItems(document, position) {
    if (!isSupported(document)) {
      return [];
    }

    const fullText = document.getText();
    const located = htmlRegion(document, position);

    if (located.embedded && !located.region) {
      return [];
    }

    const source = located.embedded
      ? sliceOf(fullText, located.region)
      : fullText;
    const relative = located.embedded
      ? relativePosition(
          fullText,
          located.region,
          position.line,
          position.character
        )
      : { line: position.line, character: position.character };

    if (isInsideCommentOrString(source, relative.line, relative.character)) {
      return [];
    }

    const names = collectDeclaredVariables(
      located.embedded ? declaredSource(fullText) : fullText
    );
    const word = document.getWordRangeAtPosition(position, WORD_PATTERN);
    const line = document.lineAt(position.line).text;
    const prefix = variablePrefix(
      line,
      position.character,
      word ? word.start.character : null,
      word ? document.getText(word) : ""
    );
    const range = completionRange(word, prefix.dropAt);

    if (prefix.atAlready) {
      return variableItems(names, {
        atAlready: true,
        range
      });
    }

    const rest = line.slice(position.character);
    const hasCall = /^\s*\(/.test(rest);
    const items = [];

    for (const keyword of KEYWORDS) {
      const kind =
        keyword === "TRUE" || keyword === "FALSE"
          ? vscode.CompletionItemKind.Constant
          : vscode.CompletionItemKind.Keyword;

      items.push(
        completionItem({
          label: keyword,
          kind,
          detail: "AMPscript keyword",
          sortText: `1:${keyword}`,
          range
        })
      );
    }

    for (const entry of catalogue) {
      const item = completionItem({
        label: entry.name,
        kind: vscode.CompletionItemKind.Function,
        detail: entry.summary,
        sortText: `2:${entry.name}`,
        range
      });
      item.documentation = functionDocumentation(entry);

      if (!hasCall) {
        item.insertText = new vscode.SnippetString(`${entry.name}($0)`);
      }

      items.push(item);
    }

    items.push(
      ...variableItems(names, {
        atAlready: false,
        range
      })
    );

    return items;
  }
};

function completionRange(word, dropAt) {
  if (!word) {
    return undefined;
  }

  if (!dropAt) {
    return word;
  }

  return new vscode.Range(
    word.start.line,
    word.start.character + 1,
    word.end.line,
    word.end.character
  );
}

function variableItems(names, { atAlready, range }) {
  return names.map((name) => {
    const text = variableCompletion(name, atAlready);
    const item = completionItem({
      label: text.label,
      kind: vscode.CompletionItemKind.Variable,
      detail: "AMPscript variable",
      sortText: `0:${name}`,
      range
    });

    item.filterText = text.filterText;
    item.insertText = text.insertText;
    return item;
  });
}

function completionItem({ label, kind, detail, sortText, range }) {
  const item = new vscode.CompletionItem(label, kind);
  item.detail = detail;
  item.sortText = sortText;

  if (range) {
    item.range = range;
  }

  return item;
}

function functionDocumentation(entry) {
  const signature = buildSignature(entry);
  const documentation = new vscode.MarkdownString();
  documentation.appendCodeblock(signature.label, "ampscript");
  documentation.appendMarkdown(`\n\n${entry.summary}`);

  if (entry.docs) {
    documentation.appendMarkdown(`\n\n[Documentation](${entry.docs})`);
  }

  return documentation;
}

const hoverProvider = {
  provideHover(document, position) {
    if (!isSupported(document)) {
      return null;
    }

    const located = htmlRegion(document, position);

    if (located.embedded && !located.region) {
      return null;
    }

    const range = document.getWordRangeAtPosition(
      position,
      /[A-Za-z_][A-Za-z0-9_]*/
    );

    if (!range) {
      return null;
    }

    if (
      located.embedded &&
      !wordInsideRegion(document.getText(), located.region, range)
    ) {
      return null;
    }

    const entry = findFunction(document.getText(range));

    if (!entry) {
      return null;
    }

    return new vscode.Hover(functionDocumentation(entry), range);
  }
};

function wordInsideRegion(text, region, range) {
  const start = positionToOffset(text, range.start.line, range.start.character);
  const end = positionToOffset(text, range.end.line, range.end.character);

  return start >= region.startOffset && end <= region.endOffset;
}

const signatureProvider = {
  provideSignatureHelp(document, position) {
    if (!isSupported(document)) {
      return null;
    }

    const fullText = document.getText();
    const located = htmlRegion(document, position);
    let source = fullText;
    let line = position.line;
    let character = position.character;

    if (located.embedded) {
      if (!located.region) {
        return null;
      }

      source = sliceOf(fullText, located.region);
      const relative = relativePosition(
        fullText,
        located.region,
        position.line,
        position.character
      );
      line = relative.line;
      character = relative.character;
    }

    const context = callAtCursor(source, line, character);

    if (!context) {
      return null;
    }

    const entry = findFunction(context.name);

    if (!entry) {
      return null;
    }

    const built = buildSignature(entry);
    const signature = new vscode.SignatureInformation(built.label);
    signature.documentation = new vscode.MarkdownString(entry.summary);
    signature.parameters = built.parameters.map((parameter) => {
      const info = new vscode.ParameterInformation(parameter.label);
      info.documentation = parameter.documentation;
      return info;
    });

    const help = new vscode.SignatureHelp();
    help.signatures = [signature];
    help.activeSignature = 0;
    help.activeParameter =
      signature.parameters.length === 0
        ? 0
        : Math.min(context.commas, signature.parameters.length - 1);

    return help;
  }
};

function diagnosticsFor(document) {
  if (document.languageId === "html") {
    return embeddedProblems(document.getText()).map((problem) => {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          problem.line,
          problem.startCharacter,
          problem.line,
          problem.endCharacter
        ),
        problem.message,
        vscode.DiagnosticSeverity.Error
      );

      diagnostic.source = "ampscript";
      return diagnostic;
    });
  }

  const { problems } = scanAmpScript(document.getText());

  return problems.map((problem) => {
    const line = document.lineAt(problem.line);
    const start = Math.max(0, line.text.search(/\S/));
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(problem.line, start, problem.line, line.text.length),
      problem.message,
      vscode.DiagnosticSeverity.Error
    );

    diagnostic.source = "ampscript";
    return diagnostic;
  });
}

const symbolProvider = {
  provideDocumentSymbols(document) {
    const blocks =
      document.languageId === "html"
        ? embeddedBlocks(document.getText())
        : scanAmpScript(document.getText()).blocks;

    return toSymbols(blocks, document, null);
  }
};

function toSymbols(blocks, document, parentEnd) {
  const lastLine = Math.max(0, document.lineCount - 1);

  return blocks.map((block) => {
    const endLine =
      block.closeLine === null
        ? parentEnd === null
          ? lastLine
          : parentEnd
        : block.closeLine;
    const header = document.lineAt(block.openLine).text;
    const selectionStart = Math.max(0, header.search(/\S/));
    const selectionEnd = Math.max(selectionStart, header.trimEnd().length);
    const symbol = new vscode.DocumentSymbol(
      symbolName(block),
      symbolDetail(block),
      symbolKind(block.type),
      new vscode.Range(
        block.openLine,
        0,
        endLine,
        document.lineAt(endLine).text.length
      ),
      new vscode.Range(
        block.openLine,
        selectionStart,
        block.openLine,
        selectionEnd
      )
    );

    symbol.children = toSymbols(block.children, document, endLine);
    return symbol;
  });
}

function symbolName(block) {
  if (block.type === "AMP_OPEN") {
    return `AMPscript (line ${block.openLine + 1})`;
  }

  return block.header;
}

function symbolDetail(block) {
  if (block.type === "AMP_OPEN") {
    return "block";
  }

  if (block.type === "FOR") {
    return "for";
  }

  return "if";
}

function symbolKind(type) {
  if (type === "AMP_OPEN") {
    return vscode.SymbolKind.Module;
  }

  if (type === "FOR") {
    return vscode.SymbolKind.Function;
  }

  return vscode.SymbolKind.Struct;
}

const foldingProvider = {
  provideFoldingRanges(document) {
    const ranges =
      document.languageId === "html"
        ? embeddedFolds(document.getText())
        : collectFoldingRanges(
            scanAmpScript(document.getText()).blocks,
            document.lineCount
          );

    return ranges.map(
      (range) =>
        new vscode.FoldingRange(
          range.start,
          range.end,
          vscode.FoldingRangeKind.Region
        )
    );
  }
};

function deactivate() {}

module.exports = { activate, deactivate };
