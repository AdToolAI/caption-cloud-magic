

# Status-Check: Lambda-Skalierungsplan

Kurze ehrliche Antwort: **Nein, nicht zu 100%.** Phase 0 und Phase A sind teilweise umgesetzt, ab Phase B steht noch alles aus. Hier der genaue Stand pro Punkt — und was zu tun ist, um es **wirklich auf 100%** zu bringen.

## Aktueller Umsetzungsstand

### ✅ Erledigt

| Punkt | Status | Beleg |
|---|---|---|
| Circuit Breaker schärfen — Threshold 15%, MIN_SAMPLE=10 | ✅ erledigt | `lambda-circuit-breaker/index.ts` Zeilen 44-46 (THRESHOLD=0.15, MIN_SAMPLE=10) |
| DB-Defaults Phase A | ✅ erledigt | Code zeigt `NORMAL=25`, `SAFE=15` als Fallbacks |
| Render-Queue-Manager existiert | ✅ erledigt | Sequenzielle Verarbeitung läuft |

### ⚠️ Teilweise / Inkonsistent

| Punkt | Problem |
|---|---|
| **UI-Fallback `?? 6`** | Im Plan steht „Zeile 65 ?? 6 → ?? 25 fixen". **Aktueller Code hat schon `?? 25`** (Zeile 65). Ist also fertig — ABER: in `ProviderHealth.tsx` steht im Erklär-Block am Ende noch der alte Text *„Lambda-Concurrency wird vom Circuit Breaker automatisch zwischen 3 und 6 angepasst"*. Das stimmt nicht mehr — muss auf 15 ↔ 25 aktualisiert werden. |
| **DB `system_config` Werte** | Müssen verifiziert werden — Code hat zwar Fallbacks auf 25/15, aber unklar ob die Werte in der DB tatsächlich gesetzt sind. Muss per Read-Query geprüft werden. |
| **AWS Reserved Concurrency = 30** | Außerhalb meines Zugriffs. Nur in AWS Console manuell setzbar. Status unbekannt. |

### ❌ Noch offen (Phase 0 + alle weiteren Phasen)

- **Monitoring-Alerts** für Circuit Breaker / OOM / Queue-Backlog → keine Edge Function dafür existiert
- **Manueller Kill-Switch im Admin-UI** → fehlt komplett
- **Phase B**: erweitertes Lambda-Logging (Cold-Start, Memory-Peak), `stress-test-lambda` Edge Function, Stresstest-Button
- **Phase C**: Batch-Trigger im `render-queue-manager` (aktuell strikt sequenziell, Zeilen 24-32 holen `.limit(1)`), S3-Lifecycle-Policy
- **Phase D**: Pre-warmed Lambda Instances (AWS-seitig)

## Was ich jetzt vorschlage: Phase 0 wirklich auf 100% bringen

Bevor wir an Phase B denken, schließen wir Phase 0 sauber ab. Vier kompakte Schritte:

### Schritt 1 — DB-Werte verifizieren & setzen

Per Read-Query aktuelle Werte aus `system_config` lesen, dann gezielt Updates für die Phase-A-Konfiguration:

```
lambda_max_concurrent           = 25
lambda_max_concurrent_safe      = 15
lambda_circuit_breaker_threshold = 0.15
lambda_circuit_breaker_window_min = 10
lambda_circuit_breaker_min_sample = 10
```

Falls Keys fehlen → INSERT, falls vorhanden → UPDATE.

### Schritt 2 — UI-Konsistenz herstellen

In `src/pages/admin/ProviderHealth.tsx`:
- Erklär-Text am Ende: *„zwischen 3 und 6"* → *„zwischen `lambda_max_concurrent_safe` und `lambda_max_concurrent` (aktuell 15 ↔ 25)"*
- Werte dynamisch aus DB ziehen statt hartcodieren, damit der Text bei Phase B/C/D nicht erneut angefasst werden muss

### Schritt 3 — Kill-Switch ins Admin-UI

Neuer Button in `ProviderHealth.tsx` („Notfall: auf 10 zurück"):
- Schreibt `lambda_max_concurrent = 10` in `system_config`
- Toast-Bestätigung
- Nur sichtbar für Admin-Rolle (`has_role(auth.uid(), 'admin')`)

### Schritt 4 — Monitoring-Alert (Edge Function `lambda-health-monitor`)

Neue Edge Function als Cron (alle 5 Min), die diese drei Bedingungen prüft und bei Trigger eine E-Mail an Admins schickt (über bestehende Resend-Integration falls vorhanden, sonst nur DB-Log in `alert_notifications`):

| Bedingung | Schwelle |
|---|---|
| Circuit Breaker tripped | `system_config.lambda_max_concurrent` < `lambda_max_concurrent_safe` |
| OOM-Errors | ≥5 Einträge mit `status='oom'` in letzter Stunde |
| Queue-Backlog | ≥20 Jobs `status='queued'` älter als 10 Min |

Cooldown 60 Min pro Alert-Typ, um Spam zu vermeiden.

## Geänderte Dateien (für die endgültige Phase-0-Komplettierung)

1. `src/pages/admin/ProviderHealth.tsx` — Kill-Switch-Button + dynamische Werte im Erklär-Text
2. `supabase/functions/lambda-health-monitor/index.ts` — neue Cron-Function (Alerting)
3. `supabase/config.toml` — Eintrag für neue Function (verify_jwt = false)
4. DB-Updates: `system_config` Phase-A-Werte explizit setzen
5. DB: pg_cron-Eintrag, der `lambda-health-monitor` alle 5 Min triggert

## Wichtig: Was ICH nicht machen kann

- **AWS Reserved Concurrency** auf 30 setzen → musst du im AWS Console machen (Lambda → `remotion-render-...` → Configuration → Concurrency → Reserve account concurrency = 30)
- **AWS Budget Alert** einrichten → AWS Console → Billing → Budgets

Sag mir kurz Bescheid, wenn du das AWS-seitig erledigt hast — dann sind wir Phase-0-komplett und können nach 7 Tagen sauberer Metriken Phase B starten.

## Nach Approval

Sobald genehmigt: ich verifiziere die DB-Werte, setze sie ggf., baue Kill-Switch + Health-Monitor, deploye die neue Function und richte den Cron-Job ein. Danach läuft Phase 0 wirklich auf 100%.

