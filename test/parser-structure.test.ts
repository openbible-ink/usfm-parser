import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BlockNode } from "../src/model.js";
import { parseUsfm, serializeCst, tokenizeUsfm } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(name: string): string {
  return readFileSync(resolve(`test/fixtures/${name}`), "utf8");
}

const options = {
  edition: { id: "org.example.fixture", name: "Conformance Fixture", language: "en" },
};

const multipleVersesSource = fixture("02-multiple-verses-one-paragraph.usfm");
assert(serializeCst(tokenizeUsfm(multipleVersesSource)) === multipleVersesSource, "fixture 2 must round-trip exactly through the CST");
const multipleVerses = parseUsfm(multipleVersesSource, options);
assert(multipleVerses.children.length === 2, "fixture 2 must contain one chapter milestone and one paragraph");
const sharedParagraph = multipleVerses.children[1];
assert(sharedParagraph?.type === "block", "fixture 2 must produce a block");
assert(sharedParagraph.children.filter((node) => node.type === "verseStart").length === 2, "a verse marker must not terminate its paragraph");
assert(sharedParagraph.children[0]?.type === "verseStart" && sharedParagraph.children[0].ref === "JHN.1.2", "fixture 2 verse 2 reference is incorrect");
assert(sharedParagraph.children[2]?.type === "verseStart" && sharedParagraph.children[2].ref === "JHN.1.3", "fixture 2 verse 3 reference is incorrect");

const multipleParagraphsSource = fixture("03-one-verse-multiple-paragraphs.usfm");
assert(serializeCst(tokenizeUsfm(multipleParagraphsSource)) === multipleParagraphsSource, "fixture 3 must round-trip exactly through the CST");
const multipleParagraphs = parseUsfm(multipleParagraphsSource, options);
const paragraphs = multipleParagraphs.children.filter((node): node is BlockNode => node.type === "block");
assert(paragraphs.length === 3, "fixture 3 must retain all three explicit paragraphs");
assert(paragraphs[0]?.children[0]?.type === "verseStart" && paragraphs[0].children[0].ref === "JHN.21.15", "verse 15 must begin in the first paragraph");
assert(paragraphs[1]?.children.every((node) => node.type !== "verseStart"), "the second paragraph must continue verse 15 without inventing a milestone");
assert(paragraphs[2]?.children[0]?.type === "inline" && paragraphs[2].children[0].style === "wj", "fixture 3 must retain the words-of-Jesus span");
assert(paragraphs[2]?.children[0]?.type === "inline" && paragraphs[2].children[0].children[0]?.type === "text" && paragraphs[2].children[0].children[0].value === "“Feed my lambs,”", "styled text is incorrect");
assert(paragraphs[2]?.children[1]?.type === "text" && paragraphs[2].children[1].value === " said Jesus.", "text after the closing style must stay outside the inline node");
assert(paragraphs[2]?.children[2]?.type === "verseStart" && paragraphs[2].children[2].ref === "JHN.21.16", "verse 16 must begin in the third paragraph");

const verse15Index = multipleParagraphs.indexes?.verses?.["JHN.21.15"];
assert(verse15Index?.startNodeId === paragraphs[0]?.children[0]?.id, "verse 15 index must point to its milestone");
assert(verse15Index?.endNodeId === paragraphs[2]?.children[1]?.id, "verse 15 index must cross paragraphs and end before verse 16");
assert(!multipleParagraphs.diagnostics, "valid fixture 3 must not produce diagnostics");

console.log("Structural parser fixtures 2 and 3 passed.");
