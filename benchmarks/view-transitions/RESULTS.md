# View Transition parity performance evidence

## Final element-scope comparison

The final implementation is compared with main `277c10c3fa80f56ef162959832dba35c1b43b32e`.
Byte and browser-work results use `4986632290779bc13466b75479ee0e92029f518b`; timing records
retain their exact source revisions below. The `elementScopes` entry in
[measurements.json](./measurements.json) contains raw counts, samples, semantic
observations and source/fixture/asset hashes. This comparison includes the whole
PR; the earlier document-parity measurements below remain historical.

Environment: macOS arm64, Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71 and Playwright 1.61.1. The same authored fixtures,
dependency installation and production settings are used for both revisions.

### Final bundle cost

| Fixture | Raw main → candidate | Raw delta | Gzip main → candidate | Gzip delta |
| --- | ---: | ---: | ---: | ---: |
| Ordinary static root | 164,612 → 168,394 B | +3,782 B | 52,777 → 53,774 B | +997 B |
| Ordinary stateful root | 172,768 → 176,596 B | +3,828 B | 55,662 → 56,723 B | +1,061 B |
| Document transition fixture | 261,689 → 322,522 B | +60,833 B | 74,311 → 89,662 B | +15,351 B |
| Scoped transition fixture | 256,179 → 316,733 B | +60,554 B | 72,455 → 87,749 B | +15,294 B |
| Ordinary inline styles | 115,862 → 118,662 B | +2,800 B | 36,957 → 37,748 B | +791 B |

Both minimal ordinary bundles and the style fixture exclude the optional
ViewTransition driver and DOMStage. The minimal ordinary controls perform zero
rectangle reads, computed-style reads and native captures. Shared rendering
hooks still add bytes; optional exclusion does not imply zero shared cost.

The transition fixtures include their observation code and controls, so these
are not minimal framework import sizes. Main ignores the new scope prop; its
scoped fixture contributes a byte comparison only, without a behavioral parity
claim. The ordinary/document runner supplies the baseline native control.

### Native browser work

The existing four document updates remain 4 → 8 rectangle reads, 8 → 28
computed-style reads and 4 → 4 native captures. Each preserves the uncontrolled
input and its draft, current output and actual native animation.

| One scoped batch | Rectangle reads | Computed-style reads | Element captures | Document captures |
| --- | ---: | ---: | ---: | ---: |
| Single | 4 | 22 | 1 | 0 |
| Siblings | 8 | 44 | 2 | 0 |
| Nested | 8 | 44 | 2 | 0 |
| Mixed | 14 | 71 | 3 | 1 |

Minified and instrumented readable production runs agree on native owners,
fulfilled ready/update/finished promises, persistent hosts, final text and
pseudo-element animation targets. Counts include the fixture’s public snapshots
and pseudo-style observations; instrumentation delegates to the native API.
These figures do not measure capture latency, paint, allocations or large-tree
scaling.

### Ordinary style work and timing

All ten existing style modes × four operations pass and return identical
baseline/candidate property-loop, setter, component-render and CSSOM counts.
For a 1,000-row single-property literal, mount/select/change-selection/unrelated
updates issue 1,000/1/2/0 scalar setters and CSS writes. The multi-property literal
uses 1,000 grouped setters at mount, then 2/4/0 scalar setters and 2,000/2/4/0
CSS writes. The generic control performs 1,000 object diffs each time; selection
changes still cause only 2/4 CSS writes and an unrelated update causes none.
Leading-spread updates retain 2,000 previous/new property visits; their generic
and collision controls retain 4,000 in each direction. These are work counts, not
counts of every executed branch or heap allocations.

The coverage scanner now includes the object-clear loop whether its body is a
single expression or a block. All four property loops are counted on both
revisions; the clearing loop does no work in these update scenarios.

Timing used clean minified assets in baseline–candidate–candidate–baseline
order, with 20 fresh-context samples and 2 warmups per operation per run
(40 samples per variant). Other root/agent tests and browsers were stopped;
unrelated desktop activity was not controlled. These are mount and early update
times, not steady-state throughput.

Timing used `f5a43f4f15fc16da7abd258387e8e89d56dabfae`. Final candidate style
artifacts are byte-for-byte identical to those timed, including the readable
and minified asset hashes. The later portal correction is confined to active
transition grouping and does not change this ordinary workload.

