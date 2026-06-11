
## Problem 1 — Storyboard EdgeFunction-Fehler

Log (`compose-video-storyboard`):
```
AI Gateway error: 503 {"error":{"message":"Service temporarily unavailable","type":"upstream_error"}}
```

Das ist ein transientes Upstream-Problem der Lovable AI Gateway (Gemini 3 Flash). Der einzige Call in `compose-video-storyboard/index.ts` (Zeile 354) hat aktuell **keinerlei Retry** — der erste 5xx bricht sofort ab und der User sieht „Edge Function returned a non-2xx status code".

## Problem 2 — Aktionsfeld wird beim Tippen ständig gelöscht / dauert 3× so lang

Root Cause (in `VideoComposerDashboard.tsx`, Zeile 370/371 und 515/516):

```
sceneActionUser: row.scene_action_user ?? local?.sceneActionUser ?? ''
sceneActionEn:   row.scene_action_en   ?? local?.sceneActionEn   ?? ''
```

Beim Tippen passiert folgendes:

1. User tippt einen Buchstaben → `onUpdate({ sceneActionUser })` setzt lokalen State.
2. Debounced Save (~1–2 s) schreibt den Wert in `composer_scenes`.
3. **Realtime-Tick** kommt zurück mit der noch alten DB-Zeile (oder einer Zeile, die ein anderer Save gerade geschrieben hat).
4. Merge nimmt `row.scene_action_user ?? local` → DB-Wert ist nicht-null → er **überstimmt** den frischeren lokalen Wert.
5. Der UI-Cursor springt, der gerade getippte Buchstabe ist weg, der User muss nochmal tippen → gefühlt 3× so lang.

Dasselbe gilt für `sceneActionEn` (wird zusätzlich noch vom Auto-Translate 500 ms später erneut gesetzt) und potenziell für jedes editierbare Freitext-Feld, das im Realtime-Merge mit `row.X ?? local.X` behandelt wird (`aiPrompt`, `stockKeywords`, `dialogScript`, `characterShots[].actionUser/actionEn`).

Außerdem: Beim Storyboard-Re-Roll wird `sceneActionUser` aus der DB neu reingeschrieben, selbst wenn der User schon manuell editiert hat — d. h. "vorausgefüllt ist immer noch nicht da" liegt am 503-Fehler aus Problem 1 (Storyboard bricht ab → keine `sceneActionUser` für die Szene), nicht an einer separaten Logik.

---

## Plan

### 1. `compose-video-storyboard` — Retry + Modell-Fallback (Problem 1)

In `supabase/functions/compose-video-storyboard/index.ts` den Block ab Zeile 354:

- Wrappe den `fetch(...)`-Call in eine kleine Helper-Funktion `callGatewayWithRetry()`:
  - Bis zu **3 Versuche** bei `502 / 503 / 504` (transient).
  - Exponential Backoff: 800 ms → 1600 ms → 3200 ms (+ Jitter).
  - `429` und `402` weiterhin ohne Retry direkt nach oben durchreichen (unverändert).
  - Nach dem letzten 503-Versuch: **einmaliger Fallback** auf `google/gemini-2.5-flash` (dasselbe Tool-Schema, gleiche Messages).
  - Logging: `[storyboard] gateway attempt N status=… model=…`.
- Wenn alle Retries + Fallback fehlschlagen, neue Error-Response: `{ error: "AI Gateway temporarily unavailable", retryable: true }` mit `status: 503` (statt aktuell 500), damit das Frontend einen passenden Hinweis-Toast zeigen kann.
- Frontend (`BriefingTab.tsx` Aufrufstelle): bei `status===503 && retryable` einen klaren Toast: „KI-Dienst ist gerade überlastet — bitte in 30 s erneut versuchen." statt der generischen „Edge Function returned a non-2xx status code".

### 2. Realtime-Merge: User-Edits dürfen nicht von DB-Tick überschrieben werden (Problem 2)

In `src/components/video-composer/VideoComposerDashboard.tsx` an **beiden** Merge-Stellen (mount-sync ~Zeile 370–371 und `refetchScenesFromDb` ~Zeile 515–516):

- Einen kleinen Helfer einführen, z. B.

  ```ts
  const isUserEditedField = (sceneId: string, fieldKey: string) =>
    pendingUserEditsRef.current.get(sceneId)?.has(fieldKey) === true;

  const mergeUserText = (rowVal: string | null, localVal: string | undefined, sceneId: string, key: string) =>
    isUserEditedField(sceneId, key) ? (localVal ?? '') : (rowVal ?? localVal ?? '');
  ```

- Eine neue `pendingUserEditsRef = useRef<Map<sceneId, Set<fieldKey>>>(new Map())`.
- `updateScene()` markiert pro Feld den "dirty"-Eintrag, sobald die Eingabe von einer User-Interaktion stammt. Die Markierung wird gelöscht, sobald der Save-Roundtrip bestätigt hat, dass DB-Row und lokaler Wert übereinstimmen (vergleichen in der DB-Sync Map nach dem Save).
- Anwendung auf die kritischen Freitext-Felder:
  - `sceneActionUser` (Hauptproblem)
  - `sceneActionEn`
  - `aiPrompt`
  - `stockKeywords`
  - `characterShots[].actionUser/actionEn` (gleiches Tipp-Problem auf Charakter-Slots)
  - `textOverlay.text`
- **Wichtig**: KEIN globales "local always wins" — nur Felder mit aktiver User-Edit-Markierung werden bevorzugt. Alle anderen Felder (clipStatus, clipUrl, lipSyncStatus, …) bleiben streng DB-first wie bisher (das ist absichtlich so für Lifecycle-Felder).

### 3. `SceneActionField` — kein leerer englischer Wert während des Tippens pushen

In `src/components/video-composer/SceneActionField.tsx` (Zeile 64):

- Den Guard etwas strenger fassen: solange `isLoading === true` (Debounce/Translate läuft) und der User aktiv tippt, **nicht** `onEnglishChange('')` triggern. Aktuell wird bei jedem Tippen kurz `english=''` an Parent gepusht, was den `useEffect` in `SceneCard.tsx` (Zeile 592) anstößt, der wiederum den Prompt rewriten will → unnötige Re-Renders, die das Cursor-Wegspring-Gefühl verstärken.

### 4. Verifikation

- `compose-video-storyboard` deployen → Edge-Log-Sweep für „gateway attempt 2 status=503" sichten, danach erfolgreiche 200 oder sauberer 503 mit klarem Toast.
- In der Preview eine Szene öffnen, schnell 10–15 Zeichen ins „Was passiert in der Szene?"-Feld tippen → kein Cursor-Spring, kein Verlust einzelner Zeichen, Wert bleibt nach 2 s Save stabil.
- Mit DevTools-Network-Throttle (Slow 3G) erneut tippen → Realtime-Tick darf das Feld nicht überschreiben.
- Storyboard-Re-Roll: Wenn ein Feld bereits manuell gefüllt ist, bleibt es erhalten (kommt jetzt zusätzlich kostenlos aus Schritt 2 mit raus).

### Dateien, die geändert werden

- `supabase/functions/compose-video-storyboard/index.ts` (Retry + Fallback)
- `src/components/video-composer/BriefingTab.tsx` (besserer 503-Toast — UI-only)
- `src/components/video-composer/VideoComposerDashboard.tsx` (Pending-User-Edits Map, beide Merge-Pfade)
- `src/components/video-composer/SceneActionField.tsx` (kein leerer EN-Push während des Tippens)

Keine Schema-/RLS-/Storage-Änderungen.
