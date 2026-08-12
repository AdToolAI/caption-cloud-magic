# Urteil zur Analyse + Härtungsplan (v427)

Die Analyse ist gut. Ich habe alle sechs Kritikpunkte im Code nachgeprüft — fünf treffen zu, einer nur zur Hälfte. Nichts davon verlangt einen Umbau, alles sind Übergänge, die abgesichert werden müssen.

## Was ich verifiziert habe

| Punkt | Befund im Code |
|---|---|
| Dauer zu spät berechnet | **Bestätigt.** Guthabenprüfung in `compose-video-clips` (Zeile 377–410) rechnet mit `scene.durationSeconds`; das Cinematic-Sync-Auto-Extend läuft erst ab Zeile 2046 — also nach Provider- und Kostenprüfung. |
| `ready` vor Lip-Sync | **Bestätigt.** `compose-clip-webhook` (Zeile 197) setzt `clip_status: 'ready'` und im selben Update `lip_sync_status: 'pending'`. Eine Dialogszene gilt damit als fertig, obwohl nur die Platte steht. |
| Kein Escrow | **Bestätigt.** `credit_reservations` und die Funktionen `credit-reserve/commit/refund` existieren, werden vom Composer-Pfad aber nicht benutzt: dort nur Balance-Check vorne, `deduct_ai_video_credits` hinten (Zeile 4885+). |
| TTL kürzer als Providerlauf | **Bestätigt.** `PARK_TTL_MINUTES = 15` in `continuity-chain.ts` gegen `TASK_TIMEOUT_MS = 25 min` in `modelark-poll`. |
| Alte Webhooks | **Halb.** `compose-clip-webhook` und `modelark-poll` prüfen `active_run_id`. `sync-so-webhook` und `render-sync-segments-audio-mux` tun das nicht — dort kann ein Nachzügler noch schreiben. Eine `provider_job_id`-Prüfung gibt es nirgends. |
| Storyboard nur im State | **Bestätigt.** `onScenesGenerated` (BriefingTab Zeile 453) reicht die Szenen nur an den Dashboard-State weiter; persistiert wird erst beim Speichern/Rendern. |

## Umsetzung

### 1. Ein Dauervertrag pro Run (unveränderlich)

Die Kritik ist berechtigt: „schätzen“ reicht nicht, und die Dauer gehört zum Run, nicht dauerhaft zur Szene.

**Feste Reihenfolge vor jedem kostenpflichtigen Dispatch:**
Auth/Ownership → Dialog kanonisieren → Provider-/Engine-Zulässigkeit (dauerunabhängig) → Sprach-/Audiotimeline bestimmen → `required_duration_ms` → Aufrunden auf das nächste zulässige Providerfenster → Dauervertrag validieren → Preis → Guthaben reservieren → Run-Snapshot atomar speichern → Dispatch.

**Audiodauer wird gemessen, nicht geraten.** Der Audio-Plan (TTS/Turns) entsteht **vor** dem Videojob:
`required_duration_ms = max(end_time aller dialog_turns) + tail_padding_ms` (400 ms Standardpuffer). Damit macht ein TTS-Fehler keinen bereits bezahlten Videojob unbrauchbar. Nur wenn kein Audio-Plan möglich ist, greift die Textschätzung — dann mit konservativem Aufschlag und derselben späteren Assertion.

**Snapshot-Felder pro Run** (auf der Szene, gebunden an `active_run_id`):
`requested_duration_seconds`, `required_duration_ms`, `effective_duration_seconds`, `billable_duration_seconds`, `duration_run_id`, `quoted_cost_euros`, `duration_policy_version`.
Vertrag: Sobald reserviert und gestartet, sind effektive Dauer, abrechenbare Dauer und Preis für diesen Run eingefroren. Dialog-, Stimmen-, Provider- oder Tempoänderung sowie Rerender erzeugen eine neue `run_id` und damit einen neuen Snapshot. Jeder Leser/Writer prüft `duration_run_id = active_run_id`.

