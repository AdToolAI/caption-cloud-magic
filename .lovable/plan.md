Do I know what the issue is? Yes.

The screenshot confirms the client still receives `scene_not_found`, but our previous silent handling does not catch it because the frontend checks `lsErr.context.error`. In this client, `lsErr.context` is a raw `Response`, so `.error` is always undefined. The code only parses the response later via `extractFunctionsError`, after the silent-race check, so it falls through into the red `Lip-Sync fehlgeschlagen` toast.

Plan:

1. Fix error parsing in `useTwoShotAutoTrigger.ts`
   - Make the `compose-dialog-segments` `.then()` handler parse `lsErr` with `extractFunctionsError()` before deciding what to do.
   - Treat parsed `scene_not_found` as silent, just like `missing_audio_plan`, `missing_source_clip`, `dialog_pipeline_missing_audio_plan`, and `master_clip_not_ready`.
   - Add a `cancelled` guard so stale promises from the old project cannot show toasts after `Neues Projekt` / reset.

2. Fix the duplicate handling in `ClipsTab.tsx`
   - Apply the same parsing approach at the second `compose-dialog-segments` invoke site.
   - Do not toast when the parsed backend error is `scene_not_found`.
   - Keep real errors visible, including `tts_failed`, `no_voiceover`, and actual lip-sync provider failures.

3. Optional backend hardening for auto-trigger calls
   - Send `auto: true` in the two frontend invokes.
   - In `compose-dialog-segments`, if `auto === true` and the scene is gone, return `200 { ok: true, status: 'scene_gone' }` instead of `404`.
   - Keep `404 scene_not_found` for direct/manual callers so genuine misuse remains debuggable.

Validation:

- Start a Cinematic-Sync/lip-sync flow, then click `Neues Projekt`: no red `scene_not_found` toast.
- Delete/reset while auto-trigger is running: only a console info entry, no destructive toast.
- Real failures still show the correct error toast.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>