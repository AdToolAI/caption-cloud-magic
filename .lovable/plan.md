# Eine Video-Enhance-Engine, viele Einstiegspunkte

Genau wie im Picture Studio: das schwierige Stück (Modelle, Preise, Wallet, Erstattung, Speicherung, Vorher/Nachher) wird **einmal** gebaut. Alle Oberflächen rufen dieselbe Engine auf.

## Was heute existiert (geprüft)

- `director-cut-upscale` ist ein Altpfad: fester Credit-Tarif (15/25/50), veraltete Replicate-Version, ein Simulationsmodus ohne echtes Ergebnis, direkte Wallet-Abbuchung ohne Erstattung und ohne Speicherung des Ergebnisses. Der wird ersetzt, nicht erweitert.
- Die Bild-Seite hat bereits alles Richtige: Registry + Flags (`src/config/pictureModels`), Rate Cards/FX/Margen-Kurve (`src/lib/pictureModels`), Server-Spiegel (`_shared/picture-enhance-models.ts`), Lineage, Erstattungslogik. Die Video-Engine folgt diesem Muster — mit den video-spezifischen Verschärfungen unten.

## Architektur

```text
                 video-enhance  (eine Edge Function)
                         │
      ┌──────────────────┼──────────────────┐
   Topaz-Adapter   ByteDance-Adapter   (später Crystal)
      └──────────────────┼──────────────────┘
                 Unified Result (neues Video-Asset)

AI Video Studio ┐
Mediathek       ┤
Motion Studio   ┼──► useEnhanceVideo() ──► video-enhance
Director's Cut  ┤
Content Creator ┘
```

Keine `MotionTopazService` / `DirectorsCutTopazService`. Ein Hook, eine Funktion, eine Registry, eine Preis-Engine.

## Stufe 1 — Engine

### 1. Capability-Registry mit gültigen Kombinationen

`src/config/videoEnhanceModels/`. Kein `maxResolution` + `maxFps` als unabhängige Obergrenzen — die UI würde daraus unzulässige Paare ableiten. Stattdessen eine explizite Ausgabetabelle pro Modell und Verarbeitungsmodus:

```text
outputs:
  1080p: [24, 30, 60, 120]
  4k:    [30, 60]
```

- `bytedance-vcube` — Modi (u. a. AIGC, UGC, Restoration), Kombinationen exakt nach dem **aktuell verwendeten** Replicate-Endpoint-Schema.
- `topaz-video-upscale` — zunächst bis 60 FPS gemäß aktuellem offiziellem Schema. Werte aus älteren Modellversionen werden nicht vermischt; die Registry hält fest, auf welche Endpoint-Version/Schema-Fassung sie sich bezieht.
- Jede Einschränkung ist serverseitig verbindlich; eine ungültige Kombination wird abgelehnt, nicht stillschweigend korrigiert.
- Crystal/SeedVR2: existieren als `enabled = false`, werden aber **nicht** in der produktiven Modellauswahl angezeigt. Keine Karte verspricht etwas, was nicht rendert.

### 2. ByteDance Pro als Berechtigung, nicht als Auswahl

`standard` ist verfügbar; `pro` nur, wenn `providerEntitlementVerified` gesetzt ist — also nach einem echten Pro-Lauf über den AdTool-Replicate-Account. Vorher taucht Pro in keiner Oberfläche auf.

### 3. Preis-Engine mit providerspezifischen Tarifkarten

Keine generische `Sekunden × Auflösungsfaktor × FPS-Faktor`-Formel. Die Registry unterstützt mehrere Tariftypen:

- `per_second_matrix` — `processingType × resolution × fps → USD/sec` (ByteDance, explizite Matrix aus der veröffentlichten Preistabelle)
- `per_output_second`
- `per_unit` (Topaz auf Replicate)
- `tiered`

Danach wie bei Bildern: FX-Kurs mit Sicherheitspuffer → Margen-Kurve → Deckungsbeitrags-Floor → Endpreis, plus vollständiger Preis-Snapshot am Lauf. Ein geteilter Fixture-Test beweist: gleiche Konfiguration = gleicher Preis in Studio, Mediathek, Motion Studio, Director's Cut, Content Creator. Jede Tarifkarte trägt Quelle und Prüfdatum; unbestätigte Werte sind als `costUnverified` markiert und blockieren die globale Freischaltung.

### 4. Lebenszyklus — lokaler Timeout ist kein Provider-Fehler

```text
created → credits_reserved → provider_submitted → provider_processing
→ provider_output_ready → asset_persisting → completed
```

Ergebnisklassen und ihre Folgen:

| Ergebnis | Folge |
| --- | --- |
| `provider_failed` | Erstattung (genau eine, idempotent) |
| `provider_cancelled_confirmed` | Erstattung gemäß tatsächlicher Kostenlage |
| `local_poll_timeout` | **keine** Erstattung; Lauf bleibt offen, Abgleich läuft weiter |
| `provider_success` | Ausgabe in den eigenen Speicher übernehmen |
| `asset_persist_failed` | Speicherung erneut versuchen; **kein** zweiter Provider-Lauf, keine automatische Erstattung |

Ein Abgleich-Job prüft offene Läufe später erneut beim Provider, bis ein autoritatives Ergebnis vorliegt. `completed` wird erst gesetzt, wenn die Datei im eigenen Speicher liegt — eine Provider-URL wird nie als dauerhafte Asset-Adresse gespeichert.

### 5. Poll + Webhook von Anfang an, eine idempotente Finalisierung

