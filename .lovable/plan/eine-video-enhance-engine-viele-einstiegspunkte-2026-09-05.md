# Eine Video-Enhance-Engine, viele Einstiegspunkte

Genau wie im Picture Studio: das schwierige Stück (Modelle, Preise, Wallet, Erstattung, Speicherung, Vorher/Nachher) wird **einmal** gebaut. Alle Oberflächen rufen dieselbe Engine auf. Stufe 1 ist das Kernstück — die Buttons in den Studios kommen erst danach.

## Was heute existiert (geprüft)

- `director-cut-upscale` ist ein Altpfad: fester Credit-Tarif (15/25/50), veraltete Replicate-Version, ein Simulationsmodus ohne echtes Ergebnis, direkte Wallet-Abbuchung ohne Erstattung und ohne Speicherung des Ergebnisses. Der wird ersetzt, nicht erweitert.
- Die Bild-Seite hat bereits alles Richtige: Registry + Flags (`src/config/pictureModels`), Rate Cards/FX/Margen-Kurve (`src/lib/pictureModels`), Server-Spiegel (`_shared/picture-enhance-models.ts`), Lineage, Erstattungslogik. Die Video-Engine folgt diesem Muster — mit den video-spezifischen Verschärfungen unten.

## Architektur

```text
                 video-enhance  (eine Edge Function)
                         │
      ┌──────────────────┼──────────────────┐
   Topaz-Adapter   ByteDance-Adapter   (später weitere)
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
- `topaz-video-upscale` — zunächst bis 60 FPS gemäß aktuellem offiziellem Schema. Werte aus älteren Modellversionen werden nicht vermischt; die Registry hält fest, auf welche Endpoint-/Schema-Fassung sie sich bezieht.
- Jede Einschränkung ist serverseitig verbindlich; eine ungültige Kombination wird abgelehnt, nicht stillschweigend korrigiert.
- Keine weiteren Upscaler in V1. Crystal/SeedVR2 werden erst geprüft, wenn Topaz und ByteDance an echten AdTool-Clips gemessen sind — und nur, wenn sie einen klar unterscheidbaren Qualitätsbereich abdecken. Bis dahin tauchen sie in der produktiven Modellauswahl nicht auf.

### 2. ByteDance Pro als Berechtigung, nicht als Auswahl

`standard` ist verfügbar; `pro` nur, wenn `providerEntitlementVerified` gesetzt ist — also nach einem echten Pro-Lauf über den AdTool-Replicate-Account. Vorher taucht Pro in keiner Oberfläche auf.

### 3. Quell-Metadaten kommen vom Server, nicht vom Client

Dauer, Breite, Höhe, FPS, Codec/Container und Dateigröße werden **nie** aus dem Request übernommen. Vor Preisberechnung, Capability-Prüfung und Provider-Start liest die Engine die Werte aus dem eigenen Asset-Datensatz oder misst sie an der Quelldatei; Abweichungen zum Client-Vorschlag führen zur Ablehnung. Empfehlung, Validierung und Preis hängen unmittelbar daran.

### 4. Preis-Engine mit providerspezifischen Tarifkarten

Keine generische `Sekunden × Auflösungsfaktor × FPS-Faktor`-Formel. Die Registry unterstützt mehrere Tariftypen:

- `per_second_matrix` — `processingType × resolution × fps → USD/sec` (ByteDance, explizite Matrix aus der veröffentlichten Preistabelle)
- `per_output_second`
- `per_unit` (Topaz auf Replicate)
- `tiered`

Danach wie bei Bildern: FX-Kurs mit Sicherheitspuffer → Margen-Kurve → Deckungsbeitrags-Floor → Endpreis. Ein geteilter Fixture-Test beweist: gleiche Konfiguration = gleicher Preis in Studio, Mediathek, Motion Studio, Director's Cut, Content Creator. Jede Tarifkarte trägt Quelle und Prüfdatum; unbestätigte Werte sind als `costUnverified` markiert und blockieren die globale Freischaltung.

**Preis einfrieren:** Der angezeigte Betrag gilt. Vor dem Provider-Start wird der vollständige Snapshot am Lauf gespeichert — `rateCardVersion`, `providerCostEstimatedUsd`, `fxRate`, `fxBuffer`, `marginCurveVersion`, `userPriceEUR`, `creditsReserved`. Nach dem Lauf kommen `providerCostActualUsd`, `actualContributionEUR`, `actualMarginPct` dazu. Ein höherer Ist-Preis beim Provider wird **nie** nachträglich abgebucht.

**Abweichungs-Überwachung:** Weichen die Ist-Kosten wiederholt über einen konfigurierbaren Toleranzbereich von der Tarifkarte ab, gibt es eine Admin-Warnung und optional automatisch `costUnverified = true` — ein Notaus für neue Läufe dieses Modells. Kein Abschalten wegen einzelner Cent-Abweichungen; eine unangekündigte Preisänderung beim Provider frisst aber nicht stundenlang die Marge.

### 5. Idempotenz beginnt vor dem Provider-Aufruf

Jeder Request trägt einen `idempotency_key` (Client-Request-ID) mit Eindeutigkeit **pro Nutzer**: `UNIQUE(user_id, idempotency_key)`.

```text
Request → INSERT run (UNIQUE user_id + idempotency_key)
        → Credits reservieren (Ledger-Schlüssel video_enhance:{runId}:reserve)
        → Callback-Token erzeugen und speichern
        → Submit-Claim (Lease) setzen, Zustand provider_submitting
        → Provider genau einmal starten, Webhook-URL trägt den Token
        → provider_prediction_id speichern
