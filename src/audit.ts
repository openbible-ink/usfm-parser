import type {
  BibleDocument,
  FlowNode,
  InlineNode,
  SourceRange,
} from "./model.js";

export type ScriptureIntegritySeverity = "error" | "warning";

export type ScriptureIntegrityCode =
  | "PARSER_DIAGNOSTIC"
  | "DUPLICATE_CHAPTER"
  | "CHAPTER_ORDER"
  | "CHAPTER_GAP"
  | "VERSE_WITHOUT_CHAPTER"
  | "DUPLICATE_VERSE"
  | "VERSE_ORDER"
  | "VERSE_GAP"
  | "UNUSUAL_VERSE_NUMBER"
  | "EMPTY_VERSE"
  | "ORPHAN_HEADING";

export interface ScriptureIntegrityFinding {
  severity: ScriptureIntegritySeverity;
  code: ScriptureIntegrityCode;
  fingerprint: string;
  message: string;
  bookCode: string;
  chapter?: string;
  verse?: string;
  source?: SourceRange;
  details?: Record<string, string>;
}

export interface ScriptureIntegrityReport {
  findings: ScriptureIntegrityFinding[];
  errors: ScriptureIntegrityFinding[];
  warnings: ScriptureIntegrityFinding[];
  counts: Record<ScriptureIntegrityCode, number>;
}

type AuditEvent =
  | { type: "chapter"; number: string; source?: SourceRange }
  | { type: "verse"; number: string; source?: SourceRange }
  | { type: "text"; value: string }
  | { type: "heading"; style: string; text: string; source?: SourceRange };

const headingStyles = /^(?:s|ms|mr|sr|r|d)(?:\d+)?$/;

function visibleText(nodes: Array<FlowNode | InlineNode>): string {
  let value = "";
  for (const node of nodes) {
    if (node.type === "text") value += node.value;
    else if (node.type === "inline") value += visibleText(node.children);
    else if (node.type === "unknown") {
      value += node.value ?? "";
      if (node.children) value += visibleText(node.children);
    }
  }
  return value.trim();
}

function events(nodes: Array<FlowNode | InlineNode>): AuditEvent[] {
  const result: AuditEvent[] = [];
  for (const node of nodes) {
    if (node.type === "chapterStart") {
      result.push({ type: "chapter", number: node.number, ...(node.source ? { source: node.source } : {}) });
    } else if (node.type === "verseStart") {
      result.push({ type: "verse", number: node.number, ...(node.source ? { source: node.source } : {}) });
    } else if (node.type === "text") {
      result.push({ type: "text", value: node.value });
    } else if (node.type === "block") {
      if (headingStyles.test(node.style)) {
        result.push({ type: "heading", style: node.style, text: visibleText(node.children), ...(node.source ? { source: node.source } : {}) });
      } else {
        result.push(...events(node.children));
      }
    } else if (node.type === "inline") {
      result.push(...events(node.children));
    } else if (node.type === "unknown") {
      if (node.value) result.push({ type: "text", value: node.value });
      if (node.children) result.push(...events(node.children));
    }
    // Notes are deliberately excluded from visible scripture text.
  }
  return result;
}

interface VerseOrdinal { start: number; end: number; suffix?: string }

function verseOrdinal(number: string): VerseOrdinal | null {
  const simple = /^(\d+)([a-z])?$/i.exec(number.trim());
  if (simple) {
    const value = Number(simple[1]);
    return { start: value, end: value, ...(simple[2] ? { suffix: simple[2].toLowerCase() } : {}) };
  }
  const bridge = /^(\d+)-(\d+)$/.exec(number.trim());
  if (bridge) return { start: Number(bridge[1]), end: Number(bridge[2]) };
  return null;
}

