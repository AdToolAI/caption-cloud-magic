## Diagnose

Der aktuelle Fehler beginnt nicht bei Sync.so, sondern eine Stufe davor:

- Aktueller Run (`edb…`): `engine_override=cinematic-sync`, `twoshot_stage=master_clip`, aber `reference_image_url = null`.
- Logs zeigen `v156_anchor_missing → aws_on_mp4_fallback`.
- Heißt: Master-Clip wurde ohne komponierten Character-Anchor erzeugt → Provider rendert generische Personen statt Samuel/Matthew/Sarah → Face Recognition findet danach keine Brand-Character-Gesichter → Sync.so-Passes laufen ins Leere.
- Zusätzlich ist `composer.silent_speaker_pass_v194 = true` (v194 stabilizer-Pässe erhöhen Komplexität und kollidieren mit dem Silent-Audio-Gate).
- `auto_detect` ist zwar überall zurückgedrängt, aber noch nicht als harte Invariante verboten.
- ID-Prefix-System (`outfit:`, `catalog:`, `lib:`, `preset:`, `pose:`, `wardrobe:`, `vibe:`, `prop:`, `look:`) ist parallel client- und serverseitig implementiert und wird nicht konsistent genutzt.

## Zielzustand

Wieder sauberer v169-artiger Ablauf:

```text
Cast (CastRef mit BASE characterId + outfitLookId)
  → compose-scene-anchor (auditiert)
  → reference_image_url gepinnt
  → i2v Master-Clip mit exakt diesen Charakteren
  → Plate face identity mapping (bbox)
  → Sync.so pro Sprecher mit bounding_boxes_url (kein auto_detect)
  → Mux
```

## Umsetzung

### 1. Master-Anchor vor Provider-Render hart erzwingen
- `compose-video-clips`: jede Cinematic-Sync-Szene mit Cast/Dialog braucht vor dem Provider-Call einen `reference_image_url`.
- Fehlt er, muss `compose-scene-anchor` synchron laufen mit `portraitUrls[]`, `identityPortraitUrls[]`, Outfit-Looks, Sprecher-Reihenfolge aus `dialog_script`.
- Anchor-Compose/Audit fehlgeschlagen → hart abbrechen, keine Provider-Kosten, klare Meldung.
- Kein stiller Text-to-Video-Fallback für Cinematic-Sync.

### 2. Frontend-Invoke-Pfad reparieren
- `useSceneGenerate`: die alte Kommentar-Regel "Anchor pre-composition nur im ClipsTab" ist für Cinematic-Sync ungültig.
- Storyboard-Generate schickt `characterShots`, `dialogScript`, `dialogVoices`, ggf. `referenceImageUrl`/`lockReferenceUrl` vollständig ans Backend.
- Cinematic-Sync ohne Anchor → Backend-Safety-Net erzeugt ihn zuerst, statt Provider blind zu starten.

### 3. v194 Silent-Speaker-Pass abschalten
- `composer.silent_speaker_pass_v194 = false` und die Injection in `compose-dialog-segments` entfernen.
- `render-sync-segments-audio-mux` verwendet nur noch aktive Sprecher-Pässe.
- Reduziert Provider-Traffic, Gate-Kollisionen (silent WAV vs. `audio_too_silent_post_trim`) und Ghost-/Freeze-Overlays.

### 4. bbox-only Sync.so-Invariante hart durchsetzen
- `_shared/asd-strategy.ts` + `compose-dialog-segments` + `sync-so-webhook`: kein `auto_detect` mehr im Dialog-Pfad.
- Retry-Varianten `auto-pro` / `auto-standard` aus dem Dialog-Retry-Ladder entfernen.
- Kein bbox baubar → fail fast + Refund statt Provider-Call.
- Fokus: `bounding_boxes_url`, notfalls inline `bounding_boxes`, `frame_number+coordinates` nur als eng gefasster Ausnahmefall.

### 5. v169 Parallelismus stabilisieren
- Per-pass-Lock beibehalten, TTL/Release sauber, kein Endlos-BUSY.
- Jeder Pass nutzt Master-Plate/eigenen Preclip, nie das Output eines Vorgänger-Passes.
- Stale-job reconcile + 429 Backoff bleiben.

### 6. ID-Prefix-System sauber verdrahten (Character/Props/Locations/Buildings/Outfits)

Bestehende Bausteine (bereits im Repo, aber inkonsequent genutzt):
- `CastRef` (typed value object mit separatem `characterId` + `outfitLookId`)
- `stripLegacyCastIdPrefix`, `resolveCharacterId`, `useCharacterIdResolver`
- `mentionToCastRef` als offizieller Boundary-Layer
- Serverseitige Strips (`v170 stripIdPrefix` in `compose-dialog-segments`, `outfit:` Resolver in `compose-video-clips`, prefix-aware `twoshot-face-map`)

