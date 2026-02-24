

# Fix: "Failed to parse script JSON" in generate-universal-script

## Problem

Die KI (Gemini 2.5 Flash) liefert manchmal fehlerhaftes JSON zurueck (Syntaxfehler an Position 3254, Zeile 67). Der aktuelle Parser macht nur ein einfaches `JSON.parse` ohne Reparaturlogik -- bei jedem Syntaxfehler bricht die gesamte Generierung ab.

## Ursache

Typische AI-JSON-Fehler:
- Unescaped Anfuehrungszeichen in Strings (z.B. `"Er sagte "Hallo"` statt `"Er sagte \"Hallo\""`)
- Trailing Commas vor `]` oder `}`
- Kommentare im JSON
- Abgeschnittene Ausgabe bei langen Scripts

## Loesung: Robuste JSON-Reparatur mit Retry

### 1. JSON-Reparatur-Logik hinzufuegen

**Datei: `supabase/functions/generate-universal-script/index.ts`**

Den Parsing-Block (Zeilen 228-238) durch eine mehrstufige Reparatur ersetzen:

1. Versuch 1: Direktes `JSON.parse` (wie bisher)
2. Versuch 2: Bereinigung typischer AI-Fehler:
   - Markdown-Codeblock-Wrapper entfernen
   - Trailing Commas entfernen (`},]` -> `}]`, `,}` -> `}`)
   - Steuerzeichen entfernen
   - Unescaped Newlines in Strings reparieren
3. Versuch 3: JSON-Block per Regex extrahieren (erstes `{` bis letztes `}`)
4. Versuch 4: Retry mit der AI (neuer Request mit expliziter Fehlermeldung, dass das JSON ungueltig war)

### 2. Retry-Mechanismus bei Parse-Fehler

Wenn alle lokalen Reparaturversuche fehlschlagen, wird ein zweiter AI-Call gemacht mit:
- Dem fehlerhaften Content als Kontext
- Einer strengeren Anweisung: "Dein letztes JSON war ungueltig. Gib NUR valides JSON zurueck."
- Maximal 1 Retry um Endlosschleifen zu vermeiden

### Aenderungen im Detail

**EDIT: `supabase/functions/generate-universal-script/index.ts`**

- Neue Hilfsfunktion `tryRepairJson(raw: string): object | null` mit den 3 lokalen Reparaturstufen
- Neuer Retry-Block: Falls lokale Reparatur fehlschlaegt, zweiter AI-Call mit Fehlerkontext
- Logging verbessern: Bei Reparaturerfolg loggen welche Stufe funktioniert hat
- CORS-Headers ebenfalls auf das erweiterte Set aktualisieren (Konsistenz)

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/generate-universal-script/index.ts` -- Robuste JSON-Reparatur + Retry-Logik im Parsing-Block

