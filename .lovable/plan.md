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

### 1. Eine unveränderliche Dauer
`effective_duration_seconds` wird **vor** allem anderen bestimmt: VO/Dialog schätzen → auf das Providerraster normalisieren (Hailuo 6/10, HappyHorse 3–15, Seedance 4–30) → dann Providervertrag prüfen → dann Preis. Passt die Sprache nicht ins Providerfenster, bricht der Lauf mit klarer Meldung ab statt später still zu überziehen. Der Wert wird auf der Szene gespeichert und von Kalkulation, Abbuchung, Fortschritt und Render gleichermaßen gelesen. Das Auto-Extend an Zeile 2046 verliert damit seine Rolle als heimlicher Dauer-Änderer.

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
