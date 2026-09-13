---
'octane': patch
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
---

Complete the remaining Strong compiler checks for fetch-driven effects, effect chains, prop-derived initial state, explicit and null dependencies, manual memo hooks, JSX list mapping, index keys, suppression props, trusted HTML, and compatibility imports. Preserve equivalent dependency arrays as hints and report them without failing strict CLI analysis. Add compiler-owned declaration caching for Strong authoring, the `trustHTML`/`TrustedHTML` API, and nominal Strong JSX types while preserving compatibility modules.
