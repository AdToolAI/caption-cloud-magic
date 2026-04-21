

# Plan: Sichere Skalierung auf 100–200 parallele Renders

## Strategie: 4 Stufen über 4 Wochen, mit automatischem Rückfall

Statt direkt auf 200 zu springen, gehen wir kontrolliert in Stufen hoch. Jede Stufe wird **mindestens 5–7 Tage** beobachtet. Der Circuit Breaker greift bei Problemen automatisch ein — kein manueller Eingriff nötig.

```text
Woche 1:  10 → 25   (sicherer Start, 2,5×)
Woche 2:  25 → 50   (deckt Marketing-Push ab)
Woche 3:  50 → 100  (skaliert für 1.000+ User)
Woche 4: 100 → 200  (Remotion-Maximum)
```

## Phase 0 — Vorbereitung (sofort, vor jeder Erhöhung)

Drei Dinge müssen **bevor** wir hochskalieren stabil laufen:

1. **UI-Bug fixen** in `src/pages/admin/ProviderHealth.tsx` Zeile 65 — Fallback `?? 6` durch `?? 25` ersetzen, damit Admin-Dashboard echten DB-Wert zeigt
2. **Circuit Breaker schärfen** in `supabase/functions/lambda-circuit-breaker/index.ts`:
   - Schwellwert dynamisch: bei höherer Konkurrenz strengeres Threshold (15 % statt 30 %)
   - Min. Sample-Size von 5 auf 10 erhöhen (verhindert Fehlalarme)
3. **Monitoring-Alert einrichten** — Slack/Email-Benachrichtigung bei:
   - Circuit Breaker tripped (sofortige Warnung)
   - `lambda_health_metrics` >5 OOM-Einträge in 1 Stunde
   - Render-Queue-Backlog >20 Jobs für >10 Min

## Phase A — Woche 1: 10 → 25 parallel

**Änderungen:**
- DB: `lambda_max_concurrent` = 25
- DB: `lambda_max_concurrent_safe` = 15 (Fallback bei Problemen)
- AWS: Reserved Concurrency auf 30 setzen (kleines Polster)

**Erfolgskriterien (nach 7 Tagen):**
- Fehlerrate <10 %
- Keine OOM-Errors in `lambda_health_metrics`
- Circuit Breaker hat 0× ausgelöst
- Durchschnittliche Render-Zeit unverändert

→ Wenn alle 4 Kriterien erfüllt: weiter zu Phase B. Sonst: bleiben und Ursache analysieren.

## Phase B — Woche 2: 25 → 50 parallel

**Änderungen:**
- DB: `lambda_max_concurrent` = 50
- DB: `lambda_max_concurrent_safe` = 30
- AWS: Reserved Concurrency auf 60
- **Neu**: Pro-Lambda-Logging erweitern (Cold-Start-Zeit, Memory-Peak) → in `lambda_health_metrics`

**Zusätzlich**: Stresstest-Endpoint einbauen (`stress-test-lambda` Edge Function), der gezielt 30 Test-Renders parallel anstößt — manuell aus Admin-UI auslösbar, um Skalierung zu validieren ohne echte User zu betreffen.

**Erfolgskriterien:** wie Phase A + Cold-Start-Zeit <3 s im Schnitt

## Phase C — Woche 3: 50 → 100 parallel

**Änderungen:**
- DB: `lambda_max_concurrent` = 100
- DB: `lambda_max_concurrent_safe` = 50
- AWS: Reserved Concurrency auf 120
- **Neu**: Render-Queue-Manager-Optimierung — statt sequenziell jeweils 1 Job triggern, **Batch-Trigger von 5 Jobs gleichzeitig** in `supabase/functions/render-queue-manager/index.ts`. Verhindert künstliches Bottleneck im Queue-Manager bei Lastspitzen.
- **Neu**: S3-Bucket-Lifecycle-Policy prüfen (alte Renders nach 30 Tagen archivieren) → verhindert Disk-Space-Probleme