```

Derselbe Schlüssel erneut (Doppelklick, Netz-Retry, parallele Aufrufe): der bestehende Lauf wird zurückgegeben — keine zweite Reservierung, kein zweiter Provider-Job.

**Absturz-Wiederherstellung über den Callback-Token, nicht über eine Prediction-Suche.** Replicate bietet keinen dokumentierten Weg, Predictions anhand einer internen AdTool-Lauf-ID zu finden — darauf darf sich nichts verlassen. Stattdessen wird **vor** dem Absenden ein undurchsichtiger, signierter Token erzeugt und persistiert; die Webhook-URL lautet `/video-enhance-webhook?callback=<token>`. Kein `run_id` im Klartext, da URL-Parameter nicht Teil der Provider-Signatur sind. Stürzt die Funktion nach der Annahme durch den Provider ab, bevor die Prediction-ID gespeichert ist, trifft der Webhook trotzdem ein: Token → Lauf bestimmen → Provider-Signatur samt Zeitstempel prüfen (Replay-Schutz) → Prediction-ID aus dem verifizierten Ereignis übernehmen → Zustand beim Provider autoritativ nachlesen → Lauf reparieren und fortsetzen. Solange der Lease gilt, sendet kein Worker blind ein zweites Mal ab.

### 6. Lebenszyklus und Wallet-Semantik

```text
created → credits_reserved → provider_submitting → provider_submitted
→ provider_processing → provider_output_ready → asset_staging
→ asset_persisting → completed
```

| Ergebnis | Wallet | Weiteres |
| --- | --- | --- |
| `provider_failed` | Reservierung genau einmal freigeben | keine Wiederholung ohne neue Nutzeraktion |
| `cancel_requested` | **unverändert** | Abbruch an den Provider senden, weiter abgleichen |
| `provider_cancelled_confirmed` | Freigabe gemäß tatsächlicher Kostenlage | erst hier fällt die Geldentscheidung |
| `local_poll_timeout` | **unverändert**, keine Erstattung | Lauf bleibt offen, Abgleich läuft weiter |
| `provider_success` | Belastung gemäß eingefrorenem Snapshot | Ausgabe übernehmen |
| `asset_persist_failed` | **unverändert** | Speicherung erneut versuchen; kein zweiter Provider-Lauf |

Ein Klick auf „Abbrechen" ist ein Wunsch, kein Ergebnis: `cancel_requested` löst nie eine Erstattung aus. Erst wenn der Provider den Abbruch autoritativ bestätigt und die tatsächliche Kostenlage bekannt ist, wird Geld bewegt.

Verbindlich für alle fünf Einstiegspunkte: Reservierung vor dem Provider-Start, endgültige Belastung nur bei Provider-Erfolg mit dem eingefrorenen Betrag, genau eine Freigabe bei endgültigem Provider-Fehler, und Persistenz-Wiederholungen berühren die Wallet nie.

**Geldbewegungen doppelt gesichert:** Zusätzlich zu den Statusprüfungen ist jede Wallet-Operation selbst idempotent, über eindeutige Ledger-Schlüssel `video_enhance:{runId}:reserve` / `:capture` / `:release`. Selbst wenn Webhook, Poller und Retry gleichzeitig laufen und eine Statusprüfung versagt, kann kein Betrag zweimal bewegt werden.

**Quell-Video muss lange genug erreichbar sein:** Provider-Eingaben kommen ausschließlich aus dauerhaftem AdTool-Speicher oder aus serverseitig erzeugten signierten URLs, deren Gültigkeit den maximal erwarteten Warteschlangen- und Startzeitraum deutlich überschreitet. Sonst läuft die URL in der Warteschlange ab und der Job scheitert grundlos.

**Speicherung:** Sobald der Provider fertig ist, wird die Datei **sofort** in einen eigenen Zwischenspeicher (Staging-Key) kopiert — bevor irgendetwas anderes passiert. Provider-Dateien sind ausdrücklich kein dauerhafter Speicher und werden nach begrenzter Zeit entfernt; bei einem längeren Datenbankproblem wäre ein bezahltes Ergebnis sonst verloren. Die Provider-URL lebt nur als temporäre Laufdaten für Wiederholversuche, wird nach erfolgreicher Übernahme entfernt und ist niemals die URL eines fertigen Assets.

**Ausgabe prüfen, bevor Asset und Belastung entstehen:** Im Zwischenspeicher wird serverseitig geprüft — Datei vorhanden und nicht leer, erwarteter Container/MIME, dekodierbares Video, plausible Dauer, Auflösung und FPS innerhalb definierter Toleranzen. Erst danach entstehen das Asset in `video_creations` und der Zustand `completed`. Eine ungültige Ausgabe wird nie als fertig markiert.

**Zwischenspeicher aufräumen:** Nach erfolgreicher Übernahme wird die Staging-Datei gelöscht; ein geplanter Lauf entfernt zusätzlich verwaiste Staging-Objekte abgebrochener oder hängengebliebener Läufe, damit sich keine großen Videodateien ansammeln.

**Abgleich mit Ende:** Der Lauf trägt `reconciliation_attempts`, `last_reconciled_at`, `next_reconcile_at` (Backoff). Bleibt ein Lauf nach einem definierten Horizont ohne autoritatives Provider-Ergebnis, geht er in `manual_review` — sichtbar im Admin („3 hängende Video-Verbesserungen"), aber **ohne** automatische Erstattung. Dort gibt es echte Aktionen statt nur einer Anzeige: jetzt abgleichen · Provider-Vorgang ansehen · Speicherung erneut versuchen · Fall manuell finanziell abschließen. Jede manuelle Aktion wird protokolliert.

### 7. Poll + Webhook von Anfang an, eine verifizierte Finalisierung

Persistiert werden `provider_prediction_id`, `provider_status`, `provider_output_url`, `provider_completed_at`. Poller und Webhook laufen in dieselbe idempotente Finalisierung, geschützt über den Prediction-Key.

Ein Webhook wird nie blind übernommen: die Signatur/Authentifizierung des Providers wird geprüft, soweit unterstützt, und der Zustand zusätzlich serverseitig über die Prediction-ID beim Provider nachgelesen. Erst wenn Prediction↔Lauf, Modell, Status und Ausgabe-Zugehörigkeit stimmen, wird persistiert. Keine URL aus Client- oder Webhook-Body wird ungeprüft übernommen.

Garantien (mit Tests): Webhook zuerst + Poll später = genau ein Asset; Poll zuerst + Webhook später = genau ein Asset; Funktions-Retry = keine zweite Abbuchung und kein zweiter Provider-Lauf.

### 8. Nicht-destruktive Lineage

Quelle bleibt erhalten, der Master ist ein Kind-Asset (`Seedance-Szene → Lip-Sync → Stitch → 4K-Master`). Mediathek zeigt beide, Vorher/Nachher-Vergleich wie im Picture Studio.

### 9. Empfehlung aus Asset-Metadaten

`recommendEnhancement({ sourceModel, resolution, fps, duration, destination })`, zentral und für alle Oberflächen gleich:

- Seedance 720p/24 → Reels: „ByteDance vCube · AIGC · 1080p/30 empfohlen" (nicht 4K/60 verkaufen)
- Kamera-Upload 1080p → YouTube 4K: „Topaz Video Upscale · 4K/30 empfohlen"
- bereits 4K/30 auf 4K-Ziel: „Schon optimal — Verbesserung nicht nötig"

### 10. Dreistufige Freischaltung

Frontend-Flag (Sichtbarkeit), Backend-Schalter (maßgeblich), Test-Allowlist für echte Läufe. Beide Modelle starten gesperrt.

## Freigabekriterien vor globaler Aktivierung

- **Topaz**: kleiner 1080p-Lauf · 4K/60-Lauf mit kürzestmöglicher Dauer · Provider-Fehler mit genau einer Freigabe · Persistenz-Retry
- **ByteDance**: Standard + AIGC · Pro nur bei bestätigter Freischaltung · mindestens zwei Auflösungs-/FPS-Kombinationen zur Tarifprüfung · Provider-Fehler mit genau einer Freigabe · Persistenz-Retry
- **Immer**: vorhergesagte gegen tatsächliche Providerkosten; Abweichung = Tarifkarte korrigieren, nicht freischalten. Sehr kurze Clips genügen.

Erst wenn Engine, Preise, Wallet, Abgleich und Speicherung an echten Clips stabil sind, folgt Stufe 2.

## Stufe 2 — Einstiegspunkte (in dieser Reihenfolge)

| Ort | Umfang |
| --- | --- |
| AI Video Studio | Voller Enhance-Bereich: Modellkarten, Auflösung/FPS nur in gültigen Kombinationen, ByteDance-Zusatz (Scene, Tier), Preisvorschau, Vergleich |
| Mediathek / Video-Lightbox | Schnellaktion „Video verbessern" auf jedem vorhandenen Video |
| Nach jeder Generierung | Ergebnis-Aktion „Verbessern" neben Download/Posten |
| Motion Studio | Optionaler Schritt vor dem Export, vereinfacht (siehe unten) |
| Director's Cut | Finaler Mastering-Schritt, gleiche vereinfachte Auswahl |
| Universal Content Creator | „Videoqualität verbessern" mit Empfehlungszeile, Zusatzkosten und „Ändern" |

**Vereinfachte Auswahl in Motion Studio und Director's Cut:**

```text
Finale Qualität
  Original            keine Verbesserung
  Empfohlen           bestes Verhältnis für dieses Projekt
  Hohe Qualität       maximale Qualität für dieses Projekt
  Eigene Einstellung  → Modell · Auflösung · FPS · Scene · Tier
