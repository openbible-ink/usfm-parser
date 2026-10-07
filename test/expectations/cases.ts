import type {
  BibleDocument,
  BlockNode,
  FlowNode,
  InlineNode,
  NoteNode,
} from "../../src/model.js";

export interface ConformanceCase {
  name: string;
  fixture: string;
  document: BibleDocument;
  expectedNodeTypes: string[];
}

const text = (id: string, value: string) =>
  ({ id, type: "text", value }) as const;
const verse = (id: string, chapter: string, number: string) =>
  ({ id, type: "verseStart", number, ref: `JHN.${chapter}.${number}` }) as const;
const chapter = (id: string, number: string) =>
  ({ id, type: "chapterStart", number, ref: `JHN.${number}` }) as const;
const block = (id: string, style: string, children: InlineNode[]): BlockNode => ({
  id,
  type: "block",
  style,
  children,
});
const inline = (id: string, style: string, children: InlineNode[]) => ({
  id,
  type: "inline" as const,
  style,
  children,
});
const note = (id: string, ref: string, body: string): NoteNode => ({
  id,
  type: "note",
  style: "f",
  caller: "+",
  children: [
    { id: `${id}-fr`, type: "noteField", style: "fr", children: [text(`${id}-fr-t`, ref)] },
    { id: `${id}-ft`, type: "noteField", style: "ft", children: [text(`${id}-ft-t`, body)] },
  ],
});

const document = (
  id: string,
  children: FlowNode[],
  overrides: Partial<Pick<BibleDocument, "book" | "canon" | "indexes">> = {},
): BibleDocument => ({
  schema: "bible-ast",
  schemaVersion: "0.1.0",
  id,
  edition: { id: "org.example.fixture", name: "Conformance Fixture", language: "en" },
  book: { code: "JHN" },
  children,
  ...overrides,
});

