type CoverageTotals = {
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
};

const DEFAULT_MIN_LINE = 39;
const DEFAULT_MIN_BRANCH = 59;

const args = new Map<string, string>();
for (const arg of Deno.args) {
  const [key, value] = arg.split("=");
  if (key && value) args.set(key, value);
}

const minLine = Number(args.get("--min-line") ?? DEFAULT_MIN_LINE);
const minBranch = Number(args.get("--min-branch") ?? DEFAULT_MIN_BRANCH);

if (!Number.isFinite(minLine) || !Number.isFinite(minBranch)) {
  throw new Error("Coverage thresholds must be numeric.");
}

const candidates = ["coverage.lcov", "coverage/lcov.info"];
let lcovPath: string | null = null;
for (const candidate of candidates) {
  try {
    const stat = await Deno.stat(candidate);
    if (stat.isFile) {
      lcovPath = candidate;
      break;
    }
  } catch {
    // Ignore missing file and try next.
  }
}

if (!lcovPath) {
  throw new Error(
    "No LCOV file found. Run `deno task test:cov` (and coverage:lcov) first.",
  );
}

const lcov = await Deno.readTextFile(lcovPath);

const totals: CoverageTotals = {
  linesFound: 0,
  linesHit: 0,
  branchesFound: 0,
  branchesHit: 0,
};

for (const line of lcov.split("\n")) {
  if (line.startsWith("LF:")) {
    totals.linesFound += Number(line.slice(3));
  } else if (line.startsWith("LH:")) {
    totals.linesHit += Number(line.slice(3));
  } else if (line.startsWith("BRF:")) {
    totals.branchesFound += Number(line.slice(4));
  } else if (line.startsWith("BRH:")) {
    totals.branchesHit += Number(line.slice(4));
  }
}

const pct = (hit: number, found: number) =>
  found === 0 ? 100 : (hit / found) * 100;

const linePct = pct(totals.linesHit, totals.linesFound);
const branchPct = pct(totals.branchesHit, totals.branchesFound);

const formatPct = (value: number) => Math.round(value * 10) / 10;

const lineOk = linePct + 1e-9 >= minLine;
const branchOk = branchPct + 1e-9 >= minBranch;

const summary = [
  `Line coverage: ${formatPct(linePct)}% (min ${minLine}%)`,
  `Branch coverage: ${formatPct(branchPct)}% (min ${minBranch}%)`,
].join("\n");

if (!lineOk || !branchOk) {
  throw new Error(`Coverage below threshold.\n${summary}`);
}

console.log(summary);
