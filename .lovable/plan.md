## Problem

Im Motion Studio → Schritt **05 Musik** werden zwei rohe i18n-Schlüssel statt übersetzter Texte angezeigt:

- `videoComposer.audio.openLibrary` (großer gelber Button "Browse Music & SFX Library")
- `videoComposer.audio.orQuickSearch` (Trenner-Label "or quick search")

**Ursache:** Beide Keys werden in `src/components/video-composer/AudioTab.tsx` (Zeilen 294 und 303) verwendet, existieren aber im `videoComposer.audio`-Namespace in `src/lib/translations.ts` nicht — weder für EN, DE noch ES. Die `|| 'Fallback'`-Logik greift nicht, weil `t()` bei fehlenden Keys den Key-String selbst zurückgibt (truthy), nicht `undefined`.

Ein Quick-Check zeigt: Der Namespace `videoComposer.audio` enthält bisher nur `audio: "Audio"` als Tab-Label, aber keinen vollständigen Sub-Block. Beim Audit muss ich daher noch prüfen, ob es ggf. weitere fehlende `audio.*`-Keys gibt, die im AudioTab verwendet werden (z. B. Labels für Volume, Upload, Genre, Mood).

## Lösung

### 1. Audit aller `videoComposer.audio.*`-Keys
Im `AudioTab.tsx` per ripgrep alle `t('videoComposer.audio.*')`-Aufrufe sammeln und mit dem bestehenden Translation-Block abgleichen, um wirklich alle fehlenden Keys auf einmal zu schließen (nicht nur die zwei sichtbaren).

### 2. Übersetzungen in `src/lib/translations.ts` ergänzen
Den `videoComposer.audio`-Sub-Block in allen drei Sprachblöcken (EN ~Z. 1797+, DE ~Z. 6422+, ES ~Z. 10998+) um die fehlenden Keys erweitern. Mindestens:

| Key | EN | DE | ES |
|---|---|---|---|
| `openLibrary` | Browse Music & SFX Library | Musik- & SFX-Bibliothek öffnen | Abrir biblioteca de música y SFX |
| `orQuickSearch` | or quick search | oder Schnellsuche | o búsqueda rápida |

(weitere Keys ergänzen, falls Audit weitere Lücken zeigt — z. B. Suchfeld-Placeholder, Lautstärke-Label, Upload-Hinweis usw.)

### 3. Verifikation
- Preview neu laden, Schritt **05 Musik** öffnen, Sprache zwischen DE/EN/ES wechseln und prüfen, dass keine rohen Keys mehr erscheinen.
- Optional: Im Browser Console-Log nach Warnungen für fehlende Keys filtern.

## Hinweis

Das ist ein reiner Lokalisierungs-Fix — keine Logik-, DB- oder Edge-Function-Änderung. Der Motion Studio Workflow selbst (Briefing → Storyboard → Clips → Voiceover → Musik → Export → Kampagne) bleibt unverändert und ist funktional fertig; das Studio sah nur "unfertig" aus, weil die Musik-Sektion vor kurzem erweitert wurde (Music Library Browser) ohne dass die neuen Strings nachgepflegt wurden.

## Geänderte Dateien

- `src/lib/translations.ts` (drei Stellen: EN, DE, ES Block des `videoComposer.audio`-Namespace)
