import type { BaseNode, BibleDocument, FlowNode, InlineNode, NoteFieldNode } from "../src/model.js";
import { cases } from "./expectations/cases.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function childrenOf(node: FlowNode | InlineNode | NoteFieldNode): Array<FlowNode | InlineNode | NoteFieldNode> {
  if (!("children" in node) || !node.children) return [];
  return node.children;
}

function flatten(document: BibleDocument): Array<FlowNode | InlineNode | NoteFieldNode> {
  const result: Array<FlowNode | InlineNode | NoteFieldNode> = [];
  const visit = (node: FlowNode | InlineNode | NoteFieldNode): void => {
    result.push(node);
    for (const child of childrenOf(node)) visit(child);
  };
  for (const child of document.children) visit(child);
  return result;
}

for (const testCase of cases) {
  const nodes = flatten(testCase.document);
  const types = nodes.map((node) => node.type);
  assert(JSON.stringify(types) === JSON.stringify(testCase.expectedNodeTypes), `${testCase.name}: unexpected node structure`);

  const ids = nodes.map((node: BaseNode) => node.id);
  assert(new Set(ids).size === ids.length, `${testCase.name}: node IDs must be unique`);
  assert(testCase.document.schema === "bible-ast", `${testCase.name}: schema identifier changed`);
  assert(testCase.document.schemaVersion === "0.1.0", `${testCase.name}: schema version changed`);
}

const spanningVerse = cases.find((testCase) => testCase.fixture === "03-one-verse-multiple-paragraphs.usfm");
assert(spanningVerse?.document.indexes?.verses?.["JHN.21.15"]?.endNodeId === "mb-t3", "verse index must span block boundaries");

const punctuation = cases.find((testCase) => testCase.fixture === "08-footnote-punctuation.usfm");
const punctuationNodes = punctuation ? flatten(punctuation.document) : [];
const finalPunctuationNode = punctuationNodes.at(-1);
assert(finalPunctuationNode?.type === "text" && finalPunctuationNode.value === ".", "punctuation must remain outside the note");

const unwrapped = cases.find((testCase) => testCase.fixture === "12-unwrapped-flow.usfm");
assert(unwrapped?.document.children.at(-1)?.type === "text", "flow-level text must be representable without an implicit block");

console.log(`Model conformance passed for ${cases.length} scenarios.`);
