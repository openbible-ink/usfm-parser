import type { CstDocument, CstMarkerToken, CstTextToken } from "./cst.js";
import type { SourcePosition, SourceRange } from "./model.js";

const markerPattern = /^\\(\+?[A-Za-z][A-Za-z0-9-]*)(\*)?/;

/** Tokenize USFM without discarding or normalizing any source bytes. */
export function tokenizeUsfm(source: string): CstDocument {
  const children: Array<CstMarkerToken | CstTextToken> = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  const position = (): SourcePosition => ({ offset, line, column });
  const consume = (raw: string): SourceRange => {
    const start = position();
    for (const character of raw) {
      offset += character.length;
      if (character === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { start, end: position() };
  };

  while (offset < source.length) {
    const match = source.slice(offset).match(markerPattern);
    if (match) {
      const raw = match[0];
      children.push({
        type: "marker",
        marker: match[1]!,
        closing: match[2] === "*",
        raw,
        source: consume(raw),
      });
      continue;
    }

    let end = source.indexOf("\\", offset + 1);
    while (end !== -1 && !markerPattern.test(source.slice(end))) {
      end = source.indexOf("\\", end + 1);
    }
    if (end === -1) end = source.length;

    const raw = source.slice(offset, end);
    children.push({ type: "text", value: raw, raw, source: consume(raw) });
  }

  return { type: "document", source, children };
}

/** Reproduce the source exactly from the lossless CST. */
export function serializeCst(document: CstDocument): string {
  return document.children.map((token) => token.raw).join("");
}
