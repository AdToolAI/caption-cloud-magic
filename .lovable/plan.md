
Plan: Render-Only-Regression fixen und Musik-Pipeline sauber entkoppeln

## Diagnose

Do I know what the issue is? Ja.

Die Logs zeigen jetzt sehr klar **zwei getrennte Probleme**:

1. **Akuter Crash im Retry-Pfad**
   - `auto-generate-universal-video` wirft im Render-Only-Retry:
     `ReferenceError: props is not defined`
   - Ursache: In `runRenderOnlyPipeline()` wird `const props = JSON.parse(...)` nur **innerhalb** des `if/try`-Blocks erzeugt, später aber in `updateProgress(... effectiveFlags.silentRender: audioStripped ? !props?.voiceoverUrl : false ...)` **außerhalb** dieses Scopes referenziert.
   - Dadurch crasht der Retry, **bevor** der Fallback-Render überhaupt gestartet wird.

2. **Musik ist in diesem Lauf gar nicht aktiv gewesen**
   - `selectBackgroundMusic` hat nur ungültige Jamendo/Pixabay-Kandidaten gesehen (`content-type: text/html`), danach `Proxy failed`.
   - In den Runtime-Logs steht danach: `hasMusic: false`.
   - Das heißt: Der aktuelle Fehler ist **nicht** „Muxing kaputt“, sondern zuerst ein **Retry-Regression-Bug**. Zusätzlich fehlt eine **verlässliche Musikquelle**.

Wichtiger Nebenaspekt:
- `generate-video-voiceover` war erfolgreich (`sizeBytes: 851008`), also die Voiceover-Erzeugung selbst ist nicht der unmittelbare Absturzpunkt.
- `remotion-webhook` sieht aktuell grundsätzlich plausibel aus; der Blocker sitzt vorher.

## Umsetzung

### Schritt 1: Render-Only-Retry Scope-Bug fixen
Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Ich würde den Retry so umbauen, dass der Code **nie** mehr auf ein blocklokales `props` außerhalb seines Scopes zugreift.

Konkret:
- Vor dem `updateProgress()` einen stabilen Wert berechnen, z. B.:
  - `recoveredHasVoiceover`
  - `recoveredSilentRender`
- Diese Werte aus dem **aktualisierten Payload** oder aus einer außerhalb gespeicherten Variable ableiten
- `effectiveFlags` nur noch aus diesen sicheren Variablen aufbauen

Ziel:
- Kein `ReferenceError` mehr
- Retry startet wirklich
- Voiceover-Fallback kann wieder funktionieren

### Schritt 2: Retry-Forensik robust machen
Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Die Forensik-/Statusdaten sollten aus derselben finalen Retry-Quelle kommen wie der tatsächliche Render-Payload.

Ich würde:
- `effectiveFlags.silentRender`
- `effectiveFlags.audioStripped`
- `effectiveFlags.hasVoiceover`

aus einer gemeinsamen finalen Retry-State-Struktur ableiten, statt aus temporären Variablen im Try-Block.

Damit vermeiden wir:
- Scope-Fehler
- irreführende Statusmeldungen
- Unterschiede zwischen tatsächlichem Payload und UI-Diagnose

### Schritt 3: Musikquelle stabilisieren
Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Da die externen Musikquellen aktuell regelmäßig HTML statt MP3 liefern, würde ich die Musik-Selektion härten:

- wenn Proxy/Validierung fehlschlägt: **kein halber Musikzustand**
- `audioTracks` nur mit `backgroundMusicUrl`, wenn URL wirklich vorhanden ist
- für Phase 2 eine kleine Menge **vorvalidierter interner Musikdateien** aus Storage als Fallback verwenden

Ziel:
- Kein „Musik angeblich aktiv, aber faktisch null“
- kein unnötiger Audio-Corruption-Pfad wegen externer Quellen
- reproduzierbare Musik-Renders

### Schritt 4: Erst danach Post-Render-Mux validieren
Dateien:
- `supabase/functions/remotion-webhook/index.ts`
- optional `supabase/functions/mux-audio-to-video/index.ts`

Sobald Schritt 1 und 3 stehen, würde ich erst danach den Musikpfad validieren:
- Voiceover-only Retry muss wieder sauber laufen
- danach erst Background-Music per Mux prüfen
- falls nötig Logging im Webhook ergänzen, aber das ist nach aktuellem Stand **nicht** der primäre Defekt

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/auto-generate-universal-video/index.ts` | Scope-Bug im Retry fixen, Retry-State zentralisieren, Musik-Fallback härten |
| `supabase/functions/remotion-webhook/index.ts` | nur sekundär, falls nach Retry-Fix noch Mux-Diagnose nötig ist |
| `supabase/functions/mux-audio-to-video/index.ts` | vermutlich keine Erstmaßnahme |

## Erwartetes Ergebnis

Nach dem Fix:
1. der Render-Only-Retry crasht nicht mehr mit `props is not defined`
2. Voiceover-Fallback kann wieder tatsächlich rendern
3. Musik wird nur noch verwendet, wenn eine valide Quelle existiert
4. danach kann die Background-Music gezielt und sauber weiter aktiviert werden

## Technischer Kern in einem Satz

Der aktuelle Produktionsfehler ist primär **ein Scope-Regression-Bug im Retry-Code**, nicht das Template; parallel dazu fehlt für Musik derzeit eine **zuverlässige validierte Audioquelle**.
