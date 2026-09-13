# Strong compiler checks

Put `"use strong"` before imports, or enable `compiler: { strong: true }` for
application-owned modules. Dependencies keep their own mode. These checks apply
to client, server, and editor compilation. Compatibility modules continue to
support explicit dependencies, manual memo hooks, and ordinary raw HTML props.

## Effects, state, and dependencies

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_DATA_FETCH` | An effect starts a known fetch and invokes a known state updater in its asynchronous continuation, without returning cleanup. | Read asynchronous render data with `use()`, or implement a cancellable external synchronization with cleanup. |
| `OCTANE_STRONG_EFFECT_CHAIN` | An effect reads state written by another effect in the same component. | Derive the value during render, use `useLinkedState`, or combine the external synchronization. |
| `OCTANE_STRONG_UNLINKED_PROP_STATE` | An eager `useState` initializer is derived from component props. | Use `useLinkedState(source, reconcile)` for state that follows a source, or `useState(() => initialValue)` for a deliberate initial capture. |
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` | An explicit dependency argument differs from the compiler's inferred inputs, or cannot be proven equivalent. | Omit the dependency argument. An equivalent array produces a **hint**, not an error; its authored behavior is preserved. |
| `OCTANE_STRONG_UNTRACKED_EFFECT` | A built-in dependency hook receives `null` dependencies. | Omit the argument so the compiler tracks reactive inputs. |
| `OCTANE_STRONG_MANUAL_MEMO` | A call to Octane's `useMemo` or `useCallback`, including known import aliases. | Write a normal calculation or callback declaration and let Strong compilation cache eligible declarations. |

Dependency comparison uses the same lexical analysis as inference, including
stable hook values and Effect Event exclusions. When dependency values are also
observable callback arguments, their order and duplicates matter. A dynamic
array is not an equivalent-list proof. `octane analyze` reports equivalent-list
hints without failing `--strict`.

Strong compilation also caches eligible `const` objects, arrays, callbacks, and
calculation results when they are consumed only by effects or custom hooks. This
preserves their identity until inferred inputs change in development and
production. Unused declarations do not receive extra caches. Mutable local data,
late-bound captures, and setup hook calls retain their required evaluation and
lifetimes; ordinary JavaScript loops do not acquire generated hook slots.

When reflective `eval` or unsupported plain-module syntax prevents the compiler
from preserving a required cache, it reports
`OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED`. Move that reflective code into a
compatibility module or use supported authoring syntax. Compilation must not
silently drop the cache after rejecting manual memoization.

These are bounded source checks. They follow supported local aliases and known
callbacks; they do not prove arbitrary imported functions, mutable containers,
or all asynchronous data flow. An effect returning cleanup still needs to cancel
or ignore stale results correctly. External subscriptions, event-driven updates,
and effect cleanup remain supported.

```tsx
"use strong";
import { useEffect, useLinkedState } from 'octane';
import { subscribe } from './connection';

export function Editor({ user }) {
  const [name, setName] = useLinkedState(user.id, () => user.name);
  useEffect(() => subscribe(user.id)); // subscribe returns its cleanup
  return <input value={name} onInput={event => setName(event.currentTarget.value)} />;
}
```

## Lists, host props, and compatibility APIs

| Diagnostic | What it detects | Replacement |
| --- | --- | --- |
| `OCTANE_STRONG_MAP_JSX` | A `.map()` callback returns JSX, including known local callback aliases. | Use `@for` with a stable item key. Data-only mapping remains valid. |
| `OCTANE_STRONG_INDEX_KEY` | An `@for` key reads a loop index, including an expression combining the index with other values. | Use an item ID that survives insertion, removal, and reordering. |
| `OCTANE_STRONG_SUPPRESSION_PROP` | A DOM intrinsic uses `suppressHydrationWarning` or `suppressNativeChangeWarning`, including statically visible object spreads. | Fix the mismatch or use the intended native event. Component props with these names are unaffected. |
| `OCTANE_NATIVE_TEXT_ONCHANGE` | The existing native text `onChange` warning, promoted to an error. | Use `onInput` for per-edit changes. Native checkbox, radio, and select `onChange` semantics stay valid. |
| `OCTANE_STRONG_COMPAT_IMPORT` | Imports or known namespace accesses for `flushSync`, `unstable_batchedUpdates`, or `StrictMode` from `octane`. | Use normal Octane scheduling and component semantics. |

```tsrx
export function Rows({ items }) @{
  <ul>
    @for (const item of items; index position; key item.id) {
      <li>{position as string}: {item.name as string}</li>
    }
  </ul>
}
```

The event check retains the existing DOM ownership and input-type analysis.
Dynamic spreads and dynamic input types may need the existing development
runtime diagnostic. Strong mode adds no runtime phase guards.

## Trusted HTML

`OCTANE_STRONG_UNTRUSTED_HTML` rejects visibly raw values supplied to a Strong
DOM intrinsic's `dangerouslySetInnerHTML`. The `TrustedHTML` type and `trustHTML`
helper declare an explicit HTML trust boundary:

```tsx
"use strong";
import { trustHTML } from 'octane';
import { sanitize } from './html-policy';

export function Article({ html }) {
  const trusted = trustHTML(sanitize(html));
  return <article dangerouslySetInnerHTML={trusted} />;
}
```

**`trustHTML` does not sanitize HTML.** Call it only after applying the
application's sanitization policy or when the input is already trusted. It
returns the existing `{ __html: string }` host-prop shape with a TypeScript brand;
there are no per-node runtime brand checks, extra DOM wrappers, or changes to
server serialization and hydration.

Strong `.tsrx` editor/type checking automatically selects the nominal Strong
JSX types, so imported values and props also need the brand. When checking plain
`.tsx` directly with TypeScript, use `/** @jsxImportSource octane/strong */` or
set `jsxImportSource` to `octane/strong`. The string directive alone cannot
change TypeScript's JSX namespace. `null` and `undefined` remain valid empty
values; custom component props and foreign renderer JSX keep their own types.

The syntax compiler cannot establish the type of an arbitrary imported value or
dynamic factory prop. Run the project's `tsrx-tsc --noEmit` check as well as its
build. Type assertions and `any` can bypass nominal checking, as with other
TypeScript contracts.
