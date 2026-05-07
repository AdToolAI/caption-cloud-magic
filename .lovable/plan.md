## Problem

Wenn eine Szene einen Charakter hat (Matthew, Sarah …), startet das generierte Video direkt mit einem **Close-up des Avatar-Gesichts** und der eigentliche Prompt ("wide shot, golden wheat field, drone hovering, farmer with back to camera …") wird ignoriert.

**Ursache:** `ClipsTab.generateAll` schickt das Porträt des Charakters als `referenceImageUrl` an Hailuo / Kling / Wan / Seedance / Luma / Veo / HappyHorse. Diese Modelle interpretieren das Bild als **first-frame** (i2v) — die Komposition des Videos ist also durch das Porträt festgelegt: zentriertes Gesicht, neutraler Hintergrund. Der Text-Prompt kann das nicht mehr "übersteuern".

Das Porträt als Anker ist nur sinnvoll, wenn die Szene tatsächlich ein Close-up des Charakters zeigen soll. Bei `full` / `wide` / `back` / `silhouette` / unspezifizierten Shots zerstört es die Komposition.

## Lösung — "Scene-Aware Character Anchor"

Statt das rohe Porträt als first-frame zu schicken, **rendern wir pro Szene einen passenden first-frame**, der Charakter-Identität + Szenen-Komposition kombiniert. Wenn das nicht nötig/möglich ist, fallen wir intelligent auf reine Identity-Injection im Text-Prompt zurück.

### Entscheidungs-Matrix (neu in `resolveSceneCharacterAnchor`)

```text
characterShot.shotType   →   Anchor-Strategie
─────────────────────────────────────────────
detail / pov             →   Porträt direkt als first-frame  (Status quo, OK)
full / profile / back /  →   Composed first-frame via Nano-Banana 2
silhouette                   (Porträt + Szenen-Prompt → neues Bild)
absent / kein Shot       →   Kein Bild-Anker, nur Identity-Card im Text
                             (Modell macht reines T2V mit Beschreibung)
```

Zusätzlich für Modelle mit echter Subject-Reference (Vidu Q2, Kling Reference2V): Porträt geht in den dedizierten `reference_images`-Slot statt als first-frame — dort dominiert es die Komposition nicht.

### Komponenten

1. **Neue Edge Function `compose-scene-anchor`**
   - Input: `portraitUrl`, `scenePrompt`, `aspectRatio`, `shotType`
   - Ruft Lovable AI Gateway mit `google/gemini-3.1-flash-image-preview` (Nano Banana 2) im Edit-Modus auf: Porträt + Anweisung "Place this person into the following scene as described, matching framing and composition: …"
   - Speichert Ergebnis in `composer-frames` Bucket (existiert bereits), gibt URL zurück
   - Cached pro `(sceneId, portraitHash, promptHash)` in einer kleinen Tabelle `scene_anchor_cache`, damit "Generate All" nicht jedes Mal neu zahlt

2. **`resolveSceneCharacterAnchor.ts` erweitern**
   - Gibt zusätzlich `strategy: 'first-frame-direct' | 'first-frame-composed' | 'subject-reference' | 'text-only'` zurück
   - Strategie wird aus `characterShot.shotType` + `clipSource` (Modell) abgeleitet

3. **`ClipsTab.generateAll` umbauen**
   - Vor dem Payload-Build: für alle Szenen mit Strategie `first-frame-composed` parallel `compose-scene-anchor` aufrufen, Ergebnis als `referenceImageUrl` setzen
   - Strategie `text-only` → `referenceImageUrl: undefined`, Identity-Card bleibt im Text (passiert bereits in `composePromptLayers`)
   - Strategie `subject-reference` → neues Feld `subjectReferenceUrl` im Payload (wird in den 1–2 Provider-Functions ausgelesen, die das unterstützen)

4. **UI-Hinweis im SceneCard / Charakter-Dropdown**
   - Kleines Badge unter dem Charakter-Selector: "Anker: Komponiert · 0,02€" / "Anker: Porträt direkt" / "Nur Text-Identität" — damit der User versteht, was passieren wird
   - Toggle "Porträt direkt verwenden" als Override

5. **Default für neue Charakter-Szenen**
   - Wenn ein Charakter über die Cast-Selection einer Szene zugewiesen wird, **ohne** dass ein expliziter `characterShot` gesetzt wurde, default `shotType = 'absent'` → das Modell entscheidet rein über den Prompt, kein face-lock. (Heute fällt das in den name-match-Pfad und schickt das Porträt als first-frame — das ist genau die jetzige Beschwerde.)

### Edge-Function-Details

- `compose-scene-anchor` läuft synchron, ~3–6 s, ein Bild pro Szene
- Kosten: Nano Banana 2 ~0,02 €/Bild, einmalig pro Szene (Cache)
- Fehler-Fallback: Wenn die Composition fehlschlägt, fällt die Strategie automatisch auf `text-only` zurück (sicherer als ein face-lock)

### Geänderte Dateien

```text
src/lib/motion-studio/resolveSceneCharacterAnchor.ts   (Strategie-Logik)
src/components/video-composer/ClipsTab.tsx             (Pre-Compose vor generateAll)
src/components/video-composer/SceneCard.tsx            (Badge + Override-Toggle)
src/components/video-composer/StoryboardTab.tsx        (Default shotType=absent bei Cast-Zuweisung)
supabase/functions/compose-scene-anchor/index.ts       (NEU)
supabase/functions/_shared/qaMock.ts                   (mock-pfad für QA)
```

### Migration

```sql
create table public.scene_anchor_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scene_id uuid not null,
  portrait_hash text not null,
  prompt_hash text not null,
  composed_url text not null,
  created_at timestamptz default now(),
  unique (scene_id, portrait_hash, prompt_hash)
);
alter table public.scene_anchor_cache enable row level security;
create policy "own anchor cache" on public.scene_anchor_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Verifikation

1. Szene 1: "wide cinematic shot of a wheat field, farmer Matthew with his back to the camera" + Charakter Matthew → Strategie `first-frame-composed` → erstes Frame zeigt **Matthew von hinten in einem Weizenfeld**, nicht sein Gesicht-Close-up.
2. Szene 2: "extreme close-up of Matthew's eyes, golden hour" + `shotType=detail` → Strategie `first-frame-direct` → Porträt direkt (Status quo, weiter erwünscht).
3. Szene 3: B-roll "drone hovering over crops" ohne Charakter → kein Anker, kein Porträt-Lock.
4. Override: User klickt "Porträt direkt" → Strategie auf `first-frame-direct` gezwungen.

### Out of Scope

- Keine Änderung an Talking-Head-Pipeline (HeyGen ist eigenes Lip-Sync-Modell, dort ist face-lock korrekt).
- Keine Änderung an den 11 Provider-Edge-Functions außer denen mit echter Subject-Reference (1–2 Files).
- Keine Marketplace-/Brand-Character-DB-Änderungen.
