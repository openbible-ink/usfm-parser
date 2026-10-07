import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOeb, parseOebWithProjection } from "../src/oeb/parse.js";
import { mapOebSourceRange, projectOebSource } from "../src/oeb/project.js";
import { parseUsfm } from "../src/parse.js";
import { serializeCst, tokenizeUsfm } from "../src/tokenize.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sample = "Use [us:color|cth:colour], [neut:they|masc:he], and [:base|extra:extra].";
assert(projectOebSource(sample).usfm === "Use color, they, and base.", "default OEB projection is incorrect");
assert(projectOebSource(sample, { spelling: "cth", gender: "masc", swapPunctuation: false }).usfm === "Use colour, he, and base.", "selected OEB projection is incorrect");
assert(projectOebSource("[one,two:A|three:B]", { tags: ["two", "three"] }).usfm === "AB", "all matching branches must be concatenated");
assert(projectOebSource("[one:|two:value]", { tags: ["one"] }).usfm === "", "empty selected branches must be supported");

const mapped = projectOebSource("Before [us:color|cth:colour] after", { spelling: "cth", swapPunctuation: false });
const colourStart = mapped.usfm.indexOf("colour");
const originalColourStart = mapped.original.indexOf("colour");
const mappedRange = mapOebSourceRange(mapped, {
  start: { offset: colourStart, line: 1, column: colourStart + 1 },
  end: { offset: colourStart + 6, line: 1, column: colourStart + 7 },
});
assert(mappedRange.start.offset === originalColourStart && mappedRange.end.offset === originalColourStart + 6, "selected text must map to its original source branch");

const matthewSource = readFileSync(resolve("test/corpus/oeb/40-Matthew.usfm.db"), "utf8");
const matthew = parseOebWithProjection(matthewSource, { variants: { spelling: "cth", gender: "neut" } });
assert(!matthew.document.diagnostics, "OEB projection must resolve the alternative wj closers in Matthew 23:8");
assert(matthew.projection.usfm.includes("brothers and sisters.\\wj*"), "selected Matthew variant is missing");
assert(!matthew.projection.usfm.includes("masc:brothers"), "unselected Matthew variant leaked into projected USFM");

const malformed = parseOeb("\\id TST\n\\c 1\n\\p\n\\v 1 [us:unclosed", { variants: { spelling: "us" } });
assert(malformed.diagnostics?.some((diagnostic) => diagnostic.code === "OEB_UNCLOSED_VARIANT"), "malformed OEB syntax must produce a diagnostic");

const corpusPath = resolve("test/corpus/oeb");
const corpusFiles = readdirSync(corpusPath).filter((name) => name.endsWith(".usfm.db"));
const spellings = ["us", "cth"] as const;
const genders = ["neut", "masc"] as const;
const versifications = ["nrsv", "jps"] as const;
const gehennas = ["gehenna", "pit"] as const;
const ioudaioiSelections = ["ioudaioi", "jew"] as const;
let projections = 0;

for (const spelling of spellings) {
  for (const gender of genders) {
    for (const versification of versifications) {
      for (const gehenna of gehennas) {
        for (const ioudaioi of ioudaioiSelections) {
          for (const file of corpusFiles) {
            const source = readFileSync(resolve(corpusPath, file), "utf8");
            const projection = projectOebSource(source, { spelling, gender, versification, gehenna, ioudaioi });
            assert(projection.diagnostics.length === 0, `${file}: projection diagnostics for ${projection.selectedTags.join(",")}`);
            const cst = tokenizeUsfm(projection.usfm);
            assert(serializeCst(cst) === projection.usfm, `${file}: projected USFM did not round-trip`);
            if (cst.children.some((token) => token.type === "marker" && token.marker === "id" && !token.closing)) {
              const document = parseUsfm(projection.usfm, {
                edition: { id: "org.openenglishbible.oeb", name: "Open English Bible", language: spelling === "cth" ? "en-GB" : "en-US" },
              });
              assert(!document.diagnostics, `${file}: semantic diagnostics for ${projection.selectedTags.join(",")}: ${JSON.stringify(document.diagnostics)}`);
            }
            projections += 1;
          }
        }
      }
    }
  }
}

assert(projections === corpusFiles.length * 32, "every standard OEB variant combination must be tested");
console.log(`OEB variant projection passed for ${projections} corpus projections.`);
