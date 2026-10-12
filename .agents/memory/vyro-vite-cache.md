---
name: VYRO Vite dependency cache
description: A stale Vite prebundle can mask a corrected React version pair in the VYRO preview.
---

After changing VYRO's React/ReactDOM dependency versions, verify the versions in Vite's optimized dependency metadata as well as `pnpm` resolution. If the preview still loads an old peer version after reinstall and workflow restart, clear the generated Vite cache and restart the managed web workflow.

**Why:** The workspace package graph and production build resolved matched React versions while the development preview continued serving cached React/ReactDOM from the previous versions.

**How to apply:** Check `artifacts/vyro/node_modules/.vite/deps/_metadata.json` when React reports a version mismatch only in the browser; remove only that generated cache before restarting.
