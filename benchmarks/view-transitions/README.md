# View Transition optional cost and native work

This suite measures production bundle bytes, optional driver reachability, and
browser reads around native View Transitions. It reuses the published-API
minimal root/state fixtures and the native parity browser fixture. It makes no
claim about latency, paint cost, garbage collection, or V8 allocations.

```sh
node benchmarks/bench.mjs --quick --ratios view-transitions
BENCH_JSON=/tmp/vt-baseline.json node benchmarks/view-transitions/bundle.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-candidate.json node benchmarks/view-transitions/bundle.mjs
```

The revision argument freezes the entire Octane package and compiler through
the established Activity benchmark helper. Baseline and candidate use the same
authored fixtures, dependencies, production options and machine. Source,
lockfile and bundle hashes plus tool/browser versions accompany the results.
The runner rejects a source change during measurements.

## Controls

- **Ordinary static root:** mounts authored text and unmounts it.
- **Ordinary stateful root:** dispatches a real button event, observes the state
  change, and checks layout-effect cleanup on unmount.
- **Active View Transition:** performs four separate text updates, waiting for
  each native animation to finish. Every update preserves the uncontrolled
  input and its draft, produces the expected text, and actually animates.

Both ordinary bundles must exclude the optional transition driver and DOM
staging adapter. Their
measured bytes execute through the existing bundle semantic oracle and again
in Chromium while instrumenting native capture, rect reads and computed-style
reads. All three observed counts remain zero for those ordinary workloads.

The positive fixture must retain the driver. A clean minified pass and an
observed readable production pass execute the same fixture and must return the
same output, identity, draft and animation observations. Instrumentation wraps
browser APIs and delegates every call to the original method. Counters include
the fixture's public pseudo-element style observations, so they describe the
complete scenario rather than only internal framework work.

The active bundle includes the browser fixture's observation code and controls;
its absolute size is not a minimal framework import size. Compare its baseline
and candidate with the same fixture, and use the ordinary bundles for optional
cost. Byte deltas are reported explicitly instead of introducing a timing or
size threshold for the added functionality.

## Native behavior regressions

```sh
pnpm exec vitest run --project=octane-events-browser packages/octane/tests/browser/view-transition-parity/view-transition-parity.test.ts
```

The browser suite runs both development and production compiler modes. It
checks visual-only mutations, nested disabled boundaries, old/new animation
classes, combined types and `none`, native CSS types, refs and pseudo styles,
cleanup, authored styles,
outside pointer interaction, urgent interruption, pending Navigation API work,
and newly loaded font readiness including layout effects and host refs.

A delayed real native update callback checks that preparing a commit preserves
the previous HTML, node identities, controlled values, event handlers, insertion
effects, layout effects and refs. MutationObserver allows only temporary View
Transition names/classes before replay. The released update checks compiled
and descriptor text, keyed reorder/removal/insertion and retained row identity.
It also preserves a dirty textarea while changing its default, updates a
controlled select's options, and keeps existing custom-element property,
attribute and connection callbacks quiet during preparation. A gated update
interrupted by urgent work must leave the urgent DOM and effect lifetime intact.
Focused editable rows preserve focus, selection and scroll through a reorder
without native `moveBefore`. A custom-element callback that refreshes the same
root must not strand a later descriptor update.

`OCTANE_VT_BROWSER_PACKAGE=/absolute/frozen/packages/octane` runs the same
fixture against a frozen runtime. The original runtime fails the readiness,
class, ref, cleanup, interaction and native CSS type observations in both
modes. Native snapshots, promises and animation objects are never replaced by
a View Transition mock.

The font tests reuse the existing
`benchmarks/tanstack-com/octane/public/fonts/Inter-latin.woff2` fixture, with no
new copy or external request. Inter is by the Inter Project Authors and uses
the [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt).
