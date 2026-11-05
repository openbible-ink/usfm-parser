import { auditBibleDocument, parseUsfm } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const document = parseUsfm(String.raw`\id TST
\c 1
\p \v 1 One.
\p \v 3 Three.
\p \v 3 Three again.
\p \v 4
\s Stranded heading
\c 3
\p \v odd Unusual.
`, {
  edition: { id: "org.example.audit" },
  documentId: "audit-fixture",
});

const report = auditBibleDocument(document);
const codes = new Set(report.findings.map((finding) => finding.code));

assert(codes.has("VERSE_GAP"), "detects missing verse numbers");
assert(codes.has("DUPLICATE_VERSE"), "detects duplicate verse markers");
assert(codes.has("EMPTY_VERSE"), "detects verses without visible scripture text");
assert(codes.has("ORPHAN_HEADING"), "detects headings stranded before a new chapter");
assert(codes.has("CHAPTER_GAP"), "detects missing chapter numbers");
assert(codes.has("UNUSUAL_VERSE_NUMBER"), "detects unusual verse identifiers");
assert(report.errors.some((finding) => finding.code === "DUPLICATE_VERSE"), "duplicates are blocking errors");
assert(report.findings.every((finding) => finding.fingerprint.startsWith("TST:")), "findings have stable book-scoped fingerprints");

console.log("Scripture integrity audit passed.");
