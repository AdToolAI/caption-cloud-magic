## Ziel

Nur die Lip-Sync-Kette auf den Stand vom 27.07.2026 zurückholen. Alles andere aus der letzten Woche bleibt zu 100 % erhalten: Voice Library, Autopilot & Production Lounge, Landing-Page-Overhaul, Stripe/Gründer-Rabatt, Music Studio, Cast & World, UCC-Fixes, Branding.

## Warum kein History-Revert

Ein Revert über die Versions-History setzt das **gesamte** Projekt zurück – also auch alles oben Genannte. Deshalb machen wir stattdessen einen chirurgischen Rückbau: nur die Dateien der Lip-Sync-Kette werden auf ihren damaligen Inhalt gesetzt, Datei für Datei.

## Vorgehen

### Schritt 1 – Betroffene Dateien exakt bestimmen
Ich ermittle die vollständige Dateiliste der Lip-Sync-Kette und vergleiche jede Datei mit ihrem Stand vom 27.07.2026. Erwarteter Umfang (wird verifiziert, nicht angenommen):

- `supabase/functions/compose-dialog-segments/`
- `supabase/functions/lipsync-watchdog/`
- Sync.so-Webhook-Function
- `supabase/functions/_shared/` – nur die Lip-Sync-Module: Face-Gate, Preclip, Frame-Space, Motion-Verdict, Face-Track, Camera-Path, Rekognition-Helfer, Geometrie- und Contract-Module

**Ergebnis von Schritt 1: eine konkrete Liste, die du siehst und freigibst, bevor eine einzige Datei angefasst wird.** Dateien, die auch von anderen Features genutzt werden (z. B. gemeinsame Storage- oder Auth-Helfer), markiere ich separat – die werden **nicht** zurückgesetzt, sondern einzeln geprüft.

### Schritt 2 – Abhängigkeiten prüfen
Für jede Datei auf der Liste prüfe ich, wer sie sonst noch importiert. Wenn ein neues Feature (z. B. Autopilot oder UCC) ein Lip-Sync-Modul mitbenutzt, wird diese Datei nicht blind zurückgesetzt, sondern so angepasst, dass die alte Lip-Sync-Logik zurückkommt und die neue Schnittstelle erhalten bleibt.

### Schritt 3 – Rückbau der Dateien
Die freigegebene Liste wird auf den 27.07.-Inhalt gesetzt. Nach v34x eingeführte Module, die es damals nicht gab, werden gelöscht – aber nur, wenn Schritt 2 bestätigt, dass sie nichts anderes benutzt.

### Schritt 4 – Schema-Verträglichkeit herstellen
Die Patches der letzten Wochen haben auch Datenbank-Objekte eingeführt (u. a. `pipeline_state`-Enum, `plate_attempts`, `composer_scene_transition()`, Guard-Trigger). Ich lese das aktuelle Schema aus und liste, welche davon den alten Code blockieren würden.

Danach **eine einzige Migration**, die du vorher liest und freigibst:
- Guard-Trigger, die den alten Code blockieren → entfernen
- Tabellen/Spalten, die der alte Code nicht kennt → stehen lassen (stören nicht)
- Enum-Spalten, auf die der alte Code Textwerte schreibt → kompatibel machen

Keine Nutzdaten werden gelöscht.

### Schritt 5 – Deploy
Nur die zurückgesetzten Edge Functions werden neu deployt. Alle anderen bleiben unberührt.

### Schritt 6 – Laufzeit säubern und ein Testlauf
Hängende Runs und Sync.so-Slot-Leases einmalig auf einen Endzustand setzen. Dann **ein** kontrollierter Testlauf mit 2 Sprechern. Bewertet wird nur: trifft das Lip-Sync? Kein Nebenbei-Patchen.

## Sicherheitsnetz

Vor Schritt 3 markieren wir den aktuellen Stand in der History. Falls der Rückbau nicht das gewünschte Ergebnis bringt, kommen wir mit einem Klick auf den heutigen Stand zurück – ohne irgendetwas verloren zu haben.

## Was in diesem Plan nicht passiert

Keine Änderung an Frontend, Landing Page, Stripe, Voice Library, Autopilot, Music Studio oder Cast & World. Keine neuen Gates, Verdicts oder Contract-Module. Reiner, eingegrenzter Rückbau.
