## Was wirklich passiert ist

Der Lip-Sync scheitert nicht an Sync.so, nicht an der Plate und nicht an der Geometrie. Er scheitert an einem Prüf-Baustein, der gegen unsere eigene AWS-only-Regel gebaut wurde.

Belegt aus den Logs des letzten Laufs (`7c11bc27…`, alle Passes):

```
model_lookup_404:{"detail":"Model not found."}   ← lucataco/ffmpeg-extract-frame
→ frames_0_of_4 → verdict=unknown
→ NOOP-suspect → Retry → "Bitte Plate neu rendern"
```

Die Kette:

1. Der Motion-Probe (v344/v346) will messen, ob sich der Mund im Sync.so-Ergebnis bewegt.
2. Dafür wurde **Replicate/lucataco** eingebaut — obwohl die Regel „AWS-only, kein Lucataco" gilt und in `_shared/face-frame-extract.ts` sogar wörtlich dokumentiert ist.
3. Dieses Replicate-Modell existiert nicht mehr und antwortet mit 404 — bei jedem Frame, jedem Pass, seit dem Deploy.
4. Also nie Frames, nie eine Messung, immer `unknown`.
5. `unknown` wird fälschlich wie ein Provider-NOOP behandelt → Retry → Hard-Fail.

Zwei Verstöße gleichzeitig, und das ist auch der Grund für das Im-Kreis-Drehen:

- **Verstoß gegen AWS-only**: Der Regelbruch wurde nicht bemerkt, weil er in einem neuen Shared-Modul steckte statt im bereits gesäuberten `face-frame-extract.ts`.
- **Verstoß gegen den v169-Fehlerkontrakt**: v169 kennt nur *transient* und *terminal*. Die neue dritte Klasse „Messung nicht verfügbar" wurde auf *terminal* gemappt und verbrennt echte Sync.so-Versuche.

## Fix v347 — AWS statt Replicate

1. **Replicate vollständig aus der Bewegungsprüfung entfernen**
   - `lucataco/ffmpeg-extract-frame` und der komplette Replicate-Aufrufpfad fliegen aus `_shared/mouth-motion-verdict.ts` raus.
   - Ersatz: die bereits produktive **AWS-Strecke** (Remotion Lambda, `REMOTION_SERVE_URL`), mit der wir ohnehin schon Preclips und Plates rendern. Sie liefert die Probe-Frames des Sync.so-Ergebnisses aus AWS, ohne neuen Fremdanbieter.
   - Die Frames landen in unserer Storage; die Luminanz-Differenz im Mundband wird unverändert wie bisher berechnet.
   - Ergebnis: In der gesamten Lip-Sync-Pipeline existiert kein Replicate-Frame-Extractor mehr.

2. **Messfehler dürfen keine Lip-Sync-Versuche mehr verbrennen**
   - `static` = echter Provider-NOOP → weiterhin Ladder, danach Hard-Fail. Unverändert streng.
   - `unknown` = unsere Messung ausgefallen → wird protokolliert, zählt **nicht** als Versuch, setzt **nicht** `needs_clip_rerender`, zeigt dem Kunden **nicht** „Plate neu rendern".
   - Unverifizierte Passes werden trotzdem nicht stillschweigend gemuxt.

3. **Regel technisch absichern, nicht nur dokumentieren**
   - Guard-Test, der die gesamte Lip-Sync-Pipeline nach `lucataco`, `replicate.com/v1/predictions` und `ffmpeg-extract-frame` durchsucht und fehlschlägt, sobald es wieder auftaucht.
   - Damit kann dieser Regelbruch nicht ein 51. Mal unbemerkt hineinrutschen.
   - Zusätzlich Tests: 404/Timeout ändert weder `noop_escalation_step` noch `twoshot_stage`; nur echte Frames unter der Schwelle ergeben `static`.

4. **Projekt-Memory aktualisieren**
   - Harte Regel als `constraint` speichern: keine Replicate-/Lucataco-Frame-Extraktion in der Lip-Sync-Pipeline, AWS-only, inklusive Begründung.

5. **Deploy und Verifikation**
   - Nur `sync-so-webhook` plus geteiltes Modul.
   - Prüfen: Frames > 0, echter Verdict, kein 404, kein falscher Retry.

## Offen und wichtig

Erst nach diesem Fix haben wir überhaupt wieder eine funktionierende Messung. Sollte dann ein Pass echtes `static` liefern, reden wir zum ersten Mal seit Tagen über ein reales Sync.so- oder Plate-Thema — bisher war jede darauf aufgebaute Geometrie-Änderung Blindflug.