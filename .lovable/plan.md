## Klarifizierung

Du hast recht: Das, was ihr eigentlich wolltet, ist im Code zwar teilweise gebaut, aber aus Nutzersicht nicht sauber auffindbar.

Aktueller Stand:
- Das `VoiceStudioDialog` existiert bereits mit Skript, Mikrofonaufnahme, Datei-/WhatsApp-Upload, Rauschunterdrückung und Clone-Submit.
- Es ist aber nur tief im AudioStudio unter dem Tab `Custom Voices` erreichbar.
- Auf der aktuellen AudioStudio-Startfläche sieht man nur Upload, Music-to-Video und AI Music Generator — keinen klaren Einstieg wie „Eigene Stimme erstellen“.
- Deshalb wirkt es so, als wäre Custom Voice Creation nicht integriert.
- Im Music Studio selbst sind Custom Voices nicht integriert, weil die Music-Engines keine echte externe Voice-ID als Gesangsstimme akzeptieren. Custom Voices sind für gesprochenes Voiceover/TTS, nicht für KI-Gesang.

## Plan

1. **Voice Studio als sichtbaren Haupt-CTA ins AudioStudio holen**
   - Eine dritte prominente Karte direkt oben ergänzen: `Eigene Stimme erstellen`.
   - Text: Skript vorlesen, Mikrofon aufnehmen oder WhatsApp-Sprachnachricht hochladen, Stimme optimieren und in der Voice Library nutzen.
   - Klick öffnet direkt den vorhandenen `VoiceStudioDialog`.

2. **Upload-Bereich um Voice-Creation ergänzen**
   - Die Feature-Karten unten im Upload-Bereich erweitern/ersetzen, sodass `Custom Voice`, `Skript vorlesen`, `WhatsApp Upload` und `Rauschoptimierung` klar sichtbar sind.
   - Dadurch sieht man schon vor Datei-Upload, dass AudioStudio auch Stimmen erstellen kann.

3. **Custom-Voices-Tab leichter erreichbar machen**
   - Den Tab `Custom Voices` prominenter platzieren bzw. mit Badge `Neu` markieren.
   - Optional nach erfolgreichem Clone automatisch in diesen Tab springen, damit der Nutzer die neue Stimme sofort sieht.

4. **Voice Studio UX prüfen und glätten**
   - Bestehende 3 Schritte beibehalten: Skript → Aufnahme/Upload → Stimme klonen.
   - Sicherstellen, dass das Skript gut sichtbar ist und nicht wie ein versteckter Dialog wirkt.
   - Texte klarer machen: „Für Voiceovers, Motion Studio, Directors Cut nutzbar“.

5. **Music Studio sauber abgrenzen**
   - Im AI Music Generator / Music Studio keine falsche Erwartung wecken.
   - Kurzer Hinweis im Vocal-Bereich: Custom Voices sind für gesprochene Voiceovers; KI-Gesang nutzt eigene Sänger-Stimmen der Music-Engine.

## Technische Details

- Hauptdatei: `src/pages/AudioStudio.tsx`
- Bereits vorhanden: `src/components/voice/studio/VoiceStudioDialog.tsx`
- Bereits vorhanden: `src/components/audio-studio/VoiceLibraryPanel.tsx`
- Eventuell kleiner Hinweis in `src/pages/MusicStudio.tsx` oder `MusicGeneratorPanel`, je nachdem welcher Generator auf `/audio-studio` geöffnet wird.

## Ergebnis

Nach Umsetzung sieht der Nutzer im AudioStudio sofort: Hier kann ich eine eigene Stimme erstellen, ein Skript vorlesen oder WhatsApp-Audio hochladen. Die bestehende technische Funktion wird nicht neu erfunden, sondern korrekt sichtbar und verständlich in den Flow eingebunden.