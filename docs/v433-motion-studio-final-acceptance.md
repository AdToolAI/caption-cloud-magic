# v433 — Motion Studio Final Acceptance (FA)

Frozen contracts stay frozen (G3.2.2, G3.2.2-F1, RS3). Findings are fixed on the
level where they occur. A passed FA block is not re-run.

---

## FA-1 — C1 Browser-Smoke (Lip-Sync Intent UI/DB divergence)

**Environment**
- Project: `035273d7-ae9b-44e0-89e7-f9e28703530d` ("v431-g322-resmoke")
- Scene under test: `22cc0e10-cdff-4de8-bb8f-64b4764076e9` (S03), DB truth
  `lip_sync_with_voiceover = false`, `dialog_mode = true`
- Account: `bestofproducts4u@gmail.com` (`8948d3d9-…`), read-only, no render started
- Storage keys: `video-composer-draft:<uid>`, `composer:intent-markers:<uid>`
- Scripts: `/tmp/browser/fa1/fa1.py` (A), `fa1b.py` (B), `fa1c.py` (C)

### Case A — legacy draft (pre-C1, no schema version) with stale ON
Seeded draft: scene with `lipSyncWithVoiceover: true`, `dialogMode: true`,
`engineOverride: 'cinematic-sync'`, no `scenePersistenceState`.

Result after hydration:
- draft migrated → `draftSchemaVersion: 2`
- scene provenance → `db_hydrated`
- `lipSyncWithVoiceover` → **false** (DB wins over the stale draft)
- marker store → empty (no phantom markers created)

**PASS** — legacy stale ON no longer survives; the silent render block cannot recur.

### Case B — orphaned dirty marker (browser death, no in-flight write)
Seeded marker `{ field: lipSyncWithVoiceover, desiredValue: true, setAt: 0 }`
plus a v2 draft with `db_hydrated` / value `true`.

Result after hydration:
- reconcile verdict `lost` → marker cleared (`composer:intent-markers` = `[]`)
- scene value → **false** (DB wins)

**PASS**

### Case C — tri-state before hydration (hydration request delayed 25 s)
Pre-hydration DOM of the scene's master control:
`aria-busy=true`, `disabled=true`, sub-label "Status wird geladen …",
neutral dashed styling — the intent is neither claimed ON nor OFF.
Post-hydration: control enabled and rendering the DB truth.

**Finding (P1, fixed in this block):** the SceneCard master toggle
"Dialog & Lip-Sync" (a User-Writer for `dialogMode`, `lipSyncWithVoiceover`,
`engineOverride`) was not tri-state gated — pre-hydration it rendered and
accepted clicks on the unresolved local value.

**Fix (presentation level only, `src/components/video-composer/SceneCard.tsx`):**
- `intentUnresolved = isSceneIntentUnresolved(scene)` now gates the toggle
- unresolved renders neutral (dashed ring, mid knob, "Status wird geladen …")
- `disabled` + `aria-busy` + click guard while unresolved
- no logic, DB, or pipeline change; frozen contracts untouched

**Verification**
- `tsgo --noEmit`: clean
- `bunx vitest run src/lib/video-composer/__tests__/lipSyncIntentDraft.test.ts`: 20/20 pass
- Case C re-run after the fix: pre-hydration disabled + busy, post-hydration DB truth

**FA-1 — PASS.** No paid render was started.
