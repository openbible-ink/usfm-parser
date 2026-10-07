import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseUsfm, serializeCst, tokenizeUsfm } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = resolve("test/fixtures/01-basic-prose.usfm");
const source = readFileSync(fixturePath, "utf8");
const cst = tokenizeUsfm(source);

assert(serializeCst(cst) === source, "CST serialization must reproduce the source exactly");
assert(cst.children.every((token) => token.raw === source.slice(token.source.start.offset, token.source.end.offset)), "every CST range must select its raw source");

const document = parseUsfm(source, {
  edition: { id: "org.example.fixture", name: "Conformance Fixture", language: "en" },
  documentId: "fixture-basic-prose",
});

assert(document.book.code === "JHN", "book code must come from the id marker");
assert(document.children.length === 2, "document must contain a chapter milestone and one paragraph");
assert(document.children[0]?.type === "chapterStart" && document.children[0].number === "3", "chapter marker must become chapterStart");

const paragraph = document.children[1];
assert(paragraph?.type === "block" && paragraph.style === "p", "p marker must become a paragraph block");
assert(paragraph.children.length === 4, "paragraph must contain two verse milestones and two text nodes");
assert(paragraph.children[0]?.type === "verseStart" && paragraph.children[0].ref === "JHN.3.1", "first verse reference must be normalized");
assert(paragraph.children[1]?.type === "text" && paragraph.children[1].value === "There was one of the Pharisees.", "first verse text must be preserved semantically");
assert(paragraph.children[2]?.type === "verseStart" && paragraph.children[2].ref === "JHN.3.2", "second verse reference must be normalized");
assert(paragraph.children[3]?.type === "text" && paragraph.children[3].value === "He came to Jesus by night.", "second verse text must be preserved semantically");
assert(!document.diagnostics, "valid basic prose must not produce diagnostics");

console.log("Basic parser vertical slice passed.");
