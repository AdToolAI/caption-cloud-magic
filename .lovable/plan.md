<final-text>
## Plan: Storytelling-Ausgabe vollständig ent-werblichen und storygenau machen

### Kernprobleme
- Die eigentliche Auto-Generierung nutzt noch eine alte Inline-Skriptlogik, die Storytelling intern weiter wie Werbung behandelt.
- Die Render-Pipeline fällt bei Storytelling aktuell auf falsche Kategorie-/Szenentypen zurück; dadurch landen Story-Szenen wieder in Werbe-/Social-Layouts.
- Das Render-Template zeigt noch Werbeelemente wie „JETZT HANDELN“, CTA-UI und ad-typische Badges.
- Die Interview-Ergebnisse werden noch zu stark in Produkt/USP/CTA-Felder gepresst, statt echte Story-Details sauber weiterzugeben.
- Die Bildprompts sind zu generisch/business-lastig und dadurch oft nicht präzise genug für die eigentliche Handlung.

### Umsetzung
1. **Storytelling-Logik vereinheitlichen**
- Die verwendete Inline-Skriptlogik auf denselben Storytelling-Stand bringen wie die neuere Storytelling-Funktion.
- Für Storytelling ausschließlich narrative Szenentypen verwenden: `opening`, `rising_action`, `climax`, `falling_action`, `resolution`, `epilogue`.
- CTA-, URL-, USP- und Verkaufsregeln im Storytelling-Pfad komplett entfernen.
- Storytelling-Defaults auf cineastische Werte setzen statt auf Werbe-Defaults.

2. **Interview-Daten als echte Story weitergeben**
- Die Consultant-Auswertung für Storytelling getrennt behandeln.
- Story-Felder sauber extrahieren und weiterreichen, z. B.:
  - Story-Modus
  - Protagonist
  - Konflikt
  - Setting
  - Wendepunkt
  - Moral/Botschaft
  - Erzählperspektive
  - visuelle Ästhetik
  - Motive/Symbole
- Frontend-Validierung/Fallbacks so anpassen, dass Storytelling nicht mehr künstlich Produktbeschreibung, CTA oder Werbestruktur erzwingt.

3. **Kategorie- und Szenentyp-Mapping reparieren**
- In der Render-Pipeline ein sauberes Mapping von App-Kategorien zu Render-Kategorien einführen, damit `storytelling` nicht mehr auf Social-/Werbe-Fallbacks fällt.
- Storytelling sauber auf das cineastische Story-Profil mappen.
- Narrative Strukturen und narrative Szenentypen in der Pipeline vollständig unterstützen, statt sie auf `feature`/`cta` zurückzusetzen.
- Dasselbe Mapping auch in der Preview anwenden, damit Vorschau und finaler Export gleich aussehen.

4. **Render-Template von Werbeoptik befreien**
- Für Storytelling keine CTA-Badges, kein „JETZT HANDELN“, keine CTA-Buttons und keine URL-Einblendung mehr anzeigen.
- Eigene Storytelling-Labels bzw. komplett badge-freie Darstellung verwenden.
- Textboxen, Gesten, Effekte und Layouts für Storytelling subtiler und filmischer machen.
- Storytelling-Szenentypen auch in Effekten, Gesten und Fallback-Stilen ergänzen, damit keine Werbe-Animationen mehr greifen.

5. **Bilder deutlich präziser auf die Story ausrichten**
- Für Storytelling eigene Bildprompt-Logik bauen:
  - Szene
  - Konflikt
  - Ort/Setting
  - Stimmung
  - wiederkehrende Motive
  - Tageszeit/Licht
  - cineastische Bildwirkung
- Business-/Produkt-Kontext im Storytelling-Pfad komplett entfernen.
- Retry-Prompts nicht mehr auf generische „business scene“-Formulierungen zurückfallen lassen.
- Optional pro Szene ein zusätzliches visuelles Ankerfeld erzeugen, damit Bilder konsistenter zur Erzählung passen.

### Technische Details
- **Keine Datenbankänderung nötig**
- Hauptdateien:
  - `supabase/functions/_shared/generate-script-inline.ts`
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/universal-video-consultant/index.ts`
  - `src/components/universal-video-creator/UniversalVideoConsultant.tsx`
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
  - `src/components/universal-video-creator/UniversalPreviewPlayer.tsx`
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - `src/utils/phonemeMapping.ts`
  - ggf. `src/types/universal-video-creator.ts`

### Ergebnis
- Storytelling fühlt sich nicht mehr wie ein Werbevideo an
- keine CTA-/Ad-Elemente mehr im Story-Modus
- Bilder passen genauer zur Handlung und Stimmung
- die im Interview gesammelten Story-Infos gehen nicht mehr unterwegs verloren
- Preview und finaler Export sehen im Storytelling-Modus konsistent cineastisch aus
</final-text>