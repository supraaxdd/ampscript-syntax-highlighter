const vscode = require("vscode");
const { formatAmpScriptText } = require("./ampFormatting");
const {
  scanAmpScript,
  collectFoldingRanges,
  collectDeclaredVariables,
  isInsideCommentOrString
} = require("./ampStructure");
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
  const selector = { language: "ampscript" };
  const diagnostics = vscode.languages.createDiagnosticCollection("ampscript");

  const refreshDiagnostics = (document) => {
    if (document.languageId !== "ampscript") {
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
      selector,
      onTypeProvider,
      "F",
      "f",
      "E",
      "e",
      "T",
      "t",
      " "
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      selector,
      documentFormatter
    ),
    vscode.languages.registerCompletionItemProvider(
      selector,
      completionProvider,
      "@"
    ),
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerSignatureHelpProvider(
      selector,
      signatureProvider,
      "(",
      ","
    ),
    vscode.languages.registerDocumentSymbolProvider(
      selector,
      symbolProvider
    ),
    vscode.languages.registerFoldingRangeProvider(selector, foldingProvider)
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnostics(document);
  }
}

const onTypeProvider = {
  provideOnTypeFormattingEdits(document, position, ch, options) {
    if (document.languageId !== "ampscript") {
      return [];
    }

    // Only format after a space, when a statement or keyword is more likely
    // to be complete. Avoid reformatting while the user types individual letters.
    if (ch !== " ") return [];

    const text = document.getText();
    const formatted = formatAmpScriptText(
      text,
      options.tabSize,
      options.insertSpaces
    );

    const formattedLines = formatted.split(/\r?\n/);
    const currentLine = document.lineAt(position.line);
    const desiredIndent = (
      formattedLines[position.line].match(/^[ \t]*/) || [""]
    )[0];
    const currentIndent = (
      currentLine.text.match(/^[ \t]*/) || [""]
    )[0];

    if (desiredIndent === currentIndent) {
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
        desiredIndent
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
    const text = document.getText();

    if (
      isInsideCommentOrString(text, position.line, position.character)
    ) {
      return [];
    }

    const word = document.getWordRangeAtPosition(position, WORD_PATTERN);
    const line = document.lineAt(position.line).text;
    const prefix = variablePrefix(
      line,
      position.character,
      word ? word.start.character : null,
      word ? document.getText(word) : ""
    );
    const range = completionRange(word, prefix.dropAt);
    const items = [];

    if (prefix.atAlready) {
      return variableItems(collectDeclaredVariables(text), {
        atAlready: true,
        range
      });
    }

    const rest = line.slice(position.character);
    const hasCall = /^\s*\(/.test(rest);

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
      ...variableItems(collectDeclaredVariables(text), {
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
    const range = document.getWordRangeAtPosition(
      position,
      /[A-Za-z_][A-Za-z0-9_]*/
    );

    if (!range) {
      return null;
    }

    const entry = findFunction(document.getText(range));

    if (!entry) {
      return null;
    }

    return new vscode.Hover(functionDocumentation(entry), range);
  }
};

const signatureProvider = {
  provideSignatureHelp(document, position) {
    const context = callAtCursor(
      document.getText(),
      position.line,
      position.character
    );

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
    const { blocks } = scanAmpScript(document.getText());
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
    const { blocks } = scanAmpScript(document.getText());
    const ranges = collectFoldingRanges(blocks, document.lineCount);

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
