#!/usr/bin/env node
/**
 * scripts/migrate-js-to-ts.js
 *
 * Incrementally converts remaining JavaScript files in the runtime source tree
 * to TypeScript. The conversion is conservative and idempotent:
 *
 *   - Each .js file is migrated at most once per branch. A .ts file that
 *     already exists alongside a .js of the same basename is treated as
 *     "done" and skipped.
 *   - Converted files start with a `// @ts-nocheck` pragma so they type-check
 *     even when the surrounding code is still being migrated. Removing the
 *     pragma is the follow-up work for human reviewers.
 *   - require() is left inline (we still target CommonJS via tsconfig.json).
 *     Switching the runtime to ESM-style import is out of scope for the
 *     automated pass.
 *   - Only files under a configurable target glob are considered. The default
 *     is the `services` directory.
 *
 * The script writes a JSON report describing the candidates it inspected,
 * the files it converted, and the files it skipped (with a reason).
 *
 * Usage:
 *   node scripts/migrate-js-to-ts.js                  # default target, dry-run
 *   node scripts/migrate-js-to-ts.js --write          # actually convert
 *   node scripts/migrate-js-to-ts.js --target services/paperlessService.js
 *   node scripts/migrate-js-to-ts.js --report-out out.json
 *
 * The GitHub Actions workflow `.github/workflows/typescript-migration.yml`
 * drives this script on a schedule and opens a draft pull request with the
 * converted files.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TARGET = 'services/**/*.js';
const DEFAULT_REPORT = 'migration-report.json';

// Default exclusion list. These files are intentionally not migrated by the
// automated pass because they are bootstrap code, build scripts, or have
// CommonJS / dynamic-require patterns that the script cannot safely rewrite.
const DEFAULT_EXCLUDES = new Set([
  'server.js', // entry point; migrated manually because it owns the runtime wiring
  'schemas.js', // shared schema definitions; migrated as part of the API lock
  'ecosystem.config.js', // PM2 process definition
  'eslint.config.mjs', // build-time config (ESM)
  'swagger.js', // JSDoc-driven spec; migration depends on final REST shape
]);

/** Parse a minimal subset of CLI flags. */
function parseArgs(argv) {
  const args = {
    target: DEFAULT_TARGET,
    reportOut: DEFAULT_REPORT,
    write: false,
    excludes: DEFAULT_EXCLUDES,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--target':
      case '-t':
        args.target = argv[++i];
        break;
      case '--report-out':
        args.reportOut = argv[++i];
        break;
      case '--write':
        args.write = true;
        break;
      case '--no-write':
        args.write = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith('--exclude=')) {
          args.excludes.add(a.slice('--exclude='.length));
        } else {
          console.error(`Unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  return args;
}

function printHelp() {
  console.log(
    [
      'migrate-js-to-ts.js — incremental JS → TS converter',
      '',
      'Options:',
      '  --target <glob>      Glob of files to consider (default: services/**/*.js)',
      '  --report-out <path>  Where to write the migration report (default: migration-report.json)',
      '  --write              Write converted .ts files next to the originals (default: dry-run)',
      '  --no-write           Force dry-run even if --write was set earlier',
      '  --exclude=<file>     Add a file (relative to repo root) to the exclude set',
      '  -h, --help           Print this help',
    ].join('\n')
  );
}

/** Minimal glob matcher: only `**` and `*` are supported, with a literal prefix. */
function matchGlob(filePath, pattern) {
  // Normalize to forward slashes for matching
  const fp = filePath.split(path.sep).join('/');
  const pat = pattern.split(path.sep).join('/');
  // First replace `**` with a sentinel, then `*` with a single-segment regex,
  // then the sentinel with the multi-segment regex. Order matters: escaping
  // has to happen before the `*` substitutions so the escapes do not leak.
  const re = new RegExp(
    '^' +
      pat
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DOUBLESTAR::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DOUBLESTAR::/g, '.*') +
      '$'
  );
  return re.test(fp);
}

/** Recursively list .js files under a directory, relative to the repo root. */
function listJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      acc.push(path.relative(REPO_ROOT, full));
    }
  }
  return acc;
}

/** Resolve a list of glob patterns into a deduplicated, sorted file list. */
function resolveTarget(target) {
  // For now we only resolve `**` and `*` patterns that point at directories we
  // can walk. Anything else is treated as a literal file path.
  if (target.includes('*')) {
    // Extract the longest literal prefix that ends at a path separator.
    const firstStar = target.indexOf('*');
    const prefix = target.slice(0, firstStar).replace(/\*+$/, '');
    const baseDir = path.resolve(REPO_ROOT, prefix);
    const all = listJsFiles(baseDir);
    return all.filter((f) => matchGlob(f, target)).sort();
  }
  return [target];
}

/**
 * Convert a single .js source into a .ts source.
 * The transformation is intentionally simple:
 *   - Prepend `// @ts-nocheck` so the file type-checks during the migration.
 *   - Leave the body alone. Subsequent PRs add types per-file.
 */
function convertSource(source) {
  const pragma = '// @ts-nocheck — auto-converted by scripts/migrate-js-to-ts.js.\n';
  if (source.startsWith(pragma)) return source;
  // Strip a leading "use strict"; we still rely on the existing module style.
  const stripped = source.replace(/^\s*['"]use strict['"];?\s*\n/, '');
  return `${pragma}${stripped}`;
}

/** Build the destination .ts path next to a .js source. */
function tsPath(jsRel) {
  return jsRel.replace(/\.js$/, '.ts');
}

/** Decide whether a file should be skipped, and why. Returns null to convert. */
function skipReason(jsRel) {
  const base = path.basename(jsRel);
  if (DEFAULT_EXCLUDES.has(jsRel) || DEFAULT_EXCLUDES.has(base)) {
    return 'in default exclude list';
  }
  const ts = path.join(REPO_ROOT, tsPath(jsRel));
  if (fs.existsSync(ts)) {
    return 'a .ts sibling already exists';
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const candidates = resolveTarget(args.target);

  const converted = [];
  const skipped = [];
  const errors = [];

  for (const rel of candidates) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      skipped.push({ file: rel, reason: 'file does not exist' });
      continue;
    }
    const reason = skipReason(rel);
    if (reason) {
      skipped.push({ file: rel, reason });
      continue;
    }

    try {
      const original = fs.readFileSync(abs, 'utf8');
      const next = convertSource(original);
      if (args.write) {
        fs.writeFileSync(path.join(REPO_ROOT, tsPath(rel)), next, 'utf8');
      }
      converted.push(rel);
    } catch (err) {
      errors.push({ file: rel, message: err && err.message ? err.message : String(err) });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    target: args.target,
    write: args.write,
    candidates: candidates.length,
    converted: converted.sort(),
    skipped: skipped.sort((a, b) => a.file.localeCompare(b.file)),
    errors,
  };

  if (args.reportOut) {
    const reportPath = path.isAbsolute(args.reportOut)
      ? args.reportOut
      : path.join(REPO_ROOT, args.reportOut);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }

  // Short human summary on stdout.
  console.log(
    [
      `migrate-js-to-ts:`,
      `  candidates=${report.candidates}`,
      `  converted=${report.converted.length}`,
      `  skipped=${report.skipped.length}`,
      `  errors=${report.errors.length}`,
      `  write=${report.write}`,
      `  report=${args.reportOut}`,
    ].join('\n')
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  convertSource,
  matchGlob,
  parseArgs,
  resolveTarget,
  skipReason,
};