**Erfolgskriterien:** wie Phase B + Webhook-Latenz <500 ms

## Phase D — Woche 4: 100 → 200 parallel (Remotion-Maximum)

**Änderungen:**
- DB: `lambda_max_concurrent` = 200
- DB: `lambda_max_concurrent_safe` = 100
- AWS: Reserved Concurrency auf 250
- **Architektur-Erweiterung**: Pre-warmed Lambda Instances für Peak-Zeiten (10 Instances zwischen 18:00–22:00 UTC dauerhaft warm halten) → eliminiert Cold-Starts in Stoßzeiten

**Erfolgskriterien:** stabil über 7 Tage = Skalierungsziel erreicht

## Sicherheitsnetze (gelten ab Phase A dauerhaft)

| Mechanismus | Wann es greift | Reaktion |
|---|---|---|
| **Circuit Breaker** | Fehlerrate >15 % in 10 Min | Auto-Fallback auf `_safe` Wert |
| **Render-Queue-Limit** | Queue >50 Jobs | Neue Jobs warten, kein Crash |
| **Per-User-Limit** | User startet >3 Renders parallel | 4. Render geht in Queue |
| **AWS Hard Cap** | Account-Limit erreicht | AWS rejected automatisch |
| **Manueller Kill-Switch** | Notfall im Admin-UI | DB-Update auf 10, sofortige Rückkehr |

## Geänderte Dateien

**Phase 0 (sofort):**
- `src/pages/admin/ProviderHealth.tsx` — UI-Fallback fixen
- `supabase/functions/lambda-circuit-breaker/index.ts` — strengeres Threshold + größerer Sample
- DB: `system_config` Updates (Phase A Werte)

**Phase B:**
- `supabase/functions/_shared/aws-lambda.ts` — erweitertes Logging
- Neue Edge Function: `supabase/functions/stress-test-lambda/index.ts`
- Admin-UI: Stresstest-Button in `src/pages/admin/ProviderHealth.tsx`

**Phase C:**
- `supabase/functions/render-queue-manager/index.ts` — Batch-Trigger statt sequenziell

**Phase D:**
- AWS Lambda Konfiguration: Provisioned Concurrency Block

## Was das praktisch bedeutet

Bei voller Skalierung (200 parallel):
- **Peak-Kapazität**: ~12.000 Renders/Stunde (bei 60 s Durchschnitts-Render-Zeit)
- **Aktive User-Equivalent**: ~5.000–10.000 gleichzeitige App-User
- **Wartezeit bei Lastspitze**: <30 s statt aktuell mehreren Minuten
- **Kosten**: nur bei tatsächlicher Nutzung — Reserve = kostenlos

## Risiken & wie wir sie eindämmen

| Risiko | Wahrscheinlichkeit | Eindämmung |
|---|---|---|
| OOM-Errors bei Memory-intensiven Renders | Mittel | `lambda_health_metrics` zeigt OOM sofort → Circuit Breaker |
| AWS Account-Limit erreicht | Niedrig | Reserved Concurrency setzen Hard Cap weit unter AWS-Default 1000 |
| S3 Disk-Space voll | Niedrig | Lifecycle-Policy in Phase C |
| Webhook-Storm bei 200 parallelen Renders | Mittel | Webhook-Endpoint hat schon Idempotency, zusätzlich Rate Limit prüfen |
| Kosten-Explosion durch Bug | Niedrig | AWS Budget Alert bei 2× normalem Tagesbudget |

## Wann abbrechen?

Wenn in **irgendeiner Phase** eines der Erfolgskriterien nicht erfüllt wird:
1. Sofort auf vorherige Stufe zurück (DB-Update, kein Deploy nötig)
2. Root-Cause-Analyse über `analyze-superuser-anomalies` KI-Funktion
3. Erst weiter wenn Ursache behoben

Die Skalierung ist **jederzeit umkehrbar** mit einem einzigen SQL-UPDATE — kein Code-Rollback, kein Deploy, kein Risiko.

