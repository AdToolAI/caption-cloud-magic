# V449 — Provider-Rejection sofort sichtbar machen + Plate-Prompt entdoppeln

## Was tatsächlich passiert ist (belegt, nicht vermutet)

Die Szene, die du siehst, ist **S11 im alten Projekt `v431-g322-resmoke`** (nicht das neue V448-Rooftop-Projekt — das steht unangetastet auf `pending`).

Ablauf laut Datenbank und Provider-API:

```text
20:16:11  Plate-Dispatch Versuch 1 (HappyHorse)  -> 20:18:56 FAILED
20:18:59  Prompt-Repair-Retry Versuch 2          -> 20:19:12 FAILED
20:19:00  letzte DB-Aktualisierung der Szene     -> seitdem "Scene is being built…"
```

Beide Versuche wurden **vom Provider abgelehnt**, identischer Fehler:

> `DataInspectionFailed – Green net check failed for text (input)`

Das ist die HappyHorse-Textprüfung, kein Render-Fehler und kein Lip-Sync-Problem. Der Clip war also schon nach 3 Minuten tot — die Oberfläche zeigt trotzdem weiter „Szene wird gebaut", weil nach dem zweiten Fehlschlag **kein Callback in der Datenbank angekommen ist**. Die Szene steht deshalb bis zum Watchdog-Zeitfenster (10 Minuten Stille) auf `generating`.

Der abgelehnte Prompt ist zusätzlich sichtbar kaputt: der Block `[2 ACTION] Lip-ready neutral master plate: Exactly 4 distinct people…` steht **dreimal hintereinander**, gefolgt von vier `[8 NEGATIVE]`-Fragmenten. Ein solcher Text ist ein typischer Auslöser für die Green-Net-Textprüfung.

## Was der Gate repariert

**1. Ehrliches Scheitern statt stiller Wartezeit**
- Nach einem Dispatch prüft die Kette den Provider-Status aktiv nach (kurzes, begrenztes Nachfassen), statt ausschließlich auf den Callback zu warten.
- Eine erkannte Provider-Ablehnung terminalisiert die Szene sofort: Status `failed`, klare deutsche Fehlermeldung („Der Video-Anbieter hat den Szenentext abgelehnt"), automatische Gutschrift wie bisher.
- Ziel: sichtbarer Fehler in unter einer Minute statt 10 Minuten Scheinfortschritt.

**2. Prompt-Entdopplung vor dem Dispatch**
- Im Prompt-Layer-Composer eine Dedup-Stufe, die identische bzw. nahezu identische Sätze und wiederholte `[2 ACTION]` / `[8 NEGATIVE]`-Blöcke zusammenführt, bevor der Text zum Provider geht.
- Harte Längenobergrenze für den Plate-Prompt; überschüssige Wiederholungen fallen zuerst weg, die Kern-Klauseln (Identität, Lip-Ready, Kamera-Lock, Anti-Panel) bleiben erhalten.

**3. Sanitizer-Ergänzung**
- Der bestehende `hardSanitizeForHappyHorse` bekommt die Entdopplung als festen Bestandteil, damit der eine erlaubte Repair-Retry sich vom ersten Versuch tatsächlich unterscheidet — heute wurde derselbe abgelehnte Text zweimal geschickt und zweimal abgelehnt.

## Was der Gate NICHT anfasst

- Keine Änderung an der Lip-Sync-Kette (v400-Freeze bleibt), keine Provider-Migration (v176 bleibt), keine Anker-Logik.
- Kein Render, kein Owner-Rerender in diesem Gate.
- Das V448-Rooftop-Projekt bleibt unverändert auf „bereit für genau einen manuellen Render".

## Technische Details

- `supabase/functions/_shared/happyhorse-green-net.ts`: Dedup-Helfer ergänzen, in `hardSanitizeForHappyHorse` einhängen.
- Prompt-Layer-Composer (`compose-video-clips` Plate-Pfad): Dedup + Längenobergrenze vor dem Dispatch, axis-aware wie bereits dokumentiert.
- `compose-video-clips`: nach dem Dispatch ein begrenztes Nachfassen beim Provider (wenige Versuche, kurzes Fenster); bei `failed` mit `classifyProviderRejection() != none` → sofort `clip_status='failed'`, `clip_error='[prompt_rejected] …'`, Refund über den bestehenden Pfad, Cinematic-Sync-Felder aufräumen wie im Webhook-Fail-Pfad.
- `recover-stuck-composer-clip` / `qa-watchdog` bleiben unverändert als Sicherheitsnetz.
- Tests: Erweiterung von `supabase/functions/_shared/happyhorse-rejection.test.ts` um Dedup- und Terminalisierungsfälle.

## Erwartetes Ergebnis

S11 lässt sich danach erneut starten; entweder läuft der entdoppelte Prompt durch, oder du siehst binnen Sekunden einen klaren, verständlichen Fehler statt sieben Minuten Ladebalken.
