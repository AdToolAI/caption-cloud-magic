
# Plan: Audio-Architektur vom Universal Content Creator auf den Universal Video Creator übertragen

## Was ich im Code gefunden habe

### So funktioniert es im Universal Content Creator
Der Universal Content Creator nutzt einen deutlich einfacheren und stabileren Audio-Pfad:

- `render-with-remotion` übergibt `voiceoverUrl` und `backgroundMusicUrl` direkt an die `UniversalVideo`-Composition
- `src/remotion/templates/UniversalVideo.tsx` mountet **ein einziges stabiles Top-Level-AudioLayer**
- dieses `AudioLayer` rendert beide Quellen linear über die gesamte Composition
- keine Retry-Flags, keine Szene-Logik, keine getrennten Audio-Systeme

Kurz: **ein Render-Pfad, ein Audio-Layer, beide Audios direkt auf Root-Level**

### So ist es aktuell im Universal Video Creator
Der Universal Video Creator ist deutlich komplexer und weicht von dieser bewährten Architektur ab:

- `auto-generate-universal-video` erzeugt aktuell **Voiceover-only**
- im Retry-Pfad ist `diag.silentRender` laut Payload bereits korrekt auf `false`
- die Retry-Payload enthält auch korrekt eine `voiceoverUrl`
- `backgroundMusicUrl` ist im Retry entfernt, wie geplant

Das heißt: **Backend-seitig kommt ein gültiges Voiceover im Retry bis zur Lambda an.**

### Der eigentliche Engpass
In `UniversalCreatorVideo.tsx` ist die Audio-Ausgabe aufgesplittet:

- Voiceover läuft über eigenes `Html5Audio`
- Musik läuft separat über `SceneAudioManager`
- `SceneAudioManager` würde zusätzlich selbst wieder Voiceover rendern
- dazu kommen `silentRender` / `r33_audioStripped` / Retry-Branches

Dadurch ist der Universal Video Creator **nicht auf derselben stabilen Audio-Architektur wie der Universal Content Creator**.

## Wichtigste Erkenntnis
Der aktuelle Retry-Render für den letzten Lauf hatte laut gespeicherter Payload:

- `diag.silentRender = false`
- `voiceoverUrl = vorhanden`
- `backgroundMusicUrl = entfernt`
- `muted = false`
- `audioCodec = 'aac'`

Damit ist sehr wahrscheinlich:  
**Das Problem sitzt nicht mehr in der Voiceover-Erzeugung oder im Lambda-Payload, sondern in der Render-Architektur des Templates.**

## Umsetzung

### Schritt 1: Bewährte Audio-Architektur aus dem Universal Content Creator übernehmen
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Den Universal Video Creator auf denselben Grundansatz umstellen wie `UniversalVideo`:

- ein **einziger Root-Audio-Layer**
- linear von Frame 0 bis Ende
- Voiceover und Musik werden zentral an einer Stelle gerendert
- keine verteilten Audio-Komponenten mehr im Template

Ziel für Phase 1:
- zuerst **nur Voiceover stabil hörbar**
- Musik bleibt vorerst deaktiviert bzw. getrennt

### Schritt 2: Doppelte / konkurrierende Audio-Pfade entfernen
**Dateien:**
- `src/remotion/templates/UniversalCreatorVideo.tsx`
- `src/remotion/components/SceneAudioManager.tsx`

Ich würde die Audio-Verantwortung klar trennen:

- **Phase 1:** `UniversalCreatorVideo` nutzt nur den simplen stabilen Root-Audio-Layer
- `SceneAudioManager` wird für Final-Render vorerst nicht mehr für Voiceover verwendet
- kein gleichzeitiges `Html5Audio` + `SceneAudioManager` + zweiter Voiceover-Pfad

Das verhindert:
- versehentliches Doppel-Voiceover
- Abhängigkeit von Retry-/Diag-Flags
- weitere versteckte Audio-Kollisionen

### Schritt 3: Shared Audio Component einführen
**Dateien:**
- `src/remotion/templates/UniversalVideo.tsx`
- `src/remotion/templates/UniversalCreatorVideo.tsx`
- optional neuer Shared-Helper unter `src/remotion/components/`

Statt zwei getrennte Audio-Implementierungen zu pflegen, würde ich den funktionierenden Audio-Layer aus dem Content Creator als **gemeinsame Audio-Basis** nutzen.

Vorteil:
- beide Produkte rendern Audio über dieselbe Logik
- was im Content Creator funktioniert, funktioniert dann auch im Video Creator
- Phase 2 wird deutlich einfacher

### Schritt 4: Retry-/Debug-Daten korrigieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Ich habe noch einen Inkonsistenz-Bug gefunden:

- im Retry wird `props.diag.silentRender` korrekt auf `false` gesetzt
- aber in `result_data.effectiveFlags` wird `silentRender` aktuell hart als `true` gespeichert

Das scheint eher ein Debug-/Forensik-Bug zu sein, aber ich würde ihn mit korrigieren, damit Diagnose und tatsächliche Payload wieder übereinstimmen.

### Schritt 5: Phase 1 sauber validieren
Nach der Umstellung würde ich genau diesen Ablauf absichern:

1. Auto-Generate mit Voiceover-only
2. prüfen, dass im finalen MP4 wirklich Sprache hörbar ist
3. erst danach **Phase 2 Musik**
4. dann Musik nach demselben UCC-Prinzip hinzufügen, erst simpel, danach optional wieder mit Ducking

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | Audio auf einfachen stabilen Root-Layer umstellen |
| `src/remotion/components/SceneAudioManager.tsx` | Voiceover-Verantwortung entfernen bzw. für Phase 1 aus Final-Render rausnehmen |
| `src/remotion/templates/UniversalVideo.tsx` | als Referenz / ggf. Shared Audio Layer extrahieren |
| `supabase/functions/auto-generate-universal-video/index.ts` | irreführende `effectiveFlags.silentRender` Diagnose korrigieren |

## Erwartetes Ergebnis

- Universal Video Creator nutzt dieselbe robuste Audio-Grundidee wie der Universal Content Creator
- Voiceover ist endlich hörbar
- wir haben eine saubere Basis für **Phase 2: Musik + Voiceover gleichzeitig**
- weniger Sonderlogik, weniger Debugging-Risiko

## Kurzantwort auf deine Frage
Ja — im Universal Content Creator klappt es vor allem deshalb, weil dort die Audio-Architektur viel einfacher ist:  
**ein zentraler Audio-Layer auf Composition-Ebene statt mehrerer verteilter Audio-Pfade mit Retry-Flags und Szenen-Logik.**

Genau diesen Ansatz würde ich jetzt auf den Universal Video Creator portieren.