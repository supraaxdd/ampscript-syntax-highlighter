# Changelog

Versions follow semver and live in `package.json`. That number is what a VS Code package and the marketplace use.

Bump it with `npm run version:patch` for a fix, `npm run version:minor` for a feature, or `npm run version:prerelease` for a development build. A development build keeps the numbers and adds a `-dev` tag, for example `0.1.1-dev.0`. A deployment build has no tag. These commands update `package.json` only; they do not create a git commit.

## 0.1.1

### Fixed

- Accepting a variable completion after `@` no longer inserts a second `@`. Suggestions that appear before an `@` is typed still insert one.

## 0.1.0

First development baseline. `0.0.1` was only a placeholder.

### Added

- Formatting for `%%[ ]%%`, `IF` / `ELSE` / `ENDIF`, and `FOR` / `NEXT`, including format-on-type.
- Snippets for a block, `VAR`, `SET`, `IF`, `IF` / `ELSE`, and `FOR`.
- Completion for keywords, built-in functions, and `@` variables declared in the file.
- Diagnostics, outline, and folding for AMPscript blocks.
- Hover and signature help driven by the function catalogue, including `CloudPagesURL`, `EncryptSymmetric`, and `DecryptSymmetric`.
- `npm` scripts that bump the package version.

### Fixed

- The extension activates when an AMPscript file is opened, so formatting and the other editor features run outside the development host.
- An `IF` or `FOR` header may continue onto the next lines. `THEN` and `DO` on their own line align with the opener.
- Typing `[` inside `%%[` no longer inserts a stray `]`. The block delimiters close each other.
- Each `%%[` block in the outline includes its line number.
- `WHILE` is not offered as a keyword. AMPscript has no `WHILE` loop.
