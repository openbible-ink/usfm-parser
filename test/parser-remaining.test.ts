import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BlockNode, FlowNode, InlineNode, NoteFieldNode } from "../src/model.js";
import { parseUsfm, serializeCst, tokenizeUsfm } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const options = { edition: { id: "org.example.fixture", name: "Conformance Fixture", language: "en" } };

function parseFixture(name: string) {
  const source = readFileSync(resolve(`test/fixtures/${name}`), "utf8");
  const cst = tokenizeUsfm(source);
  assert(serializeCst(cst) === source, `${name}: CST round-trip changed the source`);
  assert(cst.children.every((token) => token.raw === source.slice(token.source.start.offset, token.source.end.offset)), `${name}: a CST source range is incorrect`);
  const document = parseUsfm(source, options);
  assert(!document.diagnostics, `${name}: valid input produced diagnostics`);
  return { source, cst, document };
}

function blocks(children: FlowNode[]): BlockNode[] {
  return children.filter((node): node is BlockNode => node.type === "block");
}

function flatten(nodes: Array<FlowNode | InlineNode | NoteFieldNode>): Array<FlowNode | InlineNode | NoteFieldNode> {
  const result: Array<FlowNode | InlineNode | NoteFieldNode> = [];
  for (const node of nodes) {
    result.push(node);
    if ("children" in node && node.children) result.push(...flatten(node.children));
  }
  return result;
}

const poetry = parseFixture("04-poetry.usfm").document;
const poetryBlocks = blocks(poetry.children);
assert(poetryBlocks.map((node) => node.style).join(",") === "q,q2,q2,m,q,q2", "fixture 4: poetry block sequence changed");
assert(poetryBlocks[3]?.children.length === 0, "fixture 4: empty m block must be preserved");
assert(poetryBlocks[5]?.children[0]?.type === "verseStart" && poetryBlocks[5].children[0].ref === "JHN.1.3", "fixture 4: verse 3 must belong to the final q2 block");
assert(poetry.indexes?.verses?.["JHN.1.1"]?.endNodeId === poetryBlocks[2]?.children[0]?.id, "fixture 4: verse 1 must span its three poetry lines");

const inline = parseFixture("05-inline-style.usfm").document;
const inlineNodes = flatten(inline.children);
const wordsOfJesus = inlineNodes.find((node) => node.type === "inline");
assert(wordsOfJesus?.type === "inline" && wordsOfJesus.style === "wj", "fixture 5: wj span was not created");
assert(wordsOfJesus.children[0]?.type === "text" && wordsOfJesus.children[0].value === "“Are you the teacher of Israel?”", "fixture 5: styled text changed");

const styles = parseFixture("06-multiple-style-spans.usfm").document;
const styledNodes = flatten(styles.children).filter((node) => node.type === "inline");
assert(styledNodes.length === 2, "fixture 6: two independent wj spans are required");
const styleParagraph = blocks(styles.children)[0]!;
assert(styleParagraph.children.map((node) => node.type).join(",") === "verseStart,text,inline,text,inline", "fixture 6: styled and unstyled content order changed");

const structuredNote = parseFixture("07-structured-footnote.usfm").document;
const noteNode = flatten(structuredNote.children).find((node) => node.type === "note");
assert(noteNode?.type === "note" && noteNode.style === "f" && noteNode.caller === "+", "fixture 7: footnote caller or style is incorrect");
assert(noteNode.children.map((field) => field.style).join(",") === "fr,ft", "fixture 7: footnote field structure changed");
assert(noteNode.children[0]?.children[0]?.type === "text" && noteNode.children[0].children[0].value === "5:4", "fixture 7: footnote reference changed");

const punctuation = parseFixture("08-footnote-punctuation.usfm").document;
const punctuationParagraph = blocks(punctuation.children)[0]!;
const punctuationTail = punctuationParagraph.children.at(-1);
assert(punctuationTail?.type === "text" && punctuationTail.value === ".", "fixture 8: punctuation must remain outside the footnote");

const metadataResult = parseFixture("09-metadata.usfm");
const metadata = metadataResult.document.book;
assert(metadata.header === "John", "fixture 9: running header is incorrect");
assert(metadata.names?.long === "The Gospel According to John" && metadata.names.short === "John" && metadata.names.abbreviation === "Jhn", "fixture 9: book names are incorrect");
assert(metadata.titles?.map((title) => `${title.level}:${title.text}`).join("|") === "1:The Good News According to|2:JOHN", "fixture 9: display titles are incorrect");
assert(metadataResult.cst.children.some((token) => token.type === "marker" && token.marker === "rem"), "fixture 9: rem marker must survive in the CST");
assert(metadataResult.document.children.length === 0, "fixture 9: source metadata must not become document-flow content");

