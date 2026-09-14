---
'octane': patch
'@octanejs/mcp-server': patch
---

Align ViewTransition with React 19.3: fix activation classes, type maps, authored
style restoration, mutation and layout detection, nested sharing, instance refs,
and callback cleanup at animation finish. Forward native transition types, keep
unanimated controls interactive, and wait for relevant resources and navigation.
Animate streamed Suspense reveals with coordinated hydration and client updates.

Prepare ViewTransition renders with staged DOM commits so snapshot naming uses the finished boundary props while preserving existing node identity and committed lifecycle visibility.

Expose the ViewTransition bundle and native-work benchmark through the MCP benchmark tools.
