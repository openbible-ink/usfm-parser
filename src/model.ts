/**
 * Bible Document Model v0.1
 *
 * A semantic, presentation-independent representation of a biblical document.
 * USFM is one possible source format, but the model itself is not USFM-specific.
 */

export type NodeId = string;
export type BookCode = string;
export type ScriptureRef = string;
export type EditionId = string;

export interface BibleDocument {
  schema: "bible-ast";
  schemaVersion: "0.1.0";
  /** Identity of this particular parsed document. */
  id: string;
  edition: EditionMetadata;
  book: BookMetadata;
  /** Canon placement is edition/tradition-specific, not intrinsic to a book. */
  canon?: CanonMetadata;
  /**
   * Top-level document flow. Milestones and unwrapped content may occur
   * without an invented block when the source supplies no block marker.
   */
  children: FlowNode[];
  /** Rebuildable navigation data; never the authoritative document structure. */
  indexes?: DocumentIndexes;
  diagnostics?: Diagnostic[];
}

export interface EditionMetadata {
  /** Globally namespaced identifier, e.g. `org.openenglishbible.oeb`. */
  id: EditionId;
  name?: string;
  /** BCP 47 language tag. */
  language?: string;
  abbreviation?: string;
  description?: string;
  revision?: string;
}

export interface BookMetadata {
  /** Standard three-character USFM book code. */
  code: BookCode;
  /** Names supplied by the edition; missing values must not be manufactured. */
  names?: BookNames;
  /** Running-header form, typically derived from `\\h`. */
  header?: string;
  /** Display titles in source order, retaining their hierarchy. */
  titles?: BookTitle[];
}

export interface BookNames {
  /** Long table-of-contents form, typically `\\toc1`. */
  long?: string;
  /** Short table-of-contents form, typically `\\toc2`. */
  short?: string;
  /** Abbreviated form, typically `\\toc3`. */
  abbreviation?: string;
}

export interface BookTitle {
  /** Title hierarchy such as `mt1`, `mt2`, and so on. */
  level: number;
  text: string;
  /** Original semantic/source style where known. */
  style?: string;
}

export interface CanonMetadata {
  /** Opaque identifier for the canonical tradition. */
  id?: string;
  name?: string;
  /** One-based position within the overall canon. */
  position?: number;
  collection?: CanonCollectionMetadata;
}

export interface CanonCollectionMetadata {
  /** Opaque collection identifier, e.g. `new-testament`. */
  id: string;
  name?: string;
  /** One-based position within this collection. */
  position?: number;
}

/**
 * Common data available on every AST node.
 * Extension keys should be globally namespaced, e.g. `org.example.feature`.
 */
export interface BaseNode {
  id: NodeId;
  source?: SourceRange;
  attributes?: Record<string, string>;
  extensions?: Record<string, unknown>;
}

/** Nodes that can participate directly in the document flow. */
export type FlowNode =
  | BlockNode
  | ChapterStartNode
  | VerseStartNode
  | TextNode
  | InlineStyleNode
  | NoteNode
  | UnknownNode;

export interface BlockNode extends BaseNode {
  type: "block";
  /** Semantic source style such as `p`, `q2`, or `s`. */
  style: string;
  children: InlineNode[];
}

export type InlineNode =
  | TextNode
  | VerseStartNode
  | InlineStyleNode
  | NoteNode
  | UnknownNode;

export interface TextNode extends BaseNode {
  type: "text";
  value: string;
}

/** A verse is a milestone, not a container. */
export interface VerseStartNode extends BaseNode {
  type: "verseStart";
  /** String-valued to preserve bridges, suffixes, and unusual versification. */
  number: string;
  /** Normalized canonical address, e.g. `JHN.3.16`. */
  ref: ScriptureRef;
}

/** Marks the point at which a chapter begins. */
export interface ChapterStartNode extends BaseNode {
  type: "chapterStart";
  /** String-valued for consistency and non-integer source identifiers. */
  number: string;
  /** Normalized canonical address, e.g. `JHN.3`. */
  ref: ScriptureRef;
}

export interface InlineStyleNode extends BaseNode {
  type: "inline";
  /** Semantic character style such as `wj`. */
  style: string;
  children: InlineNode[];
}

export interface NoteNode extends BaseNode {
  type: "note";
  /** Note style such as `f` or `x`. */
  style: string;
  caller?: string;
  children: NoteFieldNode[];
}

export interface NoteFieldNode extends BaseNode {
  type: "noteField";
  /** Field style such as `fr`, `ft`, `xo`, or `xt`. */
  style: string;
  children: InlineNode[];
}

/** Forward-compatible semantic representation of an unrecognized construct. */
export interface UnknownNode extends BaseNode {
  type: "unknown";
  marker?: string;
  children?: Array<FlowNode | InlineNode>;
  value?: string;
}

export interface SourcePosition {
  /** Zero-based offset; the parser contract will define byte vs character. */
  offset: number;
  /** One-based line number. */
  line: number;
  /** One-based column number. */
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface DocumentIndexes {
  nodes?: Record<NodeId, NodeIndexEntry>;
  chapters?: Record<ScriptureRef, ChapterIndexEntry>;
  verses?: Record<ScriptureRef, VerseIndexEntry>;
}

export interface NodeIndexEntry {
  nodeId: NodeId;
}

export interface ChapterIndexEntry {
  ref: ScriptureRef;
  startNodeId: NodeId;
  endNodeId?: NodeId;
}

export interface VerseIndexEntry {
  ref: ScriptureRef;
  startNodeId: NodeId;
  /** A verse may cross multiple block nodes. */
  endNodeId?: NodeId;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Machine-readable identifier such as `UNCLOSED_CHARACTER_STYLE`. */
  code: string;
  message: string;
  source?: SourceRange;
  nodeId?: NodeId;
}
