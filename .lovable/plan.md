## Befund (verifiziert im Code)

Die Startzeit wird zwar gespeichert und bis in den Render durchgereicht, aber die **Gesamtlänge der Timeline berücksichtigt den Offset nirgends**:

- `src/lib/universalCreatorDefaults.ts` → `computeTotalDurationSeconds()` rechnet `max(Voiceover-Dauer, Summe Szenendauern, Minimum)` — der Startzeitpunkt fließt nicht ein.
- `src/lib/universalCreatorRenderPayload.ts` (Z. 148-156) klemmt `voiceoverStartTime` auf `durationSeconds`. Setzt man die Startzeit ans Ende (oder darüber), landet der VO exakt auf dem letzten Frame → **gar kein hörbares Voiceover**.
- `supabase/functions/render-with-remotion/index.ts` (Z. 659-660) berechnet die Renderdauer identisch ohne Offset → im Export wird der VO abgeschnitten bzw. fällt raus.
- Beispiel: 15 s Szenen, VO 8 s, Start bei 10 s → Video bleibt 15 s, VO wird nach 5 s hart abgeschnitten; Start bei 15 s → 0 s VO.

Zusätzlich in der Vorschau: `RemotionPreviewPlayer` startet mit `isMuted = true`, während der Volume-Regler „100 %" anzeigt. Der Autoplay-Loop läuft dadurch stumm, obwohl die UI Ton suggeriert — das verstärkt den Eindruck „kein Voiceover".

## Umsetzung

**1. Timeline-Länge offset-bewusst machen**
- `computeTotalDurationSeconds()` um `voiceoverStartTime` erweitern: `max(voStart + voDuration, scenesSum, MIN)`.
- Alle Aufrufer mitgeben: `universalCreatorRenderPayload.ts`, `UniversalCreator.tsx` (Sidebar-Player), `PreviewExportStep.tsx`.

**2. Clamp korrigieren**
- In `universalCreatorRenderPayload.ts` den Start nicht mehr auf die alte Gesamtdauer klemmen, sondern nur auf einen sinnvollen Maximalwert (z. B. Szenensumme bzw. Timeline-Länge minus 0,1 s), damit der VO nie „hinter" dem Video liegt.

**3. Server-Renderdauer angleichen**
- In `render-with-remotion/index.ts` `totalDurationSeconds = max(sceneDurationSum, voStart + voDuration, 5)` — mit derselben Kappung auf das Maximum-Limit wie bisher.

**4. UI-Wahrheit im Editor**
- In `ContentVoiceStep.tsx` den Slider-Maximalwert an die tatsächliche Timeline koppeln und einen Hinweis zeigen, wenn `Start + VO-Länge` das Video verlängert („Video wird auf X s verlängert") — statt still zu kappen.

**5. Preview-Audio**
- `RemotionPreviewPlayer`: Mute-Zustand und Volume-Anzeige synchronisieren (Regler zeigt 0 %/Mute-Icon, solange stumm), damit klar ist, dass der Ton erst nach dem Unmute läuft. Vorhandene Autoplay-Policy (stumm starten) bleibt bestehen.

## Verifikation
- Preview: 15 s Szenen + 8 s VO mit Start 10 s → Timeline wird 18 s, VO startet hörbar bei 10 s und läuft vollständig durch.
- Export: gerenderte MP4-Länge und VO-Position stimmen mit der Vorschau überein.
