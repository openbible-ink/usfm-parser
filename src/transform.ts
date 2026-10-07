import type { CstDocument, CstMarkerToken, CstTextToken } from "./cst.js";
import type {
  BibleDocument,
  BlockNode,
  Diagnostic,
  EditionMetadata,
  FlowNode,
  InlineNode,
  InlineStyleNode,
  DocumentIndexes,
  NoteFieldNode,
  NoteNode,
  SourceRange,
} from "./model.js";

export interface TransformOptions {
  edition: EditionMetadata;
  documentId?: string;
  bookCode?: string;
}

interface LinePayload {
  value: string;
  valueStart: number;
  valueEnd: number;
}

function linePayload(token: CstTextToken | undefined): LinePayload {
  if (!token) return { value: "", valueStart: 0, valueEnd: 0 };
  const lineEnd = token.value.search(/\r?\n/);
  const rawLine = lineEnd === -1 ? token.value : token.value.slice(0, lineEnd);
  const leading = rawLine.match(/^\s*/)?.[0].length ?? 0;
  const value = rawLine.slice(leading).replace(/\s+$/, "");
  return { value, valueStart: leading, valueEnd: leading + value.length };
}

function subrange(token: CstTextToken, start: number, end: number): SourceRange {
  const absoluteStart = token.source.start.offset + start;
  const prefix = token.raw.slice(0, start);
  const value = token.raw.slice(start, end);
  const startLineDelta = (prefix.match(/\n/g) ?? []).length;
  const startColumn = startLineDelta === 0
    ? token.source.start.column + start
    : prefix.length - prefix.lastIndexOf("\n");
  const endLineDelta = (value.match(/\n/g) ?? []).length;
  const endColumn = endLineDelta === 0
    ? startColumn + value.length
    : value.length - value.lastIndexOf("\n");
  return {
    start: { offset: absoluteStart, line: token.source.start.line + startLineDelta, column: startColumn },
    end: { offset: token.source.start.offset + end, line: token.source.start.line + startLineDelta + endLineDelta, column: endColumn },
  };
}

