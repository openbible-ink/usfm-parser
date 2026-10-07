import type { SourcePosition, SourceRange } from "../model.js";

export type OebSpelling = "us" | "cth";
export type OebGender = "neut" | "masc";
export type OebVersification = "nrsv" | "jps";
export type OebGehenna = "gehenna" | "pit";
export type OebIoudaioi = "ioudaioi" | "jew";

export interface OebVariantOptions {
  spelling?: OebSpelling;
  gender?: OebGender;
  versification?: OebVersification;
  gehenna?: OebGehenna;
  ioudaioi?: OebIoudaioi;
  /** Additional project-specific tags such as `heb` or `meaning_of_names`. */
  tags?: readonly string[];
  /** Defaults to true for Commonwealth spelling, matching upstream builds. */
  swapPunctuation?: boolean;
  /** Match the upstream tool's straight-apostrophe normalization. Defaults true. */
  normalizeApostrophes?: boolean;
}

export interface OebSourceMapSegment {
  projectedStart: number;
  projectedEnd: number;
  originalStart: number;
  originalEnd: number;
  kind: "copied" | "selected";
  tags?: string[];
}

export interface OebProjectionDiagnostic {
  severity: "warning" | "error";
  code: "OEB_UNCLOSED_VARIANT" | "OEB_INVALID_VARIANT";
  message: string;
  source: SourceRange;
}

export interface OebProjection {
  original: string;
  usfm: string;
  selectedTags: string[];
  sourceMap: OebSourceMapSegment[];
  diagnostics: OebProjectionDiagnostic[];
}

export const DEFAULT_OEB_VARIANTS = {
  spelling: "us",
  gender: "neut",
  versification: "nrsv",
  gehenna: "gehenna",
  ioudaioi: "ioudaioi",
} as const satisfies Required<Pick<OebVariantOptions, "spelling" | "gender" | "versification" | "gehenna" | "ioudaioi">>;

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function positionAt(starts: number[], offset: number): SourcePosition {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle]! <= offset) low = middle;
    else high = middle;
  }
  return { offset, line: low + 1, column: offset - starts[low]! + 1 };
}

function sourceRange(starts: number[], start: number, end: number): SourceRange {
  return { start: positionAt(starts, start), end: positionAt(starts, end) };
}

function selectedTags(options: OebVariantOptions): string[] {
  return [...new Set([
    "base",
    options.spelling ?? DEFAULT_OEB_VARIANTS.spelling,
    options.gender ?? DEFAULT_OEB_VARIANTS.gender,
    options.versification ?? DEFAULT_OEB_VARIANTS.versification,
    options.gehenna ?? DEFAULT_OEB_VARIANTS.gehenna,
    options.ioudaioi ?? DEFAULT_OEB_VARIANTS.ioudaioi,
    ...(options.tags ?? []),
  ])];
}

function applyTypography(value: string, options: OebVariantOptions): string {
  const swap = options.swapPunctuation ?? (options.spelling === "cth");
  let result = value;
  if (swap) {
    const replacements: Record<string, string> = { "“": "‘", "”": "’", "‘": "“", "’": "”" };
    result = [...result].map((character) => replacements[character] ?? character).join("");
  }
  if (options.normalizeApostrophes ?? true) result = result.replaceAll("'", "’");
  return result;
}

/** Project tagged OEB alternatives into ordinary USFM. */
export function projectOebSource(source: string, options: OebVariantOptions = {}): OebProjection {
  const chosen = selectedTags(options);
  const chosenSet = new Set(chosen);
  const starts = lineStarts(source);
  const sourceMap: OebSourceMapSegment[] = [];
  const diagnostics: OebProjectionDiagnostic[] = [];
  const output: string[] = [];
  let projectedOffset = 0;
  let cursor = 0;

  const append = (value: string, originalStart: number, kind: OebSourceMapSegment["kind"], tags?: string[]): void => {
    if (!value) return;
    output.push(value);
    sourceMap.push({
      projectedStart: projectedOffset,
      projectedEnd: projectedOffset + value.length,
      originalStart,
      originalEnd: originalStart + value.length,
      kind,
      ...(tags ? { tags } : {}),
    });
    projectedOffset += value.length;
  };

  while (cursor < source.length) {
    const open = source.indexOf("[", cursor);
    if (open === -1) {
      append(source.slice(cursor), cursor, "copied");
      break;
    }
    append(source.slice(cursor, open), cursor, "copied");

    const close = source.indexOf("]", open + 1);
    if (close === -1) {
      diagnostics.push({
        severity: "error",
        code: "OEB_UNCLOSED_VARIANT",
        message: "Unclosed OEB variant expression",
        source: sourceRange(starts, open, source.length),
      });
      append(source.slice(open), open, "copied");
      break;
    }

    const body = source.slice(open + 1, close);
    const rawOptions = body.split("|");
    let optionOffset = open + 1;
    const parsed = rawOptions.map((rawOption) => {
      const colon = rawOption.indexOf(":");
      if (colon === -1) {
        optionOffset += rawOption.length + 1;
        return undefined;
      }
      const rawTags = rawOption.slice(0, colon);
      const tags = rawTags === "" ? ["base"] : rawTags.split(",").map((tag) => tag.trim());
      const value = rawOption.slice(colon + 1);
      const valueStart = optionOffset + colon + 1;
      optionOffset += rawOption.length + 1;
      return { tags, value, valueStart };
    });

    if (parsed.some((option) => option === undefined)) {
      diagnostics.push({
        severity: "error",
        code: "OEB_INVALID_VARIANT",
        message: "Every OEB variant branch must contain a tag followed by a colon",
        source: sourceRange(starts, open, close + 1),
      });
      append(source.slice(open, close + 1), open, "copied");
    } else {
      for (const option of parsed) {
        if (option && option.tags.some((tag) => chosenSet.has(tag))) {
          append(option.value, option.valueStart, "selected", option.tags);
        }
      }
    }
    cursor = close + 1;
  }

  return {
    original: source,
    usfm: applyTypography(output.join(""), options),
    selectedTags: chosen,
    sourceMap,
    diagnostics,
  };
}

function mapOffset(projection: OebProjection, offset: number, endBias: boolean): number {
  if (projection.sourceMap.length === 0) return 0;
  const segment = projection.sourceMap.find((candidate) => endBias
    ? candidate.projectedStart < offset && offset <= candidate.projectedEnd
    : candidate.projectedStart <= offset && offset < candidate.projectedEnd);
  if (segment) return segment.originalStart + (offset - segment.projectedStart);
  if (offset === 0) return projection.sourceMap[0]!.originalStart;
  return projection.sourceMap.at(-1)!.originalEnd;
}

/** Map a range in projected USFM back to the original OEB source. */
export function mapOebSourceRange(projection: OebProjection, range: SourceRange): SourceRange {
  const starts = lineStarts(projection.original);
  const start = mapOffset(projection, range.start.offset, false);
  const end = mapOffset(projection, range.end.offset, true);
  return sourceRange(starts, start, end);
}