const extension = parseFixture("10-extension-text.usfm").document;
const extensionText = flatten(extension.children).find((node) => node.type === "text");
assert(extensionText?.type === "text" && extensionText.value === "[us:honor|cth:honour] and [neut:humanity|masc:Man]", "fixture 10: edition-specific syntax must remain ordinary text");

const combined = parseFixture("11-combined-torture.usfm").document;
const combinedBlocks = blocks(combined.children);
assert(combinedBlocks.map((node) => node.style).join(",") === "p,q", "fixture 11: paragraph-to-poetry transition changed");
const combinedInline = combinedBlocks[1]?.children[0];
assert(combinedInline?.type === "inline" && combinedInline.style === "wj", "fixture 11: poetry must retain the wj span");
assert(combinedInline.children.some((node) => node.type === "verseStart" && node.ref === "JHN.17.2"), "fixture 11: verse 2 milestone must remain inside the continuing wj span");

const unwrapped = parseFixture("12-unwrapped-flow.usfm").document;
assert(unwrapped.children.map((node) => node.type).join(",") === "chapterStart,verseStart,text", "fixture 12: unwrapped content must remain at flow level");
assert(!unwrapped.children.some((node) => node.type === "block"), "fixture 12: parser must not invent a block");

const crossingStyle = parseFixture("13-style-crosses-block.usfm").document;
const crossingBlocks = blocks(crossingStyle.children);
assert(crossingBlocks.length === 2, "fixture 13: both poetry blocks must be retained");
const originalEmphasis = crossingBlocks[0]?.children[0];
const continuedEmphasis = crossingBlocks[1]?.children[0];
assert(originalEmphasis?.type === "inline" && originalEmphasis.style === "em", "fixture 13: emphasis must begin in the first block");
assert(continuedEmphasis?.type === "inline" && continuedEmphasis.style === "em", "fixture 13: emphasis must continue in the second block");
assert(continuedEmphasis.extensions?.["org.bible-ast.continuationOf"] === originalEmphasis.id, "fixture 13: split spans must be explicitly linked");
assert(!crossingStyle.diagnostics, "fixture 13: a valid cross-block style must not produce diagnostics");

const attributedWords = parseFixture("14-word-attributes.usfm").document;
const attributedBlock = blocks(attributedWords.children)[0];
assert(attributedBlock, "fixture 14: paragraph must be retained");
const word = attributedBlock.children.find((node) => node.type === "inline" && node.style === "w");
assert(word?.type === "inline", "fixture 14: word marker must become an inline node");
assert(word.attributes?.strong === "G1722", "fixture 14: Strong's number must be retained as an attribute");
assert(word.children[0]?.type === "text" && word.children[0].value === "In", "fixture 14: attributes must not leak into rendered word text");
const allText = JSON.stringify(attributedWords.children);
assert(!allText.includes("strong=\\\""), "fixture 14: serialized semantic content must not contain raw word attributes");
assert(allText.includes("יהוה"), "fixture 14: nested Hebrew word text inside a footnote must be retained");
const attributedText = attributedBlock.children
  .flatMap((node) => node.type === "inline" ? node.children : [node])
  .filter((node) => node.type === "text")
  .map((node) => node.value)
  .join("");
assert(attributedText.includes("In the beginning."), "fixture 14: whitespace between attributed words must remain semantic text");
assert(!attributedWords.diagnostics, "fixture 14: supported word attributes must not produce diagnostics");

const inlineWhitespace = parseUsfm(`\\id JOS
\\c 1
\\p
\\v 1 servant of the \\nd Lord\\nd*, the Lord said.
\\p Before the \\nd Lord\\nd* all people stood.
`, options);
const whitespaceBlocks = blocks(inlineWhitespace.children);
const verseLeadingText = whitespaceBlocks[0]?.children[1];
const paragraphLeadingText = whitespaceBlocks[1]?.children[0];
assert(verseLeadingText?.type === "text" && verseLeadingText.value === "servant of the ", "inline whitespace: a verse payload must retain its space before an inline marker");
assert(paragraphLeadingText?.type === "text" && paragraphLeadingText.value === "Before the ", "inline whitespace: a paragraph payload must retain its space before an inline marker");
assert(whitespaceBlocks[0]?.children[2]?.type === "inline" && whitespaceBlocks[0].children[2].style === "nd", "inline whitespace: the divine-name span must remain structured");

console.log("Parser fixtures 4 through 14 passed.");
