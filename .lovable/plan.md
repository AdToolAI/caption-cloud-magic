## Ziel

Jeder einzeln generierte KI-Clip aus dem Motion Studio (Video Composer) soll **automatisch** in der **Mediathek → Tab "KI"** als eigenständiges Asset gespeichert werden — auch wenn:

- das Gesamt-Video später nicht fertig rendert,
- der User die Szene **neu generiert** (alte Version bleibt zusätzlich erhalten),
- der User das Projekt verwirft.

Der User hat dadurch jederzeit Zugriff auf alle bezahlten KI-Szenen und kann sie wiederverwenden.

---

## Aktuelle Situation (Kurz)

- `compose-clip-webhook` lädt fertige Replicate-Clips in `ai-videos/composer/{projectId}/{sceneId}.mp4` und schreibt nur `composer_scenes.clip_url`.
- Die Mediathek "KI" liest aus `video_creations` mit `metadata.source` ∈ `{sora-2-ai, director-cut-enhancement, directors-cut, universal-creator}`.
- Composer-Clips erscheinen dort **nie**. Bei Regenerate wird `clip_url` einfach überschrieben → alte Version geht verloren.

---

## Plan

### 1. Composer-Clips automatisch in `video_creations` archivieren

Erweitere **`supabase/functions/compose-clip-webhook/index.ts`** (Status `succeeded`):

Nach erfolgreichem Upload nach `ai-videos/composer/...` einen `video_creations`-Eintrag erstellen mit:

```ts
metadata: {
  source: 'motion-studio-clip',     // neue Kennung, wird in MediaLibrary als 'ai' gemappt
  project_id: projectId,
  scene_id: sceneId,
  scene_order: scene.order_index,
  prompt: scene.ai_prompt,
  model: scene.clip_source,          // ai-hailuo / ai-kling / ai-veo / ...
  duration_seconds: scene.duration_seconds,
  reference_image_url: scene.reference_image_url ?? null,
  superseded: false,
}
```

Idempotenz: vorher per `contains('metadata', { scene_id, source: 'motion-studio-clip', superseded: false })` prüfen, damit Doppelposts vermieden werden.

### 2. Regenerate: alte Version als "superseded" behalten

Vor dem Erzeugen des neuen Eintrags alle bestehenden aktiven Clips für dieselbe `scene_id` auf `metadata.superseded = true` setzen und ein `superseded_at`-Timestamp ergänzen. So bleiben alle Versionen einer Szene erhalten und sind in der Mediathek sichtbar — die jüngste mit Badge "Aktuell", ältere mit Badge "Vorgängerversion".

### 3. Mediathek: Composer-Quelle anzeigen

In **`src/pages/MediaLibrary.tsx`** (Zeilen ~291–306) die Source-Map erweitern:

```ts
const isMotionStudio = metadata?.source === 'motion-studio-clip';
source: (isSoraAI || isDirectorCutEnhancement || isDirectorsCut || isMotionStudio)
  ? 'ai' as const : ...
title: isMotionStudio
  ? `Motion Studio Szene ${metadata.scene_order + 1}: ${metadata.prompt?.slice(0, 40) ?? ''}`
  : ...
```

Optional kleines Badge "Vorgängerversion" wenn `metadata.superseded === true`.

### 4. Auch bereits hochgeladene Stock-Videos & Eigene-Uploads ausschließen

`source: 'motion-studio-clip'` wird **nur** für echte KI-Generierungen (Hailuo, Kling, Veo, Wan, Luma, Seedance, Hailuo, Sora) gesetzt — nicht für `clip_source: 'upload' | 'stock' | 'image'`. Damit bleibt die KI-Mediathek sauber.

### 5. Refund-Pfad bleibt unverändert

Failed-Clips erzeugen weiterhin **keinen** Mediathek-Eintrag (es gibt ja nichts zu speichern) und die bestehende Credit-Refund-Logik bleibt erhalten.

---

## Technische Details (für Devs)

**Geänderte Dateien:**

| Datei | Änderung |
|---|---|
| `supabase/functions/compose-clip-webhook/index.ts` | Nach erfolgreichem Storage-Upload: alte aktive Clips derselben `scene_id` auf `superseded=true` setzen, dann neuen `video_creations`-Insert mit `metadata.source = 'motion-studio-clip'`. |
| `src/pages/MediaLibrary.tsx` | `isMotionStudio`-Check in der Source-Map ergänzen, Title generieren, optional `superseded`-Badge. |

**Keine DB-Migration nötig** — `video_creations.metadata` ist bereits ein freies `jsonb`.

**Speicherquota:** Eintrag erscheint im 500-Video-Limit der Mediathek. Da die Datei in `ai-videos/composer/...` schon liegt, entstehen keine zusätzlichen Storage-Kosten — nur ein DB-Row.

---

## Ergebnis für den User

- Jede generierte Szene ist sofort nach dem Render in der Mediathek → KI sichtbar.
- Bei Regenerate bleibt die alte Version verfügbar (z. B. um sie später in einem anderen Projekt zu verwenden).
- Selbst wenn der finale Composer-Render scheitert oder der User abbricht, sind alle Einzelszenen gerettet.
