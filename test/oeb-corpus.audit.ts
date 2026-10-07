import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { FlowNode, InlineNode, NoteFieldNode } from "../src/model.js";
import { parseUsfm, serializeCst, tokenizeUsfm } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function collectUnknown(
  nodes: Array<FlowNode | InlineNode | NoteFieldNode>,
  counts: Map<string, number>,
): void {
  for (const node of nodes) {
    if (node.type === "unknown") increment(counts, node.marker ?? "(missing)");
    if ("children" in node && node.children) collectUnknown(node.children, counts);
  }
}

const corpusPath = resolve("test/corpus/oeb");
const files = readdirSync(corpusPath)
  .filter((name) => name.endsWith(".usfm.db"))
  .sort();

assert(files.length === 60, `expected 60 OEB USFM source files, found ${files.length}`);

const markerCounts = new Map<string, number>();
const unknownCounts = new Map<string, number>();
const diagnosticCounts = new Map<string, number>();
const diagnosticSamples: Array<{ file: string; code: string; message: string; line?: number }> = [];
let parsedDocuments = 0;
let totalCharacters = 0;

for (const file of files) {
  const source = readFileSync(resolve(corpusPath, file), "utf8");
  totalCharacters += source.length;
  const cst = tokenizeUsfm(source);

  assert(serializeCst(cst) === source, `${file}: CST round-trip changed the source`);
  for (const token of cst.children) {
    assert(token.raw === source.slice(token.source.start.offset, token.source.end.offset), `${file}: source range does not select token raw text`);
    if (token.type === "marker") increment(markerCounts, token.marker);
  }

  if (!cst.children.some((token) => token.type === "marker" && token.marker === "id" && !token.closing)) continue;

  const document = parseUsfm(source, {
    edition: { id: "org.openenglishbible.oeb", name: "Open English Bible", language: "en" },
    documentId: `oeb:${file}`,
  });
  parsedDocuments += 1;
  collectUnknown(document.children, unknownCounts);
  for (const diagnostic of document.diagnostics ?? []) {
    increment(diagnosticCounts, diagnostic.code);
    diagnosticSamples.push({
      file,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.source ? { line: diagnostic.source.start.line } : {}),
    });
  }
}

const descending = (entries: Map<string, number>) =>
  [...entries.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

assert(unknownCounts.size === 0, `OEB corpus contains unsupported semantic markers: ${[...unknownCounts.keys()].join(", ")}`);
assert(
  diagnosticSamples.length === 1
    && diagnosticSamples[0]?.file === "40-Matthew.usfm.db"
    && diagnosticSamples[0].code === "UNEXPECTED_CLOSING_MARKER"
    && diagnosticSamples[0].line === 1077,
  `OEB corpus diagnostic baseline changed: ${JSON.stringify(diagnosticSamples)}`,
);

console.log(JSON.stringify({
  files: files.length,
  parsedDocuments,
  totalCharacters,
  markers: descending(markerCounts),
  unknownMarkers: descending(unknownCounts),
  diagnostics: descending(diagnosticCounts),
  diagnosticSamples,
}, null, 2));
