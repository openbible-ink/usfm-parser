import type { SourceRange } from "./model.js";

export interface CstDocument {
  type: "document";
  /** Original source retained to make the lossless contract explicit. */
  source: string;
  children: CstToken[];
}

export type CstToken = CstMarkerToken | CstTextToken;

export interface CstMarkerToken {
  type: "marker";
  /** Marker name without the leading backslash or closing asterisk. */
  marker: string;
  closing: boolean;
  raw: string;
  source: SourceRange;
}

export interface CstTextToken {
  type: "text";
  value: string;
  raw: string;
  source: SourceRange;
}
