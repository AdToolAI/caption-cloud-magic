## Problem

Auf der Startseite zeigt die Feature-Grid-Überschrift den rohen Übersetzungsschlüssel `landing.featureGrid.title1` neben "Social Media Erfolg" an. Grund: Im deutschen Übersetzungsblock (`src/lib/translations.ts`, Zeile 8610) fehlt der Key `title1` — er ist nur in EN und ES vorhanden.

## Fix

**`src/lib/translations.ts`** (DE-Block, Zeile 8610–8611): `title1: "Alles was du brauchst für "` ergänzen, sodass der Header korrekt als „Alles was du brauchst für **Social Media Erfolg**" gerendert wird.

Optional gleiche Ergänzung prüfen für andere DE-Sektionen mit identischem Symptom — Schnell-Scan zeigt aber, dass nur `featureGrid.title1` betroffen ist (Mission etc. haben Englisch fest verdrahtet, das ist ein separates Thema und nicht Teil dieses Tickets).

## Ergebnis

Die Überschrift im Feature-Grid wird sauber ohne Roh-Key angezeigt.