| Style / operation | Main median [p25–p75], ms | Candidate median [p25–p75], ms |
| --- | ---: | ---: |
| single / mount 1k | 4.50 [4.30–4.60] | 4.45 [4.30–4.80] |
| single / select one | 1.80 [1.70–1.90] | 2.00 [1.80–2.10] |
| single / select another | 0.80 [0.70–0.90] | 0.90 [0.80–1.00] |
| single / unrelated update | 1.65 [1.50–1.80] | 1.70 [1.50–2.10] |
| multi / mount 1k | 4.60 [4.50–4.80] | 4.50 [4.40–4.80] |
| multi / select one | 1.90 [1.70–2.00] | 1.80 [1.70–1.90] |
| multi / select another | 0.85 [0.80–0.90] | 0.90 [0.80–0.90] |
| multi / unrelated update | 1.90 [1.70–2.10] | 2.00 [1.80–2.20] |
| generic / mount 1k | 5.15 [4.50–6.10] | 5.20 [5.00–6.00] |
| generic / select one | 2.30 [2.20–2.30] | 2.40 [2.20–2.60] |
| generic / select another | 1.00 [0.90–1.10] | 1.00 [0.90–1.10] |
| generic / unrelated update | 2.25 [2.20–2.50] | 2.40 [2.10–2.60] |

The single-property first-selection median is 0.20 ms higher; multi-property
first selection is 0.10 ms lower, and generic selection is 0.10 ms higher. The
overlapping distributions and changing direction across controls do not isolate
the new style hook’s latency. No speed improvement is claimed.

### Server cost

The six scenarios retain the four ordinary/document controls and add ready and
streamed element scopes. Both variants use the identical compiled fixture.
Ready renders warm up 50,000 times and use 11 paired alternating batches of
10,000; streams warm up 5,000 times and use 11 batches of 1,000. Values below
are amortized operation times, not individual request percentiles.

SSR timing used `f5a43f4f15fc16da7abd258387e8e89d56dabfae`. A final-source verify-only
run confirms identical compiled fixture, server source and bundle hashes,
including raw and gzip bytes; the client-only portal correction cannot affect
these timed server artifacts.

| Scenario | Main median [p25–p75], µs | Candidate median [p25–p75], µs |
| --- | ---: | ---: |
| Plain | 0.349 [0.328–0.364] | 0.362 [0.324–0.388] |
| View | 0.876 [0.852–0.940] | 1.195 [1.161–1.269] |
| PlainStream | 20.449 [20.226–20.707] | 20.877 [20.247–21.423] |
| ViewStream | 24.279 [23.985–24.683] | 28.898 [28.621–29.359] |
| ScopedView | 0.935 [0.931–0.943] | 5.606 [5.575–5.630] |
| ScopedViewStream | 23.575 [23.187–23.869] | 38.785 [37.728–39.524] |

Plain controls overlap. Document ready/streamed rendering and the new scoped
cases cost more in these paired batches. Scoped ready output additionally
identifies the persistent host and injects the isolation declaration. The
baseline ignores the scope prop, so the scoped timing differences include new
functionality and are not a same-behavior speed comparison.

| Scenario | HTML main → candidate | Gzip main → candidate | Inline scripts main → candidate |
| --- | ---: | ---: | ---: |
| Plain | 31 → 31 B | 45 → 45 B | 0 → 0 B |
| View | 113 → 113 B | 105 → 105 B | 0 → 0 B |
| PlainStream | 2,381 → 2,443 B | 1,031 → 1,039 B | 2,047 → 2,109 B |
| ViewStream | 2,525 → 12,621 B | 1,085 → 3,926 B | 2,105 → 12,199 B |
| ScopedView | 132 → 213 B | 113 → 155 B | 0 → 0 B |
| ScopedViewStream | 2,544 → 12,663 B | 1,094 → 3,939 B | 2,105 → 12,141 B |

Both candidate scope cases emit exactly one persistent section marked
`vt-scope="element"` and `view-transition-scope:all!important`. Scoped ready
rendering adds 81 raw/42 gzip response bytes. Streamed transitions include the
animation/coordination driver; ordinary streams remain driver-free. Response
counter values and compression context can change gzip bytes.

The combined six-scenario server bundle grows from 63,387 to
75,775 raw bytes (+12,388) and 21,820 to 25,598 gzip bytes
(+3,778). It imports ViewTransition and both server render APIs, and is
not a minimal ordinary SSR bundle. The measurements do not cover resource
waiting, backpressure, concurrent requests, allocation or GC.

Reproduction commands and scope limitations are in [README.md](./README.md).

## Historical document-parity measurements

Measured on 2026-09-14 against main
`277c10c3fa80f56ef162959832dba35c1b43b32e` and merged candidate
`7cd542853722ba38ff520507b9608b5eafb83d82`.
[Raw measurements](./measurements.json) retain source, fixture, lockfile and
bundle hashes, semantic observations, and tool versions.

Environment: macOS arm64, Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71, Playwright 1.61.1. Each variant uses the same
authored fixtures, dependency installation and production settings. The bundle
runner verifies that source and fixture hashes remain unchanged during its run.

### Production bundle cost

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

### Deterministic browser work

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

### Native correctness controls

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

### Ordinary client timing

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

### Server rendering and streaming

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

### Scope of the measurements

Staging an active transition creates inert DOM projections, maps and proxies,
then publishes the host operations once. That work is confined to active View
Transition preparation, but has real CPU and allocation cost. These byte and
read counts do not measure active-transition preparation time, paint cost,
garbage collection, heap retention, or large-tree scaling. No improvement in
those metrics is claimed.
