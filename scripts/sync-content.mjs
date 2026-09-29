#!/usr/bin/env node
// Copies invai-docs' help center and legal drafts into invai-web/src/content so the web app
// builds on its own (T-21-5 AC1). `--check` compares the committed copies against the sibling
// invai-docs repo instead of overwriting them, and fails (exit 1) on drift -- the drift check the
// architect's plan review required (A1), since nothing else re-runs `sync:content` when
// docs-writer or compliance-officer edit their markdown after this card ships.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const docsRoot = join(webRoot, "..", "invai-docs");
const contentRoot = join(webRoot, "src", "content");
const check = process.argv.includes("--check");

// [destination under src/content, source directory in invai-docs], one pair per language.
const SOURCES = [
  ["help/en", join(docsRoot, "help", "en")],
  ["help/es", join(docsRoot, "help", "es")],
  ["legal/en", join(docsRoot, "legal")], // English legal drafts live at the repo root, not legal/en.
  ["legal/es", join(docsRoot, "legal", "es")],
];

if (!existsSync(docsRoot)) {
  console.log(
    `sync-content: invai-docs isn't checked out next to invai-web (looked at ${docsRoot}) -- skipping. ` +
      "Run this from a workspace with the sibling repos present, e.g. after `pnpm sync:content` in the full checkout.",
  );
  process.exit(0);
}

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

let drift = false;
for (const [dest, srcDir] of SOURCES) {
  const destDir = join(contentRoot, dest);
  const srcFiles = listMarkdown(srcDir);
  const destFiles = check ? listMarkdown(destDir) : [];

  if (check) {
    const srcSet = new Set(srcFiles);
    const destSet = new Set(destFiles);
    for (const f of srcFiles) {
      if (!destSet.has(f)) {
        console.error(`check:content: ${dest}/${f} is in invai-docs but missing from src/content`);
        drift = true;
        continue;
      }
      const a = hash(readFileSync(join(srcDir, f), "utf8"));
      const b = hash(readFileSync(join(destDir, f), "utf8"));
      if (a !== b) {
        console.error(`check:content: ${dest}/${f} differs from invai-docs -- run \`pnpm sync:content\``);
        drift = true;
      }
    }
    for (const f of destFiles) {
      if (!srcSet.has(f)) {
        console.error(`check:content: ${dest}/${f} is committed but no longer exists in invai-docs`);
        drift = true;
      }
    }
    continue;
  }

  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  for (const f of srcFiles) {
    cpSync(join(srcDir, f), join(destDir, f));
  }
  console.log(`sync-content: copied ${srcFiles.length} file(s) into src/content/${dest}`);
}

if (check && drift) {
  console.error(
    "\ncheck:content failed: src/content is out of date. Run `pnpm sync:content` in invai-web, review the " +
      "diff, and commit it (docs-writer and compliance-officer ask for this through a web card after they edit help/legal content).",
  );
  process.exit(1);
}
