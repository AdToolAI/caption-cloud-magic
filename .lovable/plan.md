## Ziel
Step 4 im Universal Content Creator soll das in Step 3 gewählte Video visuell 1:1 übernehmen: nur auf das gewählte Ausgabeformat eingepasst, aber ohne Schatten, Vignette, Color-Grading, Filmgrain, Style-Overlay, Ken-Burns, Szenen-FX oder sonstige Director’s-Cut-/Cinematic-Effekte.

## Gefundene Ursache
Der erste Fix hat `CategoryContrastOverlay` entfernt, aber im Step-4-Renderpfad sind weiterhin visuelle Post-Processing-Schichten aktiv:

- `CinematicPostLayer` erzeugt weiterhin Vignette/Filmgrain je nach Kategorie.
- `MOOD_FILTERS` verändert Helligkeit/Kontrast/Sättigung des Videos.
- `styleOverlays[style]` legt zusätzliche transparente Farbverläufe über das Bild.
- `SceneTypeEffects` kann je nach Szene weitere Schatten/Glow-Effekte setzen, falls nicht deaktiviert.
- Bildpfade enthalten teils zusätzliche `filter: saturate(...) contrast(...)`; für Video ist vor allem Cinematic/Post-Layer relevant.

## Umsetzung
1. **Raw-Preview-Modus für Universal Creator einführen**
   - Im Payload Builder `buildUniversalCreatorCustomizations` einen klaren Schalter setzen, z. B. `rawMediaMode: true` oder über `diag` einen Universal-Creator-spezifischen Clean-Modus.
   - Dieser Modus gilt für Preview und Export, damit Step 4 und finaler Render identisch bleiben.

2. **Alle visuellen Effekte im Universal-Creator-Pfad deaktivieren**
   - In `UniversalCreatorVideo.tsx` bei aktivem Raw-Modus:
     - kein `CinematicPostLayer`
     - kein `MOOD_FILTERS`-Filter
     - kein `styleOverlays[style]`
     - kein `SceneTypeEffects`
     - kein `FloatingIcons`
     - keine automatischen Ken-Burns-/Zoom-/Pan-Transformationen auf hochgeladenen Medien
   - `TextOverlay`, Untertitel und Audio bleiben separat steuerbar, aber das Hintergrundvideo selbst bleibt clean.

3. **Video-Einpassung auf Format beschränken**
   - Für Step 4 wird das Video mit stabiler Format-Anpassung gerendert:
     - Standard: `object-fit: cover`, damit das Zielformat sauber gefüllt wird.
     - Keine Abdunklung, keine Ränder, keine Schatten.
   - Falls gewünscht, kann später ein UI-Schalter `Füllen / Einpassen` ergänzt werden; für diesen Fix bleibt es bei der bestehenden Formatlogik ohne visuelle Filter.

4. **Fallback nur für echte Fehler verwenden**
   - Wenn ein Video nicht lädt, darf weiterhin ein Fallback erscheinen.
   - Dieser Fallback darf keine Vignette/Schatten enthalten und soll klar vom echten Video-Look getrennt bleiben.

5. **Validierung**
   - Einen lokalen Preview-Check mit einer Video-Szene machen:
     - Step 3 Rohvideo vs. Step 4 Remotion Preview vergleichen.
     - Prüfen, dass keine dunklen Ecken/Umrandungen mehr sichtbar sind.
     - Prüfen, dass Originalsound/Voiceover-Mix unverändert weiter funktioniert.

## Ergebnis
Step 4 zeigt das hochgeladene Video wie Step 3: nur ins Ausgabeformat gebracht, ohne zusätzliche Optik. Director’s-Cut-artige Looks bleiben aus dem Universal Content Creator draußen.