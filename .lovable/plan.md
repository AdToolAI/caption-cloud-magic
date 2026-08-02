Ja — mit einer Einschränkung, die ich offen sagen will: Schritt 2 (der Datenbank-Wächter) ist der eigentliche Kern. Ohne ihn ist alles andere wieder nur Konvention, und Konvention hat uns die letzten Wochen gekostet. Mit ihm ist der Rückfall technisch unmöglich.

## Warum das der saubere Weg ist

Das Problem ist nicht, dass die Pipeline falsch rechnet. Sie rechnet an ~50 Stellen **getrennt voneinander richtig**. Jede dieser Stellen hat ihre eigene handgeschriebene Prüfung auf Lauf-ID, Generation und Endzustand nachgebaut. Das ist kein Uhrwerk, das sind 50 Uhren, die zufällig gleich gehen — und jedes Mal, wenn eine nicht mitgezogen wurde, hattest du wieder einen Sprung im Ablauf.

Die Alternative wäre ein Neubau der Pipeline. Davon rate ich ab: die Logik selbst ist inzwischen korrekt (siehe Audit unten), nur die Durchsetzung ist verteilt. Ein Neubau würde funktionierende Logik wegwerfen, um dasselbe Ziel zu erreichen.

## Was das Audit ergeben hat

**Sauber und bestätigt:**
- Genau ein Einstiegspunkt — alle 11 Klick-Pfade laufen über den Server-Endpunkt, keiner ruft direkt an
- Reset und Generations-Hochzählung passieren vor jedem Provider-Aufruf; scheitert der Reset, bricht der Lauf ohne Kosten ab
- Veraltete Rückmeldungen werden fünffach abgelehnt (überholt, doppelt, fertig, falsche Generation, falscher Lauf)
- Lip-Sync kann auf einer fehlgeschlagenen Szene nicht mehr starten; ein Callback belebt sie nicht wieder
- Erstattungen sind idempotent und feuern nie für geliefertes Material
- Die Freigabeliste der erlaubten Zustandswechsel ist lückenlos
- Die Oberfläche kann nicht mehr "Lip-Sync läuft" zeigen, während die Plate rendert

**Der eine systemische Widerspruch:** Der Code sagt "Zustandswechsel laufen ausschließlich über die geprüfte Übergangsfunktion". Tatsächlich tun das nur ~10 von ~60 Schreibvorgängen (Plate: 13 Umgehungen, Dialog: 28, Sync-Webhook: 10, Mux: 6).

**Kleinere Abweichungen:** Zwei UI-Komponenten entscheiden noch an Alt-Feldern; der Player zeigt nach 9 Minuten eigenmächtig "Fehler", obwohl der Server die Szene als laufend führt; der Client stößt parallel zum Server an (serverseitig abgesichert); der Watchdog prüft vor dem Anstoßen nicht selbst auf Generation.

## Der Plan

**Schritt 1 — Ein einziger Schreibweg.** Alle direkten Zustandsschreibungen in den vier Backend-Funktionen auf die geprüfte Übergangsfunktion umstellen. Jeder Wechsel bekommt damit automatisch Zeilensperre, Freigabeprüfung und Lauf-/Generations-Abgleich. Die 50 handgeschriebenen Einzelprüfungen werden dadurch überflüssig statt weiter dupliziert.

**Schritt 2 — Den Schreibweg erzwingen.** Ein Datenbank-Wächter weist jede Zustandsänderung ab, die nicht aus der Übergangsfunktion kommt. Ab hier ist die Regel physikalisch, nicht mehr nur dokumentiert. Das ist der Schritt, der die Fehlerklasse endgültig schließt.

**Schritt 3 — Watchdog absichern.** Er prüft Generation und Lauf-ID selbst, bevor er etwas erneut anstößt, statt sich auf die Zielfunktion zu verlassen.

**Schritt 4 — UI angleichen.** Beide Komponenten vollständig auf den Pipeline-Zustand umstellen; die 9-Minuten-Eigenanzeige entfernen.

**Schritt 5 — Verifikation.** Ein Vertragstest, der den Build bricht, sobald irgendwo wieder am Vertrag vorbeigeschrieben wird, plus ein echter 4-Sprecher-Durchlauf mit Protokollprüfung an allen sieben Stationen.

### Technische Details

- Betroffen: `compose-video-clips`, `compose-dialog-segments`, `sync-so-webhook`, `render-sync-segments-audio-mux` — jeweils `transitionScene(...)` mit `from`, `runId`, `generation` statt `.update({ pipeline_state })`
- Schritt 2 als Migration: BEFORE-UPDATE-Trigger, der `pipeline_state`-Änderungen ohne die Sitzungsmarkierung der Übergangsfunktion abweist; die Funktion setzt die Markierung innerhalb ihrer Transaktion
- Fehlerpfade bleiben bei `failLipSync` — bereits vertragskonform und idempotent
- Kein Schema-Umbau, keine Datenmigration, keine Änderung an der Freigabeliste

Aufwand liegt fast vollständig in Schritt 1+2. Danach ist der Zustandsautomat nachweisbar der einzige Taktgeber — und Abweichungen scheitern beim Build statt beim Kunden.
