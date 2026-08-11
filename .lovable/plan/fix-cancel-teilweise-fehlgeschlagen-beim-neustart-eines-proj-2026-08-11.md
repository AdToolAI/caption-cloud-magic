# Fix: "Cancel teilweise fehlgeschlagen" beim Neustart eines Projekts

## Was passiert ist

Beim Klick auf "Neues Projekt" räumt das Motion Studio zuerst das alte Projekt auf: es ruft die Backend-Funktion `composer-cancel-project` auf, die laufende Render- und Lip-Sync-Jobs stoppt, damit im Hintergrund keine Credits weiterlaufen. Genau dieser Aufruf ist fehlgeschlagen, und das Studio zeigt dafür eine rote Fehlermeldung — obwohl das neue Projekt danach ganz normal startet.

Zwei Probleme stecken darin:

1. **Die Meldung sagt nichts aus.** Der Aufruf-Fehler wird nur als "Edge Function returned a non-2xx status code" durchgereicht. Der eigentliche Grund (kein Zugriff, Projekt nicht mehr vorhanden, abgelaufene Sitzung) bleibt unsichtbar — auch für uns: die Funktion protokolliert ihre Ablehnungen aktuell nicht, ihre Logs zeigen zum Zeitpunkt des Klicks nur den Start, keinen Fehler. Die Ursache ist damit noch nicht bestätigt und muss erst sichtbar gemacht werden.
2. **Harmlose Fälle werden als Fehler gemeldet.** Wenn das alte Projekt gar nicht mehr existiert (z. B. weil ein vorheriger Reset es schon gelöscht hat) oder wenn es noch nie gespeichert wurde, gibt es schlicht nichts abzubrechen. Das ist kein Fehler und darf keinen roten Alarm auslösen.

## Was gebaut wird

**1. Echte Fehlerursache sichtbar machen**
- Im Studio den Aufruf-Fehler auspacken (Statuscode + Antworttext der Funktion) statt der generischen Meldung, und ihn zusätzlich in die Browser-Konsole schreiben.
- In der Backend-Funktion jede Ablehnung (fehlende Anmeldung, fehlende Berechtigung, Projekt nicht gefunden, fehlende Projekt-ID) mit Projekt- und Nutzerbezug protokollieren, damit der Fall in den Logs auffindbar ist.

**2. Harmlose Fälle nicht mehr als Fehler behandeln**
- "Projekt nicht gefunden" und "kein Zugriff" beim Zurücksetzen still behandeln: kein roter Toast, nur ein Konsolen-Hinweis. Der Reset läuft weiter wie bisher.
- Den Abbruch-Aufruf ganz überspringen, wenn die Projekt-ID keine echte gespeicherte ID ist (unspeicherter Entwurf) — dort gibt es serverseitig nichts zu stoppen.
- Bleibt ein echter Fehler übrig (z. B. abgelaufene Sitzung oder Serverfehler), wird er weiterhin angezeigt — dann aber mit konkretem Grund statt "non-2xx".

**3. Aufräumen bleibt sicher**
- Das anschließende Löschen des alten Projekts und das Starten des neuen bleiben unverändert; sie laufen wie bisher auch dann, wenn der Abbruch-Schritt nichts zu tun hatte.

## Technische Details

- `src/components/video-composer/VideoComposerDashboard.tsx` → `handleReset`:
  - Aufruf nur bei gültiger UUID (`isUuid(oldId)`).
  - Fehler via `FunctionsHttpError` + `error.context.text()` auswerten; Fehlercode aus dem JSON-Body lesen.
  - `project_not_found` / `forbidden` → `console.warn`, kein Toast. Sonst Toast mit Status + Body-Text.
- `supabase/functions/composer-cancel-project/index.ts`: `console.error`/`console.warn` vor jedem frühen `json({ error: ... }, 4xx)`-Return; Funktion danach neu deployen.
- Keine Datenbank- oder Schemaänderungen.

## Danach

Beim nächsten Auftreten steht die konkrete Ursache in Toast und Funktions-Log; falls es doch ein echter Fehler ist (z. B. Sitzung abgelaufen), können wir gezielt nachbessern.