/** Convert a lossless CST into the semantic Bible document model. */
export function cstToBibleDocument(cst: CstDocument, options: TransformOptions): BibleDocument {
  let sequence = 0;
  const nextId = (): string => `n_${String(++sequence).padStart(6, "0")}`;
  const children: FlowNode[] = [];
  const diagnostics: Diagnostic[] = [];
  let currentBlock: BlockNode | undefined;
  const inlineStack: Array<{ marker: string; node: InlineStyleNode }> = [];
  let currentNote: NoteNode | undefined;
  let currentNoteField: NoteFieldNode | undefined;
  let currentChapter: string | undefined;
  let bookCode = options.bookCode;
  let bookHeader: string | undefined;
  const bookNames: { long?: string; short?: string; abbreviation?: string } = {};
  const bookTitles: Array<{ level: number; text: string; style?: string }> = [];

  const append = (node: InlineNode | FlowNode): void => {
    const currentInline = inlineStack.at(-1)?.node;
    if (currentInline) currentInline.children.push(node as InlineNode);
    else if (currentNoteField) currentNoteField.children.push(node as InlineNode);
    else if (currentBlock) currentBlock.children.push(node as InlineNode);
    else children.push(node as FlowNode);
  };

  for (let index = 0; index < cst.children.length; index += 1) {
    const token = cst.children[index]!;
    if (token.type === "text") {
      const value = token.value.replace(/\r?\n$/, "");
      if (value.trim().length > 0) {
        append({ id: nextId(), type: "text", value, source: subrange(token, 0, value.length) });
      }
      continue;
    }

    const payloadToken = cst.children[index + 1]?.type === "text"
      ? cst.children[index + 1] as CstTextToken
      : undefined;
    const payload = linePayload(payloadToken);

    if (token.closing) {
      if (inlineStack.at(-1)?.marker === token.marker) {
        inlineStack.pop();
      } else if (currentNote?.style === token.marker) {
        currentNote = undefined;
        currentNoteField = undefined;
        inlineStack.length = 0;
      } else {
        diagnostics.push({ severity: "warning", code: "UNEXPECTED_CLOSING_MARKER", message: `Unexpected closing marker \\${token.marker}*`, source: token.source });
      }
      continue;
    }

    switch (token.marker) {
      case "id": {
        const code = payload.value.split(/\s+/, 1)[0];
        if (code) bookCode = code;
        if (payloadToken) index += 1;
        break;
      }
      case "ide": {
        if (payloadToken) index += 1;
        break;
      }
      case "usfm":
      case "sts": {
        if (payloadToken) index += 1;
        break;
      }
      case "h": {
        bookHeader = payload.value || undefined;
        if (payloadToken) index += 1;
        break;
      }
      case "toc1":
      case "toc2":
      case "toc3": {
        if (token.marker === "toc1") bookNames.long = payload.value;
        if (token.marker === "toc2") bookNames.short = payload.value;
        if (token.marker === "toc3") bookNames.abbreviation = payload.value;
        if (payloadToken) index += 1;
        break;
      }
      case "mt":
      case "mt1":
      case "mt2":
      case "mt3":
      case "mt4": {
        const level = token.marker === "mt" ? 1 : Number(token.marker.slice(2));
        if (payload.value) bookTitles.push({ level, text: payload.value, style: token.marker });
        if (payloadToken) index += 1;
        break;
      }
      case "rem": {
        // Source comments remain losslessly available in the CST but do not
        // become semantic book identity or document-flow content.
        if (payloadToken) index += 1;
        break;
      }
      case "c": {
        currentBlock = undefined;
        inlineStack.length = 0;
        currentNote = undefined;
        currentNoteField = undefined;
        currentChapter = payload.value.split(/\s+/, 1)[0] || "?";
        children.push({ id: nextId(), type: "chapterStart", number: currentChapter, ref: `${bookCode ?? "UNK"}.${currentChapter}`, source: token.source });
        if (payloadToken) index += 1;
        break;
      }
      case "p":
      case "m":
      case "q":
      case "q1":
      case "q2":
      case "q3":
      case "q4":
      case "s":
      case "s1":
      case "s2":
      case "s3":
      case "s4":
      case "b":
      case "ms":
      case "ms2":
      case "d":
      case "pc":
      case "pi":
      case "qm":
      case "qm2":
      case "periph":
      case "nb": {
        const continuations = inlineStack.map(({ marker, node }) => ({ marker, previousNodeId: node.id }));
        inlineStack.length = 0;
        currentNote = undefined;
        currentNoteField = undefined;
        currentBlock = { id: nextId(), type: "block", style: token.marker, children: [], source: token.source };
        children.push(currentBlock);
        for (const continuation of continuations) {
          const inline: InlineStyleNode = {
            id: nextId(),
            type: "inline",
            style: continuation.marker,
            children: [],
            extensions: { "org.bible-ast.continuationOf": continuation.previousNodeId },
          };
          append(inline);
          inlineStack.push({ marker: continuation.marker, node: inline });
        }
        if (payloadToken) {
          if (payload.value) {
            append({ id: nextId(), type: "text", value: payload.value, source: subrange(payloadToken, payload.valueStart, payload.valueEnd) });
          }
          index += 1;
        }
        break;
      }
      case "v": {
        const separator = payload.value.search(/\s/);
        const number = separator === -1 ? payload.value : payload.value.slice(0, separator);
        const content = separator === -1 ? "" : payload.value.slice(separator).replace(/^\s+/, "");
        const ref = `${bookCode ?? "UNK"}.${currentChapter ?? "?"}.${number || "?"}`;
        append({ id: nextId(), type: "verseStart", number: number || "?", ref, source: token.source });
        if (payloadToken) {
          if (content) {
            const contentStart = payloadToken.value.indexOf(content, payload.valueStart);
            append({ id: nextId(), type: "text", value: content, source: subrange(payloadToken, contentStart, contentStart + content.length) });
          }
          index += 1;
        }
        break;
      }
      case "wj":
      case "nd":
      case "+nd":
      case "qs":
      case "em": {
        const inline: InlineStyleNode = { id: nextId(), type: "inline", style: token.marker, children: [], source: token.source };
        append(inline);
        inlineStack.push({ marker: token.marker, node: inline });
        if (payloadToken) {
          if (payload.value) {
            append({ id: nextId(), type: "text", value: payload.value, source: subrange(payloadToken, payload.valueStart, payload.valueEnd) });
          }
          index += 1;
        }
        break;
      }
      case "f":
      case "x": {
        const note: NoteNode = {
          id: nextId(),
          type: "note",
          style: token.marker,
          ...(payload.value ? { caller: payload.value } : {}),
          children: [],
          source: token.source,
        };
        append(note);
        currentNote = note;
        currentNoteField = undefined;
        inlineStack.length = 0;
        if (payloadToken) index += 1;
        break;
      }
      case "fr":
      case "ft":
      case "fq":
      case "fk":
      case "xo":
      case "xt": {
        if (!currentNote) {
          diagnostics.push({ severity: "warning", code: "NOTE_FIELD_OUTSIDE_NOTE", message: `Note field \\${token.marker} occurs outside a note`, source: token.source });
          if (payloadToken) index += 1;
          break;
        }
        currentNoteField = { id: nextId(), type: "noteField", style: token.marker, children: [], source: token.source };
        currentNote.children.push(currentNoteField);
        inlineStack.length = 0;
        if (payloadToken) {
          if (payload.value) {
            currentNoteField.children.push({ id: nextId(), type: "text", value: payload.value, source: subrange(payloadToken, payload.valueStart, payload.valueEnd) });
          }
          index += 1;
        }
        break;
      }
      default: {
        append({
          id: nextId(),
          type: "unknown",
          marker: token.marker,
          source: token.source,
          ...(payload.value ? { value: payload.value } : {}),
        });
        if (payloadToken) index += 1;
      }
    }
  }

  if (!bookCode) {
    bookCode = "UNK";
    diagnostics.push({ severity: "error", code: "MISSING_BOOK_CODE", message: "No \\id marker or fallback book code was supplied." });
  }

  for (const unclosed of inlineStack) {
    diagnostics.push({
      severity: "warning",
      code: "UNCLOSED_CHARACTER_STYLE",
      message: `Unclosed character style \\${unclosed.marker}`,
      nodeId: unclosed.node.id,
      ...(unclosed.node.source ? { source: unclosed.node.source } : {}),
    });
  }
  if (currentNote) {
    diagnostics.push({
      severity: "warning",
      code: "UNCLOSED_NOTE",
      message: `Unclosed note \\${currentNote.style}`,
      nodeId: currentNote.id,
      ...(currentNote.source ? { source: currentNote.source } : {}),
    });
  }

  const indexes = buildIndexes(children);

  return {
    schema: "bible-ast",
    schemaVersion: "0.1.0",
    id: options.documentId ?? `${options.edition.id}.${bookCode}`,
    edition: options.edition,
    book: {
      code: bookCode,
      ...(bookHeader ? { header: bookHeader } : {}),
      ...(Object.keys(bookNames).length > 0 ? { names: bookNames } : {}),
      ...(bookTitles.length > 0 ? { titles: bookTitles } : {}),
    },
    children,
    indexes,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function buildIndexes(children: FlowNode[]): DocumentIndexes {
  const nodes: NonNullable<DocumentIndexes["nodes"]> = {};
  const chapters: NonNullable<DocumentIndexes["chapters"]> = {};
  const verses: NonNullable<DocumentIndexes["verses"]> = {};
  let activeChapter: string | undefined;
  let activeVerse: string | undefined;
  let previousNodeId: string | undefined;

  const visit = (node: FlowNode | InlineNode): void => {
    if (node.type === "chapterStart") {
      if (activeChapter && previousNodeId) chapters[activeChapter]!.endNodeId = previousNodeId;
      activeChapter = node.ref;
      chapters[node.ref] = { ref: node.ref, startNodeId: node.id };
    }
    if (node.type === "verseStart") {
      if (activeVerse && previousNodeId) verses[activeVerse]!.endNodeId = previousNodeId;
      activeVerse = node.ref;
      verses[node.ref] = { ref: node.ref, startNodeId: node.id };
    }

    nodes[node.id] = { nodeId: node.id };
    const isContainer = "children" in node && Boolean(node.children);
    if (!isContainer) previousNodeId = node.id;

    if ("children" in node && node.children) {
      for (const child of node.children) {
        if (child.type === "noteField") {
          nodes[child.id] = { nodeId: child.id };
          for (const grandchild of child.children) visit(grandchild);
        } else {
          visit(child as InlineNode);
        }
      }
    }
  };

  for (const child of children) visit(child);
  if (activeVerse && previousNodeId) verses[activeVerse]!.endNodeId = previousNodeId;
  if (activeChapter && previousNodeId) chapters[activeChapter]!.endNodeId = previousNodeId;

  return { nodes, chapters, verses };
}
