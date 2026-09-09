# Prüfung der Meldung von walidsai76@gmail.com

## Was ich in den Daten gefunden habe

**1. Zu viel zurückerstattetes Guthaben — behoben, stammt vom 7./8. September**

- Beim Nutzer walidsai76 wurden am 7.9. für dieselbe fehlgeschlagene Erstellung mehrfach Beträge gutgeschrieben (bis zu 3× je Video). Sein Guthaben stieg dadurch auf 33,96 € — das ist die "40 $", von denen er schreibt.
- Am 8.9. um 11:13 Uhr wurden diese Doppel-Gutschriften bei ihm bereits korrigiert (3 Korrekturbuchungen).
- Seit dieser Korrektur gab es **15 Rückerstattungen über alle Konten hinweg, jede genau einmal** — keine einzige Doppelgutschrift mehr. Auch seine letzte Rückerstattung am 9.9. um 02:22 war korrekt einmalig.
- Fazit: Das Problem ist real gewesen, ist gelöst, und seine Nachricht bezieht sich auf den Zeitraum davor.

**2. "Als echte Person markiert" — tritt weiterhin auf, ist aber etwas anderes**

- Die abgelehnten Aufträge scheitern nicht an der Personen-Erkennung, sondern an der Urheberrechts-Prüfung des Anbieters: "output video may be related to copyright restrictions". Sein Bild zeigt eine bekannte Zeichentrickfigur — genau das lehnt der Anbieter ab.
- Seit dem 8.9. gab es 8 solcher Ablehnungen, die letzte am 9.9. um 02:19 Uhr. Das Geld wurde jedes Mal korrekt zurückgebucht.
- Der Nutzer hat es als "echte Person" verstanden, weil im Bildbereich ein Hinweistext zu Fotos echter Personen steht — die eigentliche Ablehnung wird ihm nur als "Edge Function returned a non-2xx status code" angezeigt (siehe Screenshot 1).

**3. Welcher Anbieter — und welche sind toleranter**

- Er hat fast alles mit Seedance 2.5 erzeugt (12 Aufträge, davon 5 abgelehnt) plus einen mit Seedance Standard.
- Über alle Konten der letzten zwei Wochen: Seedance 2.5 hatte 25 Urheberrechts-Ablehnungen bei 109 Aufträgen, Seedance Pro 1 von 21. Kling 3, Kling Omni, Kling 2.6, Wan 2.6 Pro, LTX und Grok Imagine hatten **null** solcher Ablehnungen.
- Seedance (ByteDance) filtert also deutlich strenger als die Kling- und Wan-Modelle. Für Inhalte mit bekannten Figuren sind Kling oder Wan die bessere Wahl.


## Vorschlag

Nur an der Verständlichkeit arbeiten, nichts an Abrechnung oder Erstattung anfassen:

1. Klartext-Fehlermeldung statt technischem Toast: wenn der Anbieter wegen Urheberrecht ablehnt, wird eine eigene Meldung in EN/DE/ES angezeigt ("Der Anbieter hat das Video wegen möglicher Urheberrechte an der Vorlage abgelehnt — dir wurde nichts berechnet").
2. Immer sichtbar dazuschreiben, dass das Guthaben vollständig zurückgebucht wurde.
3. Den Hinweistext im Bildbereich ergänzen: nicht nur Fotos echter Personen, sondern auch bekannte Film-/Zeichentrickfiguren und Marken werden abgelehnt.
4. Bei einer Urheberrechts-Ablehnung direkt einen toleranteren Anbieter vorschlagen (Kling 3 oder Wan 2.6 Pro), mit erhaltenem Prompt und Bild.

4. Antwortvorschlag an den Nutzer: Doppel-Gutschrift war ein Fehler vom 7.9. und ist seit 8.9. behoben; die Ablehnung kam vom Urheberrechtsfilter, nicht von der Personenerkennung.

## Technische Details

- Datenbasis: `ai_video_transactions` (Typ `refund`, gruppiert nach `generation_id`) und `ai_video_generations.error_message`.
- Änderungen nur im Frontend-Fehlerpfad der Videoerstellung (Fehlermeldungs-Mapping + Hinweistext), keine Änderungen an Wallet-, Refund-, Preis-, Routing- oder Orchestrierungslogik.