**Eine zentrale Dauer-Policy, keine dritte Liste.** `DurationPolicy` (`discrete` mit `valuesSeconds`, bzw. `range` mit min/max/step) liegt neben `lipsyncMasterProvider.ts` und wird nach `_shared/composer-ai-sources.ts` gespiegelt; Hailuo `[6,10]`, HappyHorse 3–15/1, Seedance 2.5 4–30/1. Eine reine Funktion `resolveEffectiveDuration(requiredSeconds, policy)` bedient UI, Servervalidierung, Preis und Tests.

**Immer aufrunden, nie klemmen.** 6,01 s bei Hailuo → 10 s; 10,01 s → Abbruch vor Dispatch mit klarer Meldung („Der Dialog braucht 10,8 s. Hailuo unterstützt hier nur 6 oder 10 s — kürze den Dialog oder wähle HappyHorse.“). Kein stiller Providerwechsel.

**Auto-Extend (Zeile 2046) wird zur reinen Kontrollschranke.** Es verändert keine Dauer, keinen Preis, keinen Providervertrag und bucht nichts nach. Liegt die gemessene Sprache über dem Snapshot, wird der Lauf als `duration_contract_drift` markiert und bricht ab statt still zu verlängern.

**Fortschritt bleibt ereignisbasiert.** Die effektive Dauer dient nur ETA, Gewichtung und Kostenanzeige — nicht der Prozentkurve.

**Grenztests vor dem Merge:** Hailuo 5,99→6 / 6,01→10 / 10,01→Fehler ohne Dispatch und ohne Belastung; HappyHorse 2,4→3 / 14,2→15 / 15,01→Fehler; Dialogänderung → neue run_id, neue Dauer, neuer Preis; alter Run-Webhook verändert Dauer/Kosten des neuen Runs nicht; gemessene Audiodauer > Snapshot → Contract-Drift.


### 2. `ready` heißt fertig
Der Provider-Webhook setzt künftig `base_clip_ready`. `ready` wird ausschließlich am Ende gesetzt — nach Mux bzw. sofort, wenn die Szene kein Lip-Sync braucht. Dasselbe Gate (`clip_status = ready AND (kein Lip-Sync ODER lip_sync_status = done)`) gilt für Vorschau, Export, Projektabschluss und Benachrichtigung.

### 3. Echtes Guthaben-Ledger
Der Composer nutzt die vorhandene Reserve-Commit-Refund-Kette: atomare Reservierung pro Run vor dem Dispatch, Umwandlung in Abbuchung nach erfolgreichem Start, Freigabe für nicht gestartete Szenen, Erstattung anhand des **gespeicherten** Betrags pro Szene (nicht anhand der tagesaktuellen `CLIP_COSTS`).

### 4. Providerabhängige Lease
Statt pauschal 15 Minuten: `provider_timeout + Polling- und Webhook-Toleranz`, für ModelArk also 30 Minuten. Zusätzlich ein Heartbeat, der die Lease verlängert, solange der Providerjob nachweislich läuft.

### 5. Nachzügler hart abweisen
Jeder Schreibpfad (`compose-clip-webhook`, `modelark-poll`, `sync-so-webhook`, `render-sync-segments-audio-mux`) schreibt nur bei passender `active_run_id` **und** passender Provider-Job-ID. Sonst: `stale_callback` protokollieren, keine Mutation. Die Job-ID wird beim Dispatch auf der Szene abgelegt.

### 6. Storyboard sofort als Entwurf
Direkt nach `onScenesGenerated` wird ein versionierter Entwurf persistiert (Briefing-Hash, Erzeugungsmodus, Zeitstempel), danach Debounce-Autosave bei manuellen Änderungen. Beim Öffnen wird ein neuerer Entwurf angeboten statt still verworfen.

### 7. UX-Klarheit (aus deiner Analyse übernommen)
- Zwei verständliche Einstiege statt Technikbegriffen: „Aus einer Idee erstellen“ und „Fertiges Skript importieren“, mit Live-Vorschau neben dem Eingabefeld (erkannte Sprecher, Dialogzeilen, nicht zugeordnete Zeilen).
- Statt „Generating“ echte Phasen: wartet auf vorherige Szene / Video wird generiert / Dialog wird vorbereitet / Lip-Sync / Zusammenführen / Export.

## Reihenfolge
1–2 zuerst (Geld- und Fertig-Semantik), dann 5 und 4 (Datenintegrität unter Last), dann 3, dann 6–7.
