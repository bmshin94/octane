# View Transition parity performance evidence

Measured on 2026-09-14 against main
`277c10c3fa80f56ef162959832dba35c1b43b32e` and merged candidate
`7cd542853722ba38ff520507b9608b5eafb83d82`.
[Raw measurements](./measurements.json) retain source, fixture, lockfile and
bundle hashes, semantic observations, and tool versions.

Environment: macOS arm64, Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71, Playwright 1.61.1. Each variant uses the same
authored fixtures, dependency installation and production settings. The bundle
runner verifies that source and fixture hashes remain unchanged during its run.

## Production bundle cost

| Fixture | Raw baseline | Raw candidate | Raw delta | Gzip baseline | Gzip candidate | Gzip delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ordinary static root | 164,612 B | 168,036 B | +3,424 B | 52,777 B | 53,726 B | +949 B |
| Ordinary stateful root | 172,768 B | 176,238 B | +3,470 B | 55,662 B | 56,658 B | +996 B |
| Active transition fixture | 261,689 B | 309,326 B | +47,637 B | 74,311 B | 86,143 B | +11,832 B |

Both ordinary bundles exclude the optional transition driver and `DOMStage`
adapter. Shared rendering hooks still add approximately 1 KB gzip; optional
reachability does not imply zero shared code cost. The active bundle includes
the full browser fixture, observation code and controls, so it is not a minimal
framework import size.

## Deterministic browser work

| Scenario and observation | Baseline | Candidate |
| --- | ---: | ---: |
| Static root: rectangle / computed-style / native capture calls | 0 / 0 / 0 | 0 / 0 / 0 |
| Stateful root: rectangle / computed-style / native capture calls | 0 / 0 / 0 | 0 / 0 / 0 |
| Four active updates: rectangle reads | 4 | 8 |
| Four active updates: computed-style reads | 8 | 28 |
| Four active updates: native captures | 4 | 4 |

The active workload preserves its uncontrolled input and draft, renders the
expected text, and completes four actual native animations. A clean minified
pass and an instrumented readable production pass have identical semantic
observations. Instrumentation delegates every call to the browser. The style
counts include the fixture's public pseudo-element observations, including
methods newly supported by the candidate; they are not framework-only counts.

The registered benchmark passes all 13 ratio guards: ordinary driver/adapter
absence and zero browser work, one native capture per completed update, and the
measured active read budgets. The repeated candidate run reproduced every byte
and operation count exactly.

```sh
BENCH_JSON=/tmp/vt-baseline.json node benchmarks/view-transitions/bundle.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-candidate.json node benchmarks/view-transitions/bundle.mjs
node benchmarks/bench.mjs --quick --ratios view-transitions
```

## Native correctness controls

The merged candidate passes 30 browser cases across development and production
compilation. Six focused controls also pass against the final baseline: delayed
native publication, urgent interruption, and a focused editable survivor's
identity, selection and scroll during a reorder without `moveBefore`.

The original baseline fails the 20 readiness, class, ref, cleanup, interaction
and native CSS type cases. The intermediate implementation without staged DOM
commits fails the nested `update="none"` native animation oracle in both modes.
The lifecycle suite also demonstrates stale descriptor output under a targeted
receipt-invalidation mutation; the final native custom-element reentry case
checks the complete browser behavior.

## Ordinary client timing

The existing compiled-branch harness compares 32 stable branches, branches that
alternate between present and absent, and an absent-branch control. Both variants
use identical authored and compiled source hashes. Each checks current text,
attributes and event closures, surviving node identity, effect lifetime and
complete unmount cleanup.

After the local test workloads stopped and storage recovered, the clean
minified variants ran in separate pages of one Chromium process. Thirty samples
alternate variant order; each sample performs 4,096 updates after 4,096 warmup
updates per variant and mode. Preparation timings are excluded.

| Mode | Baseline median [p10–p90], µs/update | Candidate median [p10–p90], µs/update | Median delta |
| --- | ---: | ---: | ---: |
| Stable | 20.59 [17.85–21.97] | 20.72 [17.50–21.31] | +0.6% |
| Toggle | 28.36 [19.34–32.37] | 28.59 [20.29–30.76] | +0.8% |
| Absent | 0.732 [0.684–0.806] | 0.732 [0.684–0.830] | 0.0% |

The table uses the mean of the two middle samples for its medians and nearest
rank for p10/p90. Raw samples and the original harness output are retained; that
harness's `median` field uses the upper middle sample for an even sample count.

These small median differences are inconclusive. Distributions overlap widely,
and unrelated applications and jobs were present on the machine. The absent
control also varies between paired samples. No ordinary-render latency
improvement or meaningful regression is established by this run.

The branch bundle itself grows from 196,544 to 200,213 bytes, or 60,371 to
61,396 bytes gzip. This is consistent with the ordinary import cost above.

