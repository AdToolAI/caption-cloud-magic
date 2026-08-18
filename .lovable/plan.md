# FA-4 Pre-Deploy Version Pin — mechanical only

FA-4 S11 FIXTURE CORRECTION = PASS / FROZEN.

Vor dem Deploy genau eine mechanische Änderung:

In `supabase/functions/compose-dialog-segments/index.ts` den bestehenden `COMPOSE_DIALOG_SEGMENTS_VERSION` von:

```text
v401-july-image-path-single-face-isolation
```

auf einen eindeutigen neuen FA-4-Marker bumpen:

```text
v402-fa4-face-candidate-geometry-fix
```

## Scope

- Keine weitere Codeänderung.
- Keine Doku-Neubewertung.
- Keine Tests verändern.
- Keine anderen Functions anfassen.

## Verification

1. Relevante bestehenden Tests erneut ausführen.
2. Read-only Diff bestätigen: ausschließlich Version-Pin zusätzlich.
3. STOP.

## Gate

Noch KEIN Deploy.
Noch KEIN Render.

Abschluss ausschließlich mit:

`FA-4 PRE-DEPLOY VERSION PIN READY → STOP`

oder

`FA-4 PRE-DEPLOY VERSION PIN BLOCKED — <Grund> → STOP`
