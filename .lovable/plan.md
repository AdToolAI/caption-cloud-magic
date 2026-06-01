## Was passiert

Bei der 3-Sprecher-Szene `fda8ac16…` (Matthew, Samuel, Kailee) zeigt der Sync.so Dispatch-Log ein klares Muster:

| Pass | Speaker | coords-pro | auto-pro |
|------|---------|-----------|----------|
| 0 | Matthew | ❌ "An unknown error occurred" | ✅ erfolgreich |
| 1 | Samuel  | ❌ "An unknown error occurred" | ✅ erfolgreich |
| 2 | Kailee  | ❌ "An unknown error occurred" | — nie versucht → Refund + Fail |

**Zwei kombinierte Bugs:**

1. **Shared retry budget über alle Passes.** `sync-so-webhook` schreibt `retry_count` auf das *Top-Level* `dialog_shots`-State (Zeile 502), nicht pro Pass. Mit `MAX_V5_RETRIES = 2` ist das Budget nach Pass 0 + Pass 1 schon aufgebraucht. Pass 2 (Kailee) bekommt nach ihrem ersten coords-pro Fail keinen Retry mehr → Refund + Szene `failed`.

2. **Lernen pro Szene fehlt.** Wenn Pass 0 von `coords-pro` → `auto-pro` springen musste, weiß der Dispatcher nicht, dass `coords-pro` in dieser Szene generell nicht funktioniert. Pass 1 und 2 starten trotzdem wieder mit `coords-pro` → garantierter Fehlversuch.

Das ist genau der Grund warum sich die User-Beschwerde "Lipsync schlägt fehl" speziell bei 3 Sprechern reproduziert: Mit 1–2 Sprechern reicht das Shared-Budget noch.

## Fix

### 1. Per-Pass Retry-Budget (`sync-so-webhook/index.ts`)
- `retry_count` und `retry_variant` zukünftig **auf dem Pass-Objekt** speichern (`passes[currentPass].retry_count` / `.retry_variant`), nicht auf dem Top-Level-State.
- `MAX_V5_RETRIES = 2` bleibt — gilt nun pro Pass. Jeder Sprecher darf die volle Ladder `coords-pro → auto-pro → auto-standard` durchgehen.
- Top-Level `retry_count` bleibt nur als aggregierter Diagnostic-Wert erhalten.

### 2. Szenen-weite Variant-Empfehlung (`compose-dialog-segments/index.ts`)
Im Dispatcher (um Zeile 852) vor der Variant-Auswahl prüfen: Wenn ein vorheriger Pass in derselben Szene erfolgreich mit `auto-pro` oder `auto-standard` abgeschlossen hat, starte den nächsten Pass **direkt mit dieser Variante**, statt erneut bei `coords-pro` anzufangen.
- Quelle: `passes.find(p => p.status === 'done')?.retry_variant`.
- Greift nur als Default — explizit angeforderte `retry_variant` (vom Webhook-Retry) gewinnt weiterhin.

### 3. UI-Hinweis bleibt
"Bitte ‚Lip-Sync neu rendern' klicken" zeigt der Composer bereits an. Nach dem Fix wird dieser Resume-Pfad nun durchlaufen, ohne dass die letzten Sprecher in derselben Falle hängen bleiben.

## Verifikation
1. Failed Szene `fda8ac16…` zurücksetzen (`lip_sync_status='pending'`, `dialog_shots` Pass 2 auf `pending`, Refund-Flag prüfen).
2. „Lip-Sync neu rendern" klicken.
3. Erwartet: Pass 2 startet direkt mit `auto-pro` (gelernt aus Pass 0/1), Szene endet als `ready` / `applied`.
4. Dispatch-Log gegenchecken: keine erneute `coords-pro`-Runde für Pass 2.

## Nicht im Scope
- Root-Cause warum Sync.so bei `coords-pro` „unknown error" liefert (Provider-seitig, separates Memo `syncso-stage-g-auto-normalize-and-face-quality` deckt Face-Quality-Heuristiken bereits ab).
- Keine Änderungen am 2-Speaker-Pfad oder an `compose-twoshot-lipsync`.
- Keine UI-Änderungen.
