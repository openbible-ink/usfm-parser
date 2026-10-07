import type { BibleDocument } from "./model.js";
import { tokenizeUsfm } from "./tokenize.js";
import { cstToBibleDocument, type TransformOptions } from "./transform.js";

/** Parse USFM into the v0.1 semantic Bible document model. */
export function parseUsfm(source: string, options: TransformOptions): BibleDocument {
  return cstToBibleDocument(tokenizeUsfm(source), options);
}