```

„Empfohlen" und „Hohe Qualität" sind **semantische Absichten**, keine festen Konfigurationen. Modell, Verarbeitungsmodus, Auflösung und FPS werden jedes Mal aus Quell-Metadaten, Zielkanal und aktuellen Fähigkeiten berechnet — bei einem Kamera-Upload kann „Hohe Qualität" Topaz bedeuten, bei Seedance-Material ByteDance. Die gewählte Konfiguration wird immer sichtbar angezeigt.

**Reihenfolge:** In Motion Studio und Director's Cut arbeitet die Verbesserung standardmäßig auf dem **fertigen Master** nach Stitch, Übergängen und Lip-Sync — nie versehentlich auf Zwischenassets. Eine Verbesserung einzelner Szenen ist nur über eine ausdrückliche, getrennte Nutzeraktion möglich. Das spart Kosten und verhindert mehrfaches Hochskalieren.

Der Altpfad `director-cut-upscale` wird erst abgeschaltet, wenn nachgewiesen ist, dass alle Aufrufer auf `video-enhance` umgestellt sind: Codebase-Suche plus Telemetrie ohne aktive Nutzung, danach ein kurzes Rückfallfenster. Erst dann wird er deaktiviert und entfernt.

## Was in dieser Stufe nicht passiert

Keine Änderung an Video-Generierung, Lip-Sync, Rendering, Wallet-Grundlogik oder bestehenden Preisen. Enhance ist immer optional und additiv.

## Technische Details

- Neue Dateien: `src/config/videoEnhanceModels/{index,types,models,flags}.ts`, `src/lib/videoEnhance/{rates,pricing,lineage,recommend}.ts`, `src/hooks/useEnhanceVideo.ts`, `supabase/functions/video-enhance/index.ts`, `supabase/functions/video-enhance-webhook/index.ts`, `supabase/functions/video-enhance-reconcile/index.ts`, `supabase/functions/_shared/video-enhance-models.ts` (Server-Spiegel mit Parity-Test).
- Migration `video_enhance_runs` inkl. GRANTs und besitzergebundener RLS: Statusfeld nach obigem Lebenszyklus, `UNIQUE(user_id, idempotency_key)`, `provider_prediction_id` UNIQUE, Callback-Token (eindeutig, undurchsichtig), Submit-Claim/Lease-Felder, Reservierungs- und Belastungsmarker, Preis-Snapshot (Prognose und Ist getrennt), geprüfte Quell-Metadaten, Abgleichfelder (`reconciliation_attempts`, `last_reconciled_at`, `next_reconcile_at`), temporäre `provider_output_url`, Staging-Key, Elternbezug für die Lineage. Dazu ein Wallet-Ledger mit eindeutigem Operationsschlüssel (`video_enhance:{runId}:reserve|capture|release`) und ein Audit-Protokoll für manuelle Admin-Aktionen. Ergebnis-Asset in `video_creations`, immer mit AdTool-eigener Speicher-URL.
- Tests: Registry↔Server-Parität; Kombinationsvalidierung; Preis-Fixtures über alle Einstiegspunkte; eingefrorener Preis bleibt bei abweichenden Ist-Kosten unverändert; Kostenabweichung löst Warnung/Notaus aus; doppelter `idempotency_key` erzeugt genau einen Lauf und eine Reservierung; **Nebenläufigkeitstests für das Submit-Crash-Fenster** (Absturz nach Provider-Annahme, paralleler Wiederaufnehmer, Lease-Ablauf) erzeugen nie einen zweiten Provider-Job; **Wiederherstellung allein über den Callback-Token** (Prediction-ID war nie gespeichert) repariert den Lauf; doppelte Ledger-Operationen bewegen kein Geld zweimal; Abbruchwunsch parallel zum Provider-Erfolg erstattet nie fälschlich; abgelaufene oder ungültige Quell-URL wird vor dem Absenden erkannt; Client-Metadaten überschreiben nie die serverseitig gemessenen; Webhook-vor-Poll / Poll-vor-Webhook / Funktions-Retry = ein Asset; Webhook mit fremder, nicht passender oder wiederholt gesendeter Prediction wird abgelehnt; `local_poll_timeout` erstattet nie; `asset_persist_failed` startet nie einen zweiten Provider-Lauf; `manual_review` nach Horizont ohne Erstattung; Empfehlungs- und Preset-Matrix (Quelle × Ziel × Kanal); EN/DE/ES-Parität aller neuen Texte.
- Aufgabe wird zu Beginn der Umsetzung in `roadmap.md` eingetragen.
