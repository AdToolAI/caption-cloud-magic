## Problem

`handleReset` (VideoComposerDashboard.tsx L626–633) macht nur Frontend-Cleanup: `clearDraft()` + `setProject(defaultProject)`. Das alte `composer_projects`-Row mit seinen Szenen läuft serverseitig weiter — Replicate-/Hailuo-Renders, Dialog-Shots, Sync.so-Lipsync-Jobs und Webhook-Poller verbrauchen weiter Credits, obwohl der User glaubt, ein frisches Projekt zu haben.

## Ziel

Klick auf **„Neues Projekt"** soll:
1. Alle laufenden Renders/Lipsync-Jobs des aktuellen Projekts hart abbrechen (best-effort, idempotent).
2. Erst nach erfolgreichem Cancel den Frontend-State leeren und ein wirklich neues Projekt starten.
3. User-Feedback: Toast mit „X laufende Jobs abgebrochen" oder Fehlerhinweis.

## Lösung

### 1. Neue Edge-Function `composer-cancel-project`
`supabase/functions/composer-cancel-project/index.ts`

Input: `{ project_id }`. Auth: User muss Owner sein.

Schritte (alle idempotent, alle best-effort):
- Lade alle `composer_scenes` des Projekts.
- Für jede Szene mit `lip_sync_status in ('pending','generating','syncing')` oder vorhandenen `dialog_shots`: ruf intern dieselbe Logik wie `cancel-dialog-lipsync` auf (Sync.so DELETE + `syncso_inflight_jobs` löschen + `dialog_shots.status='canceled'`).
- Für jede Szene mit `clip_status in ('pending','generating')`: setze `clip_status='canceled'`, `clip_error='canceled_by_user_new_project'`.
- Markiere `composer_projects.status='canceled'` (neues Feld nicht nötig — `archived_at=now()` reicht falls Spalte existiert, sonst nur Scenes canceln).
- Antwort: `{ canceled_scenes, canceled_lipsync, canceled_clips }`.

Spätere Webhooks (Replicate, Sync.so) erkennen `status='canceled'` und acken stumm — Pattern existiert bereits in `compose-clip-webhook` / `sync-so-webhook`.

### 2. `handleReset` in `VideoComposerDashboard.tsx` umbauen

```ts
const handleReset = useCallback(async () => {
  setShowResetDialog(false);
  const oldId = project.id;
  if (oldId) {
    try {
      const { data } = await supabase.functions.invoke('composer-cancel-project', {
        body: { project_id: oldId },
      });
      toast({
        title: 'Projekt zurückgesetzt',
        description: `${data?.canceled_scenes ?? 0} laufende Jobs gestoppt.`,
      });
    } catch (e) {
      toast({
        title: 'Cancel teilweise fehlgeschlagen',
        description: 'Neues Projekt wird trotzdem gestartet.',
        variant: 'destructive',
      });
    }
  }
  clearDraft();
  setProject({ ...defaultProject, id: '' }); // neue ID wird beim ersten Persist erzeugt
  setActiveTab('briefing');
  setError(null);
  setShowTemplatePicker(true);
}, [project.id]);
```

Während des Cancels: Button disabled + Spinner (lokaler `isResetting` State).

### 3. Bestätigungs-Dialog anpassen

Im `AlertDialog` (L1634) Text schärfen:
> „Aktuelles Projekt verwerfen? Alle laufenden Renders und Lip-Sync-Jobs werden abgebrochen — bereits verbrauchte Credits werden nicht refundiert."

## Out of Scope

- Refund bereits verbrauchter Credits (Render läuft evtl. schon halb).
- Auto-Cancel bei Browser-Tab-Close (separates Thema).
- Long-running Lambda-Renders (Director's Cut) — Composer rendert noch nicht via Lambda in der Reset-Phase.

## Test

1. Storyboard generieren → mehrere Szenen auf `generating` → „Neues Projekt" → DB-Check: alle Szenen `clip_status='canceled'`.
2. Mid-Dialog Sync.so-Lipsync läuft → Reset → `syncso_inflight_jobs` leer für die Szenen, Sync.so-Dashboard zeigt DELETE.
3. Reset auf leerem Projekt → kein Edge-Call, sofortiger Frontend-Reset.
