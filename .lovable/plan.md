

## Bugfix: Rendering bricht bei KI-Bild-Szenen ab + fehlende Vollvideo-Vorschau im Export-Tab

### Was passiert
1. **Rendering schlägt fehl** mit `Code 4 - Media playback error` auf einer `.png`-URL.
2. Im Export-Tab gibt es **keine Live-Vorschau** des fertigen Vollvideos — nur die kleine Watermark-Positionsbox (das schwarze Kästchen oben).

### Ursache

**Zu (1):** Die Edge Function `compose-video-assemble` schickt jede Szene als `videoUrl` an Remotion — egal ob die Szene ein KI-generiertes Bild (`.png`) oder ein Video (`.mp4`) ist. Im Remotion-Template `ComposedAdVideo.tsx` (Zeile 140) wird daraus immer ein `<Video src={...} />`, das PNG-Dateien nicht abspielen kann → Error Code 4.

Das Template hat zwar bereits einen `isImage`-Pfad mit `<KenBurnsImage>` (Zeilen 133–138), nur wird das Flag aktuell **nie gesetzt**, weil die Edge Function die Bild-Erkennung beim Scene-Mapping vergisst.

**Zu (2):** Im Export/Assembly-Tab existiert nur die Watermark-Vorschau-Box (kleines `AdTool AI`-Stempelfeld) und nach erfolgreichem Render der MP4-Player. Eine Vollvideo-Vorschau **vor** dem Render ist nicht eingebaut. Das Komponenten-Bauteil dafür (`ComposerSequencePreview`) existiert bereits und wird im Voiceover-/Untertitel-Tab benutzt — es fehlt nur im Export-Tab.

### Fix

#### A) Bild-Szenen werden korrekt als Bilder gerendert

**Datei:** `supabase/functions/compose-video-assemble/index.ts`

1. **Bild-Erkennung beim Scene-Build** (rund um Zeile 180):
   Erkenne, ob eine Szene ein Bild ist:
   ```ts
   const isImageScene = (s: any) =>
     s.clip_source === 'ai-image' ||
     s.upload_type === 'image' ||
     /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(s.clip_url || '');
   ```

2. **Probing überspringen für Bilder** (Zeilen 165–178): `probeMp4Duration` nur für Videos aufrufen — Bilder werden sonst sinnlos angefasst und liefern `null`, was harmlos ist, aber unnötig Zeit kostet.

3. **`isImage`-Flag mitschicken** im `remotionScenes`-Mapping (Zeile 194 ff.):
   ```ts
   return {
     videoUrl: s.clip_url,
     isImage: isImageScene(s),
     durationSeconds: isImageScene(s) ? nominalDuration : effectiveDuration,
     // … Rest unverändert
   };
   ```
   Bilder behalten die nominale Dauer (kein Real-Probing).

**Datei:** `src/remotion/templates/ComposedAdVideo.tsx`

Keine Logik-Änderung nötig — der `isImage`-Pfad existiert bereits und nutzt `KenBurnsImage`. Wir bestätigen nur, dass das Schema `isImage` schon erlaubt (Zeile 75 — bereits vorhanden).

#### B) Vollvideo-Vorschau im Export-Tab anzeigen

**Datei:** `src/components/video-composer/AssemblyTab.tsx`

Über dem „Kosten-Zusammenfassung"-Block eine echte Live-Vorschau einbauen, die **dieselbe** robuste `ComposerSequencePreview`-Komponente wiederverwendet, die schon im Voiceover-Tab läuft (kennt Bild- + Video-Szenen, hat bereits Crossfade-Logik):

```tsx
<Card className="border-border/40 bg-card/80">
  <CardHeader className="pb-3">
    <CardTitle className="text-base flex items-center gap-2">
      <Film className="h-4 w-4 text-primary" />
      {t('videoComposer.previewFullVideo')}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <ComposerSequencePreview
      scenes={scenes}
      subtitles={assemblyConfig.subtitles}
      globalTextOverlays={assemblyConfig.globalTextOverlays}
      voiceoverUrl={assemblyConfig.voiceover?.audioUrl}
    />
  </CardContent>
</Card>
```

Vorteile:
- Nutzer sieht das Vollvideo **vor** dem (kostenpflichtigen) Render
- Bild-Szenen erscheinen via vorhandener `isImageScene`-Erkennung in `ComposerSequencePreview` korrekt als Bilder
- Watermark-Mini-Vorschau bleibt als Positionierungs-Helfer im `WatermarkEditor` erhalten

### Verifikation
1. Briefing → Modus „KI-Bilder" → Storyboard → Clips generieren → Export-Tab
2. Vollvideo-Vorschau zeigt **alle Szenen als Bilder** (Ken-Burns-Pan), nicht schwarz
3. „Video rendern" klicken → Render läuft erfolgreich durch (kein Code-4-Fehler mehr)
4. Fertiges MP4 zeigt Bilder mit sanften Crossfades und Voiceover/Musik in Sync
5. Gemischte Projekte (Video + Bild + Upload) → Render und Vorschau funktionieren beide
6. Watermark-Positions-Vorschau im Export-Tab funktioniert weiterhin

### Risiko & Aufwand
- **Risiko: niedrig.** Der Bilderpfad in Remotion (`KenBurnsImage`) ist seit Wochen produktiv (UniversalCreator/DirectorsCut). Wir aktivieren ihn nur für den Composer.
- **Aufwand:** ~10 Min — 2 Dateien (Edge Function + AssemblyTab), keine DB-Änderung, keine neuen Abhängigkeiten.