export function auditBibleDocument(document: BibleDocument): ScriptureIntegrityReport {
  const bookCode = document.book.code || "UNKNOWN";
  const findings: ScriptureIntegrityFinding[] = [];
  const seenChapters = new Set<string>();
  let chapter: string | undefined;
  let previousChapter: number | undefined;
  let seenVerses = new Set<string>();
  let previousVerse: VerseOrdinal | undefined;
  let currentVerse: { number: string; source?: SourceRange; text: string } | undefined;
  let pendingHeading: Extract<AuditEvent, { type: "heading" }> | undefined;

  const add = (
    severity: ScriptureIntegritySeverity,
    code: ScriptureIntegrityCode,
    message: string,
    options: { chapter?: string; verse?: string; source?: SourceRange; details?: Record<string, string> } = {},
  ): void => {
    const detailsKey = Object.entries(options.details ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(",");
    const fingerprint = [bookCode, code, options.chapter ?? "-", options.verse ?? "-", detailsKey || "-"].join(":");
    findings.push({ severity, code, fingerprint, message, bookCode, ...options });
  };

  const closeVerse = (): void => {
    if (currentVerse && currentVerse.text.trim() === "") {
      add("warning", "EMPTY_VERSE", `Verse ${chapter ?? "?"}:${currentVerse.number} contains no visible scripture text.`, {
        ...(chapter ? { chapter } : {}), verse: currentVerse.number,
        ...(currentVerse.source ? { source: currentVerse.source } : {}),
      });
    }
    currentVerse = undefined;
  };

  for (const diagnostic of document.diagnostics ?? []) {
    if (diagnostic.severity === "info") continue;
    add(diagnostic.severity === "error" ? "error" : "warning", "PARSER_DIAGNOSTIC", diagnostic.message, {
      ...(diagnostic.source ? { source: diagnostic.source } : {}),
      details: { diagnosticCode: diagnostic.code },
    });
  }

  for (const event of events(document.children)) {
    if (event.type === "text") {
      if (currentVerse) currentVerse.text += event.value;
      continue;
    }
    if (event.type === "heading") {
      pendingHeading = event;
      continue;
    }
    if (event.type === "chapter") {
      closeVerse();
      if (pendingHeading) {
        add("warning", "ORPHAN_HEADING", `Heading “${pendingHeading.text || pendingHeading.style}” is followed by a new chapter without scripture text.`, {
          ...(chapter ? { chapter } : {}), ...(pendingHeading.source ? { source: pendingHeading.source } : {}),
          details: { heading: pendingHeading.text || pendingHeading.style, nextChapter: event.number },
        });
      }
      pendingHeading = undefined;
      if (seenChapters.has(event.number)) {
        add("error", "DUPLICATE_CHAPTER", `Chapter ${event.number} occurs more than once.`, { chapter: event.number, ...(event.source ? { source: event.source } : {}) });
      }
      seenChapters.add(event.number);
      const numeric = /^\d+$/.test(event.number) ? Number(event.number) : undefined;
      if (numeric !== undefined && previousChapter !== undefined) {
        if (numeric < previousChapter) add("error", "CHAPTER_ORDER", `Chapter ${event.number} occurs after chapter ${previousChapter}.`, { chapter: event.number, ...(event.source ? { source: event.source } : {}), details: { previous: String(previousChapter) } });
        else if (numeric > previousChapter + 1) add("warning", "CHAPTER_GAP", `Chapter sequence jumps from ${previousChapter} to ${numeric}.`, { chapter: event.number, ...(event.source ? { source: event.source } : {}), details: { previous: String(previousChapter) } });
      }
      if (numeric !== undefined) previousChapter = numeric;
      chapter = event.number;
      seenVerses = new Set<string>();
      previousVerse = undefined;
      continue;
    }
    closeVerse();
    pendingHeading = undefined;
    if (!chapter) add("error", "VERSE_WITHOUT_CHAPTER", `Verse ${event.number} occurs before any chapter marker.`, { verse: event.number, ...(event.source ? { source: event.source } : {}) });
    if (seenVerses.has(event.number)) add("error", "DUPLICATE_VERSE", `Verse ${chapter ?? "?"}:${event.number} occurs more than once.`, { ...(chapter ? { chapter } : {}), verse: event.number, ...(event.source ? { source: event.source } : {}) });
    seenVerses.add(event.number);
    const ordinal = verseOrdinal(event.number);
    if (!ordinal) {
      add("warning", "UNUSUAL_VERSE_NUMBER", `Verse identifier “${event.number}” is not a simple number, suffix, or bridge.`, { ...(chapter ? { chapter } : {}), verse: event.number, ...(event.source ? { source: event.source } : {}) });
    } else if (!ordinal.suffix && previousVerse && !previousVerse.suffix) {
      if (ordinal.start < previousVerse.start) add("warning", "VERSE_ORDER", `Verse ${event.number} occurs after verse ${previousVerse.start}.`, { ...(chapter ? { chapter } : {}), verse: event.number, ...(event.source ? { source: event.source } : {}), details: { previous: String(previousVerse.start) } });
      else if (ordinal.start > previousVerse.end + 1) add("warning", "VERSE_GAP", `Verse sequence jumps from ${previousVerse.end} to ${ordinal.start}.`, { ...(chapter ? { chapter } : {}), verse: event.number, ...(event.source ? { source: event.source } : {}), details: { previous: String(previousVerse.end) } });
    }
    if (ordinal) previousVerse = ordinal;
    currentVerse = { number: event.number, text: "", ...(event.source ? { source: event.source } : {}) };
  }
  closeVerse();

  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const counts = Object.fromEntries(findings.map((finding) => finding.code).filter((code, index, all) => all.indexOf(code) === index).map((code) => [code, findings.filter((finding) => finding.code === code).length])) as Record<ScriptureIntegrityCode, number>;
  return { findings, errors, warnings, counts };
}
