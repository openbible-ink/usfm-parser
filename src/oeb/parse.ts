import type { BibleDocument, EditionMetadata, FlowNode, InlineNode, NoteFieldNode } from "../model.js";
import { parseUsfm } from "../parse.js";
import { mapOebSourceRange, projectOebSource, type OebProjection, type OebVariantOptions } from "./project.js";

export interface ParseOebOptions {
  edition?: EditionMetadata;
  documentId?: string;
  bookCode?: string;
  variants?: OebVariantOptions;
}

export interface OebParseResult {
  document: BibleDocument;
  projection: OebProjection;
}

function remapNodeSources(projection: OebProjection, nodes: Array<FlowNode | InlineNode | NoteFieldNode>): void {
  for (const node of nodes) {
    if (node.source) node.source = mapOebSourceRange(projection, node.source);
    if ("children" in node && node.children) remapNodeSources(projection, node.children);
  }
}

export function parseOebWithProjection(source: string, options: ParseOebOptions = {}): OebParseResult {
  const projection = projectOebSource(source, options.variants);
  const document = parseUsfm(projection.usfm, {
    edition: options.edition ?? {
      id: "org.openenglishbible.oeb",
      name: "Open English Bible",
      language: options.variants?.spelling === "cth" ? "en-GB" : "en-US",
    },
    ...(options.documentId ? { documentId: options.documentId } : {}),
    ...(options.bookCode ? { bookCode: options.bookCode } : {}),
  });

  remapNodeSources(projection, document.children);
  if (document.diagnostics) {
    for (const diagnostic of document.diagnostics) {
      if (diagnostic.source) diagnostic.source = mapOebSourceRange(projection, diagnostic.source);
    }
  }
  if (projection.diagnostics.length > 0) {
    document.diagnostics = [
      ...(document.diagnostics ?? []),
      ...projection.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        source: diagnostic.source,
      })),
    ];
  }

  return { document, projection };
}

/** Project OEB variants and parse the resulting USFM semantic document. */
export function parseOeb(source: string, options: ParseOebOptions = {}): BibleDocument {
  return parseOebWithProjection(source, options).document;
}