export const cases: ConformanceCase[] = [
  {
    name: "ordinary prose",
    fixture: "01-basic-prose.usfm",
    document: document("basic", [
      chapter("basic-c", "3"),
      block("basic-p", "p", [verse("basic-v1", "3", "1"), text("basic-t1", "There was one of the Pharisees."), verse("basic-v2", "3", "2"), text("basic-t2", "He came to Jesus by night.")]),
    ]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "verseStart", "text"],
  },
  {
    name: "multiple verses remain in one paragraph",
    fixture: "02-multiple-verses-one-paragraph.usfm",
    document: document("multi-verses", [
      chapter("mv-c", "1"),
      block("mv-p", "p", [verse("mv-v2", "1", "2"), text("mv-t2", "He was in the beginning with God;"), verse("mv-v3", "1", "3"), text("mv-t3", "through him all things came into being.")]),
    ]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "verseStart", "text"],
  },
  {
    name: "one verse spans multiple paragraphs",
    fixture: "03-one-verse-multiple-paragraphs.usfm",
    document: document("multi-block", [
      chapter("mb-c", "21"),
      block("mb-p1", "p", [verse("mb-v15", "21", "15"), text("mb-t1", "When breakfast was over, Jesus said to Simon Peter,")]),
      block("mb-p2", "p", [text("mb-t2", "“Yes, Master,” he answered.")]),
      block("mb-p3", "p", [inline("mb-wj", "wj", [text("mb-wj-t", "“Feed my lambs,”")]), text("mb-t3", " said Jesus."), verse("mb-v16", "21", "16"), text("mb-t4", "Then, a second time, Jesus asked him.")]),
    ], { indexes: { verses: { "JHN.21.15": { ref: "JHN.21.15", startNodeId: "mb-v15", endNodeId: "mb-t3" } } } }),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "block", "text", "block", "inline", "text", "text", "verseStart", "text"],
  },
  {
    name: "poetry structure remains independent of verses",
    fixture: "04-poetry.usfm",
    document: document("poetry", [chapter("po-c", "1"), block("po-q1", "q", [verse("po-v1", "1", "1"), text("po-t1", "In the beginning the Word was;")]), block("po-q2", "q2", [text("po-t2", "and the Word was with God;")]), block("po-q3", "q2", [text("po-t3", "and the Word was God.")]), block("po-m", "m", []), block("po-q4", "q", [verse("po-v2", "1", "2"), text("po-t4", "He was in the beginning with God;")]), block("po-empty", "q2", []), verse("po-v3", "1", "3"), text("po-t5", "through him all things came into being.")]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "block", "text", "block", "text", "block", "block", "verseStart", "text", "block", "verseStart", "text"],
  },
  {
    name: "inline character style",
    fixture: "05-inline-style.usfm",
    document: document("inline", [chapter("in-c", "3"), block("in-p", "p", [verse("in-v", "3", "10"), text("in-t1", "Jesus answered, "), inline("in-wj", "wj", [text("in-wj-t", "“Are you the teacher of Israel?”")])])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "inline", "text"],
  },
  {
    name: "multiple styled spans alternate with text",
    fixture: "06-multiple-style-spans.usfm",
    document: document("styles", [chapter("st-c", "16"), block("st-p", "p", [verse("st-v", "16", "17"), text("st-t1", "At this some disciples said, "), inline("st-wj1", "wj", [text("st-wj1-t", "‘In a little while’;" )]), text("st-t2", " and by saying "), inline("st-wj2", "wj", [text("st-wj2-t", "‘Because I am going to the Father’?")])])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "inline", "text", "text", "inline", "text"],
  },
  {
    name: "structured footnote fields",
    fixture: "07-structured-footnote.usfm",
    document: document("note", [chapter("nt-c", "5"), block("nt-p", "p", [verse("nt-v", "5", "4"), note("nt-f", "5:4", "Some later manuscripts add this verse.")])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "note", "noteField", "text", "noteField", "text"],
  },
  {
    name: "punctuation remains outside footnote",
    fixture: "08-footnote-punctuation.usfm",
    document: document("punctuation", [chapter("pu-c", "8"), block("pu-p", "p", [verse("pu-v", "8", "1"), text("pu-t1", "except Jesus, who went to the Mount of Olives"), note("pu-f", "8:1", "This passage is absent from some manuscripts."), text("pu-dot", ".")])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "note", "noteField", "text", "noteField", "text", "text"],
  },
  {
    name: "book names and display titles remain distinct",
    fixture: "09-metadata.usfm",
    document: document("metadata", [], { book: { code: "JHN", header: "John", names: { long: "The Gospel According to John", short: "John", abbreviation: "Jhn" }, titles: [{ level: 1, style: "mt", text: "The Good News According to" }, { level: 2, style: "mt2", text: "JOHN" }] }, canon: { id: "protestant", position: 43, collection: { id: "new-testament", position: 4 } } }),
    expectedNodeTypes: [],
  },
  {
    name: "edition-specific syntax remains ordinary text",
    fixture: "10-extension-text.usfm",
    document: document("extension", [chapter("ex-c", "1"), block("ex-p", "p", [verse("ex-v", "1", "1"), text("ex-t", "[us:honor|cth:honour] and [neut:humanity|masc:Man]")])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text"],
  },
  {
    name: "combined structural torture case",
    fixture: "11-combined-torture.usfm",
    document: document("combined", [chapter("co-c", "17"), block("co-p", "p", [verse("co-v1", "17", "1"), text("co-t1", "After saying this, Jesus raised his eyes heavenwards, and said:")]), block("co-q", "q", [inline("co-wj1", "wj", [text("co-wj1-t", "“Father, the hour has come;"), verse("co-v2", "17", "2"), text("co-wj2-t", "even as you gave him power over all humanity.”")])])]),
    expectedNodeTypes: ["chapterStart", "block", "verseStart", "text", "block", "inline", "text", "verseStart", "text"],
  },
  {
    name: "unwrapped verse content does not require an invented block",
    fixture: "12-unwrapped-flow.usfm",
    document: document("unwrapped", [chapter("uw-c", "5"), verse("uw-v", "5", "1"), text("uw-t", "Text without an explicit paragraph marker.")]),
    expectedNodeTypes: ["chapterStart", "verseStart", "text"],
  },
];
