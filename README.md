# USFM Parser

A TypeScript library for parsing USFM scripture documents into a semantic,
presentation-independent Bible document model.

Version 0.1 currently includes the public AST, a lossless tokenizer/CST, and the
first semantic parsing slice for book IDs, chapters, paragraphs, verses, and text.

## Design principles

- The semantic AST represents the document; derived indexes provide convenient navigation.
- Chapter and verse milestones are independent of paragraph, poetry, and heading structure.
- The model preserves source styles without prescribing presentation.
- Unknown constructs and namespaced extensions have explicit escape hatches.
- Source locations, attributes, diagnostics, and stable node identities are first-class concepts.

## Layout

- `src/model.ts` — v0.1 Bible Document Model
- `src/cst.ts` — lossless concrete syntax token types
- `src/tokenize.ts` — tokenizer and exact CST serialization
- `src/transform.ts` — CST-to-semantic-AST transformation
- `src/parse.ts` — high-level parsing entry point
- `src/index.ts` — public package exports
- `test/fixtures` — focused USFM problem scenarios
- `test/expectations` — manually specified semantic ASTs
- `test/model-conformance.test.ts` — schema invariants exercised by the corpus

## Development

```sh
npm install
npm run check
npm run build
npm test
npm run audit:oeb
```

The model-conformance and parser tests exercise the identified problem scenarios
end to end, including overlapping verse/block structure, notes, metadata,
unwrapped content, and character styles that cross block boundaries.

The OEB audit verifies exact CST round trips and source ranges across the full
CC0 corpus, then reports semantic unknown markers and diagnostics by frequency.
