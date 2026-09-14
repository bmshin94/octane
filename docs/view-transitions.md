# View Transitions

Octane supports the View Transitions API stabilized in React 19.3: the `<ViewTransition>`
boundary component and `addTransitionType`, driving the browser's native
[same-document View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
from the declarative tree. Octane also retains the compatibility aliases
`unstable_ViewTransition` and `unstable_addTransitionType`, and supports React's
experimental parent enter/exit relays.

```tsrx
import { ViewTransition, startTransition } from 'octane';

function Gallery(props) @{
	<>
		@if (props.open) {
			<ViewTransition enter="zoom-in" exit="zoom-out">
				<figure>…</figure>
			</ViewTransition>
		}
	</>
}
// Somewhere in an event handler:
startTransition(() => setOpen(true));
```

## When boundaries animate

A boundary only activates on **transition-lane** commits — updates inside
`startTransition`, `useDeferredValue` re-renders, and Suspense reveals
(fallback → content). Urgent updates, discrete events, and `flushSync` never
animate (they skip an in-flight transition, matching React). Without browser
support for the native options overload (`document.startViewTransition({ update, types })`), updates commit
with no animation — the API is a progressive enhancement.

Activation kinds:

- **enter** — the boundary's subtree was inserted by the commit.
- **exit** — the subtree was removed.
- **update** — content inside the boundary changed, or its size/position did.
- **share** — a `name` appears on both a removed and an inserted boundary in
  the same commit: the browser morphs old → new (a "shared element"
  transition). Share takes precedence over enter/exit, including named
  descendants of entering subtrees. Offscreen captures are suppressed.
- **parentEnter / parentExit** — a nested boundary inside a subtree that
  entered/exited as one unit is normally silent (only the outermost
  animates); declaring `parentEnter`/`parentExit` (or the matching handler)
  opts it back in, provided every boundary between it and the outermost also
  relays.

## Styling

Each class prop (`enter`, `exit`, `update`, `share`, `parentEnter`,
`parentExit`, plus the `default` fallback) accepts:

- `"auto"` — the browser's default cross-fade;
- `"none"` — deactivate (no animation, no callback);
- a class string — applied as `view-transition-class` alongside the
  boundary's `view-transition-name` for the duration of the transition, so
  CSS can target `::view-transition-group(.my-class)` etc.;
- a per-type map keyed by `addTransitionType` types:

```tsrx
<ViewTransition enter={{ 'nav-back': 'slide-right', default: 'slide-left' }}>
```

```ts
startTransition(() => {
	addTransitionType('nav-back');
	navigate(-1);
});
```

All matching types contribute classes in insertion order; any matching `none`
suppresses that activation. An unmatched event map falls back to `default`.
Types also reach the browser's `:active-view-transition-type()` selector.

Omitting `name`, or passing `name="auto"`, gives a boundary a stable generated
name. Use explicit names for shared-element pairs. Multiple top-level elements
get suffixed names and are all measured. Temporary names and classes are
restored to their authored values after capture.

## Callbacks

`onEnter` / `onExit` / `onUpdate` / `onShare` / `onParentEnter` /
`onParentExit` fire after the transition is `ready`, receiving
`(instance, types)`: the instance carries the resolved `name` and
`.animate()`-capable handles for the boundary's `old` / `new` / `group` /
`imagePair` pseudo-elements (Web Animations API); `types` is the commit's
`addTransitionType` array. A returned function runs when that native transition's
`finished` promise settles, including after an exit unmounts the boundary.

Each pseudo-element handle supports `animate()`, `getAnimations()`, and
`getComputedStyle()`. A boundary's `ref` receives the same stable instance;
object refs and callback refs, including callback cleanup, follow layout lifetime.

## SSR

Server rendering annotates each top-level host in a boundary. The optional
streaming driver consumes those annotations to animate Suspense fallback/content
replacements before hydration, including shared elements and parent relays.
Hydration adopts the existing hosts. Server reveals and client commits coordinate
through one native transition per document.

## Commit ordering

Octane prepares the next tree before the old snapshot, while existing DOM and
committed handlers remain visible. It uses the finished boundary props to select
old capture names, including nested `update="none"` suppression. The native update
callback publishes the ordered DOM changes once, together with insertion effects
and outgoing layout cleanup. Newly requested fonts and eligible visible images can delay layout refs
and effects by up to 500 ms. The new snapshot waits for a navigation that was
already pending before mutations. Resource failures or the timeout allow the
commit to continue. Lazy and offscreen images do not hold the capture.

Urgent work finishes pending layout work and skips the animation. Unchanged or
`none` boundaries do not receive separate new captures. The default root overlay
is suppressed so controls outside animated regions remain interactive.
Actionable native failures are sent to the root's `onRecoverableError` handler;
otherwise they are logged, and the update still commits.

## Notes and intentional divergences

- `prefers-reduced-motion` is not handled automatically (React parity) — gate
  your transition CSS with a media query.
- One transition runs at a time; work arriving mid-animation batches into the
  next one (A→B, then B→D).
- Gesture transitions (`useSwipeTransition` /
  `unstable_startGestureTransition`) are not implemented — they are still
  experimental in React and explicitly deferred until React stabilizes them.
- The full behavior matrix is pinned by the conformance ports in
  `packages/octane/tests/conformance/view-transition*.test.ts`; the
  implementation plan and its documented edge cases live in
  `docs/view-transitions-plan.md`.