Was fehlt oder inkonsistent ist:
- `character_shots` in der DB enthält teils noch `outfit:<lookId>`, teils saubere UUIDs. Die Compose-Funktion papieren das mit einer Ad-hoc-Lookup-Migration.
- Scene Director (LLM) + ProductionPlan + Auto-Director schreiben teils gemischte Formen.
- Server-Vergleiche gegen `brand_characters.id` funktionieren nur, weil sie überall lokal Prefix strippen — jeder neue Consumer kann den Bug wieder einführen.
- Props/Locations/Buildings kommen aus `*_catalog_previews` als eigene UUIDs; im Composer werden sie aber in `@-Mentions` als `catalog:<id>` referenziert und müssen jedes Mal separat aufgelöst werden.

Maßnahmen:

a. Single boundary durchsetzen
- Jede Konvertierung aus der Mention-Library läuft ausschließlich über `mentionToCastRef` bzw. das äquivalente Prop/Location/Building-Pendant.
- Alle Stellen, die direkt `mention.id` in DB-Felder oder Prompts schreiben, umbauen: nur noch `CastRef` bzw. resolved base UUID + optional `outfitLookId`/`variantId`.

b. DB-Schema/Storage klarziehen
- `character_shots[].characterId` speichert IMMER die base `brand_characters.id`; Outfits liegen in `outfitLookId` daneben. Für Legacy-Zeilen einmalig eine Read-Migration/Repair im Backend beim nächsten Zugriff (`compose-video-clips` macht das schon punktuell — konsolidieren, nicht wieder-erfinden).
- Analog Props/Locations/Buildings: separates Feld `variantId` / `catalogId`, nicht Prefix-in-string.

c. Server-Strips zentralisieren
- `stripIdPrefix`-artige Helper aus `compose-dialog-segments`, `compose-video-clips`, `twoshot-face-map`, `plate-face-identity` in ein einziges `_shared/cast-id.ts` mit einer Funktion `resolveCastRef(rawId, ctx)`.
- Alle Vergleiche gegen `brand_characters.id` gehen nur noch über diese Funktion. Kein lokaler Regex mehr in einzelnen Modulen.

d. Runtime-Guard
- Wenn eine Szene beim Dispatch noch prefixed IDs enthält, wird sie beim Start einmalig migriert und persistiert; anschließend Standard-Pfad.
- Neuer Client-Code darf keine prefixed IDs mehr in `character_shots`, `mentioned_character_ids`, `dialog_voices` schreiben — TS-Types (`CastRef`) machen das compiler-enforced.

e. Props/Locations/Buildings
- Scene Director / Prompt-Composer nutzen die base UUID aus `world_catalog` / `brand_locations` / `brand_buildings` / `brand_props` und speichern separate Referenzfelder (`sceneLocations[]`, `sceneProps[]`) statt Prompt-Mentions.
- Anchor- und Scene-Director-Aufrufe bekommen konsistent `locationUrls`, `buildingUrls`, `propUrls` (schon vorgesehen in `compose-scene-anchor`), müssen aber überall aus den echten Objekten gefüllt werden, nicht aus Prompt-Regex.

Erwarteter Effekt: viele "Charakter nicht auflösbar / plate identity 0 / anchor missing single speaker"-Fehler verschwinden, weil die Base-UUIDs deterministisch identisch sind zwischen Client, Anchor-Renderer, Identity-Audit und Sync.so-Slot-Bridging.

### 7. Recovery für kaputte Szenen
- Erkennen: Cinematic-Sync + `reference_image_url = null` + master ready.
- Nicht weiter lipsyncen; als "needs_clip_rerender" markieren mit klarer Meldung.
- Optional: automatisch Anchor + Master neu erzeugen, wenn alle Cast-Portraits vorhanden sind.

### 8. Verifikation
- Neuer 3-Speaker-Run: `anchor pinned` erscheint VOR `master_clip`.
- Master-Clip zeigt die gewählten Charaktere.
- Keine v194-Stabilizer-Passes in `syncso_dispatch_log`.
- Alle Dispatches führen `bounding_boxes_url` (kein `auto_detect`).
- `character_shots` in der DB enthält nach dem Run nur base UUIDs + separates `outfitLookId`.
- Bei fehlendem Anchor sofortiger, verständlicher Abbruch statt Endlos-Lip-sync.

## Betroffene Dateien
- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/_shared/asd-strategy.ts`
- `supabase/functions/_shared/twoshot-face-map.ts`
- `supabase/functions/_shared/plate-face-identity.ts`
- neu: `supabase/functions/_shared/cast-id.ts` (single-source cast/prop/location resolver)
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/render-sync-segments-audio-mux/index.ts`
- `src/hooks/useSceneGenerate.ts`, `useApplyProductionPlan.ts`, `useUnifiedMentionLibrary.ts`, `useCharacterIdResolver.ts`
- `src/lib/video-composer/CastRef.ts`, `mentionToCastRef.ts`, `resolveCharacterId.ts`
- Backend-Config: `composer.silent_speaker_pass_v194 = false`
- Projekt-Memory: neue harte Regeln
  - Dialog Lip-sync = bbox-only, kein `auto_detect`
  - Cinematic-Sync ohne komponierten Anchor darf keinen Provider-Render starten
  - Cast/Prop/Location IDs immer als CastRef (base UUID + optionaler Variant-Slot), nie als Prefix-String