Persistiert werden `provider_prediction_id`, `provider_status`, `provider_output_url`, `provider_completed_at`. Poller und Webhook laufen in dieselbe Finalisierungsfunktion, geschützt über den Prediction-Key. Garantien (mit Tests): Webhook zuerst + Poll später = genau ein Asset; Poll zuerst + Webhook später = genau ein Asset; Funktions-Retry = keine zweite Abbuchung und kein zweiter Provider-Lauf.

### 6. Nicht-destruktive Lineage

Quelle bleibt erhalten, der Master ist ein Kind-Asset (`Seedance-Szene → Lip-Sync → Stitch → 4K-Master`). Mediathek zeigt beide, Vorher/Nachher-Vergleich wie im Picture Studio.

### 7. Empfehlung aus Asset-Metadaten

`recommendEnhancement({ sourceModel, resolution, fps, duration, destination })`, zentral und für alle Oberflächen gleich:

- Seedance 720p/24 → Reels: „ByteDance vCube · AIGC · 1080p/30 empfohlen" (nicht 4K/60 verkaufen)
- Kamera-Upload 1080p → YouTube 4K: „Topaz Video Upscale · 4K/30 empfohlen"
- bereits 4K/30 auf 4K-Ziel: „Schon optimal — Verbesserung nicht nötig"

### 8. Dreistufige Freischaltung

Frontend-Flag (Sichtbarkeit), Backend-Schalter (maßgeblich), Test-Allowlist für echte Läufe. Beide Modelle starten gesperrt.

## Freigabekriterien vor globaler Aktivierung

Pro Modell mehr als nur Erfolg + Fehler:

- **Topaz**: kleiner 1080p-Lauf · 4K/60-Lauf mit kürzestmöglicher Dauer · Provider-Fehler mit genau einer Erstattung · Persistenz-Retry
- **ByteDance**: Standard + AIGC · Pro nur bei bestätigter Freischaltung · mindestens zwei Auflösungs-/FPS-Kombinationen zur Tarifprüfung · Provider-Fehler mit genau einer Erstattung · Persistenz-Retry
- **Immer**: vorhergesagte Providerkosten gegen die tatsächliche Replicate-Abrechnung; Abweichung = Tarifkarte korrigieren, nicht freischalten. Sehr kurze Clips genügen.

## Stufe 2 — Einstiegspunkte (in dieser Reihenfolge)

| Ort | Umfang |
| --- | --- |
| AI Video Studio | Voller Enhance-Bereich: Modellkarten, Auflösung/FPS nur in gültigen Kombinationen, ByteDance-Zusatz (Scene, Tier), Preisvorschau, Vergleich |
| Mediathek / Video-Lightbox | Schnellaktion „Video verbessern" auf jedem vorhandenen Video |
| Nach jeder Generierung | Ergebnis-Aktion „Verbessern" neben Download/Posten |
| Motion Studio | Optionaler Schritt vor dem Export, vereinfacht (siehe unten) |
| Director's Cut | Finaler Mastering-Schritt, gleiche vereinfachte Auswahl |
| Universal Content Creator | Nur „Qualität verbessern" mit Empfehlungszeile und „Ändern" |

**Vereinfachte Auswahl in Motion Studio und Director's Cut** — Auflösung ist nicht die erste Entscheidung:

```text
Finale Qualität
  Original            keine Verbesserung
  Empfohlen           ByteDance vCube · 1080p/30 — bestes Verhältnis für dieses Projekt
  Hohe Qualität       ByteDance vCube · 4K/30
  Eigene Einstellung  → Modell · Auflösung · FPS · Scene · Tier
```

Der Altpfad `director-cut-upscale` wird abgelöst, sobald der Director's-Cut-Einstieg steht.

## Was in dieser Stufe nicht passiert

Keine Änderung an Video-Generierung, Lip-Sync, Rendering, Wallet-Grundlogik oder bestehenden Preisen. Enhance ist immer optional und additiv.

## Technische Details

- Neue Dateien: `src/config/videoEnhanceModels/{index,types,models,flags}.ts`, `src/lib/videoEnhance/{rates,pricing,lineage,recommend}.ts`, `src/hooks/useEnhanceVideo.ts`, `supabase/functions/video-enhance/index.ts`, `supabase/functions/video-enhance-webhook/index.ts`, `supabase/functions/video-enhance-reconcile/index.ts`, `supabase/functions/_shared/video-enhance-models.ts` (Server-Spiegel mit Parity-Test).
- Migration für `video_enhance_runs` inkl. GRANTs und besitzergebundener RLS: Statusfeld nach obigem Lebenszyklus, Prediction-Key mit Eindeutigkeitsbedingung (Idempotenz), Erstattungsmarker, Preis-Snapshot, Elternbezug für die Lineage. Ergebnis-Asset in der bestehenden Video-Persistenz (`video_creations`).
- Tests: Registry↔Server-Parität, Kombinationsvalidierung (ungültige Auflösungs-/FPS-Paare abgelehnt), Preis-Fixtures über alle Einstiegspunkte, Idempotenz für Webhook-vor-Poll / Poll-vor-Webhook / Funktions-Retry, `local_poll_timeout` erstattet nie, `asset_persist_failed` startet nie einen zweiten Provider-Lauf, Empfehlungs-Matrix (Quelle × Ziel × Kanal), EN/DE/ES-Parität aller neuen Texte.
- Aufgabe wird zu Beginn in `roadmap.md` eingetragen.
