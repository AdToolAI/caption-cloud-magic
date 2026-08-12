# Nahtlose Szenenübergänge + widerspruchsfreie Strecke (v426)

## Was ich geprüft habe

Ich bin die Kette Briefing → Storyboard → Szene → Clip im Code durchgegangen: `analyze-briefing`, Produktionsplan/Auto-Casting, `SceneCard`, `composer-start-scene-generation`, `compose-video-clips` (Dispatch + alle Provider-Zweige), `compose-clip-webhook`, `modelark-poll`, das Visual-Continuity-System (`src/lib/composer/visualInputs/*`, `supabase/functions/_shared/visual-inputs.ts`, `transition-frame.ts`) und den v425-Lip-Sync-Vertrag.

Der Lip-Sync-Pfad (Hailuo/HappyHorse) ist nach v425 sauber. Der **Nicht**-Lip-Sync-Pfad hat echte Widersprüche — der nahtlose Übergang greift in der Praxis fast nie.

## Befunde (im Code verifiziert)

**1. Der Übergang scheitert am Timing (Hauptursache).**
`compose-video-clips` schickt in einer Schleife **alle** Szenen sofort los und verlässt sich danach auf Webhooks. Wenn Szene 2 dispatcht wird, hat Szene 1 noch kein `clip_url` — der Server-Backfill (`ensureTransitionFrame`) findet nichts und der Resolver fällt auf `match-cut` zurück. Frame-Chaining funktioniert heute faktisch nur beim Einzel-Re-Render einer späteren Szene.

**2. Zwei konkurrierende Kontinuitäts-Systeme.**
Neben dem Resolver schreibt `compose-clip-webhook` (Block F) den letzten Frame in `reference_image_url` der Folgeszene. Genau dieses Feld ist laut v400 der **Geometrie-/Identitäts-Anker**. Das ist die Fehlerklasse, die schon einmal den Lip-Sync zerstört hat, und die Bedingung „nur wenn leer" heißt zusätzlich: Szenen mit Cast-Anker chainen nie.

**3. Seedance 2.5 bekommt seine Videoreferenz nie.**
`__seed25AnchorOwnsSlot` unterdrückt bei identitätskritischen Szenen den kompletten Referenz-Slot — inklusive der Clip-Referenz. Und der Resolver liefert bei `inputMode: 'references'` trotzdem `firstFrameUrl = anchorImageUrl`, also einen in sich widersprüchlichen Plan.

**4. Zweite, veraltete Lip-Sync-Zertifizierungsliste.**
`visualInputs/modelProfiles.ts` führt `kling`, `wan`, `luma`, `seedance-1.x` als lip-sync-zertifiziert — direkter Widerspruch zu v425 (nur HappyHorse + Hailuo).

**5. Lip-Sync-Arbitrierung läuft ins Leere.**
Abgeleitete Profile haben immer `verification.status = 'unverified'`, deshalb erzeugt jede Lip-Sync-Szene die Warnung `lipsync_capability_unverified_match_cut`, obwohl `match-cut` dort ohnehin korrekt ist.

**6. Toter Client-Pfad.** `prepareContinuityInputs` / `captureTransitionFrame` werden nirgends aufgerufen.

## Umsetzung

### 1. Kontinuitäts-Kette statt Zufall
- Neue Server-Verkettung: Szenen, die Kontinuität brauchen (`visualContinuity !== 'match-cut'`, Vorgänger im selben Run), werden nicht sofort dispatcht, sondern mit `clip_status = 'queued'` und `continuity_source_scene_id` geparkt.
- `compose-clip-webhook` (und `modelark-poll` über denselben Weg) startet nach Fertigstellung von Szene N automatisch die geparkte Szene N+1 — mit dem frisch extrahierten Frame bzw. Clip.
- Szenen ohne Kontinuitätsbedarf (Szene 1, `match-cut`, Lip-Sync-Plates, Upload/Stock) laufen weiterhin sofort und parallel.
- Sicherheitsnetze: Timeout pro Kettenglied (Vorgänger nicht fertig → Szene startet trotzdem als `match-cut`), Vorgänger `failed` → Nachfolger startet ohne Kontinuität statt hängen zu bleiben. Kein „queued" bleibt liegen.

### 2. Legacy-Chain entschärfen
Block F im Webhook schreibt nicht mehr in `reference_image_url`, sondern in ein eigenes Kontinuitätsfeld (`first_frame_url` + `continuity_source_scene_id`). Der Resolver ist damit die einzige Instanz, die entscheidet, was Frame 0 wird — der Identitäts-Anker bleibt unangetastet.

### 3. Widerspruchsfreier Plan pro Provider
- Resolver: bei `inputMode === 'references'` wird `firstFrameUrl` nicht mehr mitgeliefert (exklusive Slots dürfen nur eine Sache tragen).
- Frame-Chain für alle i2v-Modelle: Hailuo, Kling, Wan, Luma, LTX, Veo, Seedance 1.x, HappyHorse → letzter Frame des Vorgängers als Startbild.
- Video-Referenz für die v2v-fähigen Modelle: Seedance 2.5 (`reference_video`) und Kling Omni → Vorgänger-Clip als Referenz.
- Seedance 2.5 konkret: bei **nicht** identitätskritischen Szenen darf die Clip-Referenz den Slot belegen (Videoreferenz-Kette). Bleibt die Szene identitätskritisch, gewinnt weiterhin der komponierte Anker — dann greift bewusst `match-cut`, weil ModelArk sonst am Personenschutz scheitert.
- End-Frame-Brücke (Luma, Kling, LTX, Vidu) nur, wenn der Nutzer wirklich ein Endbild gesetzt hat.

### 4. Eine Wahrheit für Lip-Sync
`modelProfiles.ts` leitet `lipSync.supported` aus `lipsyncMasterProvider.ts` ab; die Doppel-Liste verschwindet. Zertifizierte Provider gelten in der Arbitrierung als verifiziert, damit keine falschen Warnungen mehr entstehen.

### 5. Aufräumen
Ungenutzten Client-Capture-Pfad entfernen (Server ist zuständig). Ein Telemetrie-Log pro Szene: `transition=… inputMode=… source=…` — damit im Nachhinein belegbar ist, warum eine Szene geschnitten statt verkettet wurde.

### 6. Absicherung
Unit-Tests für Resolver/Arbitrierung (jedes Modell: erwarteter Transition-Modus mit und ohne Lip-Sync, mit und ohne Vorgänger-Clip), plus ein Vertragstest, der garantiert: kein Plan liefert gleichzeitig `firstFrameUrl` und Referenzen an ein Modell mit exklusivem Slot, und kein Kontinuitäts-Frame landet je in `reference_image_url` einer Lip-Sync-Szene.

## Auswirkung für den Kunden

Mehrszenige Projekte ohne Lip-Sync rendern minimal langsamer (Kette statt alles gleichzeitig), dafür entsteht der nahtlose Anschluss wirklich. Lip-Sync-Szenen und der v425-Vertrag bleiben unverändert.