```sh
CLIENT_SOURCE_ROOT=/absolute/frozen-277 CLIENT_COMPILER_ROOT="$PWD" BRANCH_CYCLES=16 BRANCH_SAMPLES=1 BRANCH_WARMUP=16 BRANCH_BUNDLE_DIRECTORY=/tmp/vt-branches/baseline node benchmarks/client-hot-paths/branches.mjs
CLIENT_SOURCE_ROOT="$PWD" CLIENT_COMPILER_ROOT="$PWD" BRANCH_CYCLES=16 BRANCH_SAMPLES=1 BRANCH_WARMUP=16 BRANCH_BUNDLE_DIRECTORY=/tmp/vt-branches/candidate node benchmarks/client-hot-paths/branches.mjs
BRANCH_BROWSER_SAMPLES=30 BRANCH_BROWSER_CYCLES=4096 BRANCH_BROWSER_WARMUP=4096 BENCH_JSON=/tmp/vt-branches/timing.json node benchmarks/client-hot-paths/branches-browser.mjs /tmp/vt-branches/baseline/branches.mjs /tmp/vt-branches/candidate/branches.mjs
```

`/absolute/frozen-277` contains `git archive 277c10c3fa80f56ef162959832dba35c1b43b32e packages/octane`,
with its package dependency directory linked to the same installation as the
candidate. The compiler is the same for both variants.

## Server rendering and streaming

The same four small server scenarios use production minified bundles and an
identical compiled fixture. Each side warms up with 50,000 ready renders or
5,000 suspended streams, followed by 11 alternating paired batches of 10,000
renders or 1,000 streams. Other local test/benchmark workloads had stopped.
An initial short-warmup pilot showed strong JIT drift and is excluded.

These are amortized batch times, not individual request percentiles.

| Scenario | Baseline median [min–max], µs | Candidate median [min–max], µs | Median paired candidate/baseline |
| --- | ---: | ---: | ---: |
| Plain ready | 0.541 [0.455–0.683] | 0.554 [0.465–0.621] | 0.959× |
| ViewTransition ready | 1.690 [1.600–1.853] | 2.137 [1.987–2.491] | 1.272× |
| Plain suspended stream | 46.722 [39.930–76.305] | 46.691 [38.237–90.396] | 1.029× |
| ViewTransition suspended stream | 51.962 [45.532–61.251] | 63.115 [58.299–74.531] | 1.153× |

Plain ready and streaming controls overlap substantially. Their samples do not
establish a meaningful change. ViewTransition ready rendering is slower in
every paired batch: approximately +0.45 µs comparing medians, with a median
paired ratio of 1.272×. ViewTransition streaming is also slower in every paired
batch, with a median paired ratio of 1.153×. These are observed feature costs;
the candidate additionally emits the functioning streamed animation driver.
They are not application-wide throughput guarantees.

| Scenario | HTML baseline → candidate | Gzip baseline → candidate | Inline scripts baseline → candidate |
| --- | ---: | ---: | ---: |
| Plain ready | 31 → 31 B | 45 → 45 B | 0 → 0 B |
| ViewTransition ready | 113 → 113 B | 105 → 105 B | 0 → 0 B |
| Plain suspended stream | 2,381 → 2,443 B | 1,033 → 1,037 B | 2,047 → 2,109 B |
| ViewTransition suspended stream | 2,525 → 9,185 B | 1,087 → 2,972 B | 2,105 → 8,763 B |

Plain streaming adds 62 raw / 4 gzip bytes for composed-stream coordination.
ViewTransition streaming adds 6,660 raw / 1,885 gzip bytes, including the new
animation driver. Ready output sizes are unchanged. These are standalone
responses compressed at gzip level 9; counter values, HTTP compression and
compression context can affect wire size.

The combined production server bundle grows from 62,802 to 70,420 bytes
(+7,618), or 21,746 to 24,057 bytes gzip (+2,311). This fixture imports
ViewTransition and both server render APIs; it is not a minimal ordinary SSR
import size. The small server scenarios do not measure browser resource waits,
backpressure, concurrency, allocation or GC behavior. They check authored
content; full capture/DOM semantics are verified by the conformance and native
browser suites.

```sh
BENCH_JSON=/tmp/vt-ssr.json node benchmarks/view-transitions/ssr.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
```

The portable runner was also checked with `--verify-only`: all eight outputs
passed, and its compiled fixture, server sources, lockfile and bundle hashes
match the warmed run exactly. That verification skips timing and warmup; its
stream counters and gzip sizes can differ. Both reports are retained.

## Scope of the measurements

Staging an active transition creates inert DOM projections, maps and proxies,
then publishes the host operations once. That work is confined to active View
Transition preparation, but has real CPU and allocation cost. These byte and
read counts do not measure active-transition preparation time, paint cost,
garbage collection, heap retention, or large-tree scaling. No improvement in
those metrics is claimed.
