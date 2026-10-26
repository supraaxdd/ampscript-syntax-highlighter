# AMPscript Highlighter

Editing tools for Salesforce Marketing Cloud AMPscript in VS Code.

The extension highlights AMPscript, formats it as you type, and offers completion, hovers, signature help, diagnostics, folding, and an outline.

## AMPscript files

Open a `.amp` or `.ampscript` file. The language mode is AMPscript.

```ampscript
%%[
VAR @name
SET @name = "Ada"
IF EMPTY(@name) THEN
    SET @name = "friend"
ENDIF
]%%
```

Snippets are available from the prefixes `amp`, `var`, `set`, `if`, `ifelse`, and `for`.

## AMPscript inside HTML

In an HTML file, the same tools run inside `%%[ ]%%` blocks and `%%= =%%` expressions. The HTML around those regions is left to the HTML editor.

```html
<h1>Hello, %%=v(@firstName)=%%</h1>

%%[ IF @orderTotal >= 200 THEN ]%%
<p>You qualify for a special offer.</p>
%%[ ELSE ]%%
<p>Explore our latest offers.</p>
%%[ ENDIF ]%%
```

An `IF` / `ELSE` / `ENDIF` or `FOR` / `NEXT` split across several `%%[ ]%%` blocks is treated as one block. Text outside the delimiters, including text in an HTML comment, is not read as AMPscript.

## What you get

- Highlighting for keywords, functions, variables, strings, and comments.
- Format on type for `%%[ ]%%`, `IF` / `ELSE` / `ENDIF`, and `FOR` / `NEXT`. HTML files keep their own document formatter.
- Completion for keywords, catalogue functions, and `@` variables declared with `VAR`, `SET`, or `FOR`. Accepting a suggestion after you have already typed `@` does not insert a second `@`.
- Hover and signature help for catalogue functions.
- Diagnostics when a block is left open or a closer has no match.
- Folding and an outline for each AMPscript block.

## Requirements

VS Code 1.85 or later.

## License

[MIT](LICENSE)
