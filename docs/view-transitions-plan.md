# View Transitions compatibility record

## Reference versions

The September 2026 audit compares Octane with React 19.3.0
(`1d34f91dfde6bba84d08b683aaba164c7194dacb`) and React main
(`9b9385327857d1211fb4dc022122d897fb38bc5a`) for experimental parent relays.
The original July implementation used callback-only mocks; native browser
regressions now cover captures, CSS, interaction, readiness, and cleanup too.

## Implemented contracts and evidence

| Contract | Primary regression coverage |
| --- | --- |
| All matching type classes, `none` precedence, default fallback, actual activation classes | `tests/conformance/view-transition-matching.test.ts`, native browser suite |
| Stable automatic names, instance refs, pseudo-element methods, cleanup at native finish | `tests/conformance/view-transition-lifecycle.test.ts`, native browser suite |
| Authored style restoration, descriptor and compiled DOM mutations, all-host geometry | Matching, lifecycle, and native browser suites |
| Nested shared elements, viewport suppression, clipping ancestors, handler-only parent relays | Matching and existing conformance suites |
| Native transition types, outside-region interaction, urgent interruption | `tests/browser/view-transition-parity/` |
| Prepared DOM stays private until native update; keyed survivors retain identity | Native staged-commit controls |
| Suspended plans discard writes; reentrant renders preserve accepted work and retired cleanup | `tests/conformance/view-transition-staging.test.ts` |
| Deferred hydration resources survive preparation and abort | `tests/hydration/deferred-hydration-contract.test.ts` |
| Mutation/insertion → resource wait → layout refs/effects → navigation wait → new capture | Layout-readiness conformance and native browser suites |
| Streaming annotations, native reveal driver, client coordination, hydration adoption | `tests/conformance/view-transition-ssr.test.ts`, native streaming coverage |
| Error recovery and unsupported-browser fallback | Lifecycle and streaming suites |
| Optional-feature bundle boundaries and active-transition DOM reads | `benchmarks/view-transitions/` |

## Architecture

ViewTransition prepares its next tree before the native old capture. An optional
DOM plan projects structural reads and host writes without changing existing
native nodes. The finished boundary props select the old capture's names and
classes, so a nested `update="none"` remains inside its parent's snapshot.
The native update callback publishes the ordered plan once, preserving survivor
identity and connected deletion cleanup. Ordinary rendering keeps its eager
native DOM path; host views and mutation plans are allocated only while a
ViewTransition prepares.

DOM observation and controlled-property snapshots during native commits detect
updates from compiled templates and returned descriptors. A layout capture
defers new refs and layout bodies until resource readiness. Every
boundary's visible top-level hosts contribute geometry; layout changes can
activate clipping ancestors. Temporary capture styles are restored before
mutation publication and again after the new capture.

The client and optional streaming driver share a document handle. Later
transition work waits for its completion; urgent work skips it. Callback cleanup
and explicit animation cancellation belong to that handle and survive boundary
unmount. Identity checks prevent an old completion from clearing a newer handle.

## Deliberate scope limits

- Gesture transitions remain deferred until React stabilizes their API.
- React Server Components, class components, and React Native are outside
  Octane's supported rendering model.
- Reduced-motion behavior remains application CSS, as in React.
- Element-scoped native transitions are a separate feature; this compatibility
  change uses document transitions and does not add a new scope prop.
- Keyed reconciliation retains Octane's LIS algorithm. Only ViewTransition
  preparation uses staged DOM publication.

See [the public guide](view-transitions.md) for usage and observable behavior.
