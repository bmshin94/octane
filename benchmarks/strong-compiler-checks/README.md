# Strong compiler checks: paired compiler audit

This standalone Node harness compares a frozen Octane baseline with a candidate
checkout using the same installed dependencies. It measures production **client
compilation time**, including parsing, analysis, lowering, and printing. It does
not measure rendering, hydration, SSR duration, or runtime memory.

## Run

```bash
node benchmarks/strong-compiler-checks/run.mjs \
  --baseline /path/to/baseline-snapshot \
  --baseline-revision <full-commit-sha> \
  --output /tmp/strong-compiler-checks.json
```

The candidate defaults to the checkout containing the harness. `--candidate`
selects another checkout. The baseline must contain `packages/octane/src` and
`packages/octane/package.json` from the chosen immutable revision. Link its root
and Octane package `node_modules` to the candidate's installed dependencies. The
harness rejects different dependency resolutions.

Use `--smoke` to validate the harness with one component and one sample. This is
not performance evidence. `--counts 100`, `--scenario normal`, `--iterations 17`,
and `--warmups 3` narrow or override a full run. A positional iteration count is
also supported. `BENCH_JSON` supplies the output path if `--output` is absent.

This audit requires an external baseline checkout, so it runs directly instead
of registering an unattended CI suite. Its JSON includes the benchmark runner's
`targets`, `ops`, and `failed` fields alongside the paired measurements.

## Workloads and controls

- **Normal:** state, a derived scalar, an effect, and an event handler per component.
- **Ambient:** legal browser reads in lazy state initialization, effects, and events.
- **Alias-heavy:** the same legal reads reached through module-level aliases.

Each workload contains 100 and 1,000 exported components and runs with Strong
enabled and in compatibility mode. The legal controls intentionally retain
identical compiler output across this PR. Every warmup and timed sample must
produce the exact same client JavaScript; a separate server compile must also
match byte for byte. Empty output or diagnostics fail the run. Client/server
byte counts and SHA-256 hashes are recorded. The new automatic memoization
identity and lifecycle behavior is validated by regression tests separately.

Each case has three warmup pairs, then 17 measured pairs at 100 components or
11 at 1,000. Pair order alternates baseline/candidate and candidate/baseline.
Only compilation is timed; parity checks and hashing occur outside the timed
interval. Both compilers share a Node process and installed dependencies, so
these are warm compiler measurements with shared parser/JIT/GC effects.

The JSON retains raw samples, median, p95, min/max, and each pair's candidate /
baseline ratio. Ratios above one indicate slower candidate compilation. It also
records the command, Node/V8/OS/CPU, revisions, source hashes, and dependency
resolution hashes. A source or dependency change during measurement fails the
run. Review sample variability and the compatibility controls before attributing
a timing change to Strong analysis. With 11 or 17 samples, the reported p95 is
the largest sample; it is a variability indicator rather than a stable tail
latency estimate. The median of pairwise ratios can differ from the ratio of
the two separate medians.

## PR measurements

Rerun after the hook-dependency review fixes on 14 September 2026
(Europe/London), with Node v26.4.0, V8 14.6.202.34-node.21,
Apple M5 Max, and Darwin 25.6.0 arm64.
Broad tests and typechecks were idle during this run.

- Immutable baseline: `8e5ca22a6e17582b4293232406a2c0420509f4a4`.
- Candidate: the PR working tree based on
  `6699e4c866076a04f4f6c3dfccced8e7cf2db55a`, including the review fixes;
  aggregate source SHA-256
  `7228a2d19dab42cf828053ff7649f57a90a4b756bd774b034e754400b78d0548`.
- All source and dependency hashes stayed stable throughout the measurement.
- [Raw samples, command, environment, and per-file hashes](./results-2026-09-14.json).

### Strong mode

| Workload | Components | Baseline median ms | Candidate median ms | Baseline p95 ms | Candidate p95 ms | Paired median ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| normal | 100 | 41.21 | 47.00 | 57.64 | 59.33 | 1.132 |
| normal | 1,000 | 403.61 | 461.78 | 438.48 | 543.61 | 1.123 |
| ambient | 100 | 35.95 | 40.60 | 50.54 | 58.93 | 1.160 |
| ambient | 1,000 | 393.00 | 450.55 | 483.47 | 484.95 | 1.177 |
| alias-heavy | 100 | 38.21 | 43.64 | 53.04 | 65.39 | 1.156 |
| alias-heavy | 1,000 | 413.60 | 477.31 | 443.71 | 495.85 | 1.159 |

### Compatibility controls

| Workload | Components | Baseline median ms | Candidate median ms | Baseline p95 ms | Candidate p95 ms | Paired median ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| normal | 100 | 36.67 | 37.22 | 53.62 | 52.30 | 1.016 |
| normal | 1,000 | 391.09 | 402.42 | 410.99 | 436.33 | 1.073 |
| ambient | 100 | 35.23 | 33.86 | 54.83 | 51.06 | 0.977 |
| ambient | 1,000 | 369.95 | 368.62 | 383.04 | 383.44 | 1.021 |
| alias-heavy | 100 | 35.57 | 37.04 | 53.53 | 53.71 | 1.009 |
| alias-heavy | 1,000 | 416.65 | 416.22 | 463.45 | 441.53 | 0.970 |

Strong paired median ratios range from **1.123 to 1.177**
(**12.3–17.7%** additional
compilation time). Compatibility controls range from **0.970 to
1.073**. The controls support attributing additional work to Strong
compilation, while individual-sample variation and the compatibility spread
limit precision. These numbers are compiler costs on the stated synthetic
workloads, not runtime speed changes or a general application build-time budget.

All **24 client/server output comparisons** matched byte for byte and by SHA-256.
Across the six fixture sizes, client output spans 80,742–908,043 bytes and server
output spans 37,718–450,977 bytes; Strong and compatibility controls emit the
same bytes in both revisions. The harness also rejected a deliberate compiler
output mutation with a nonzero exit and a failed JSON report before this run.

This run measures warm client compilation. Cold startup, server compilation
time, type checking, renderer targets other than DOM, bundler integration cost,
and runtime allocations or render/hydration duration are outside its scope.
