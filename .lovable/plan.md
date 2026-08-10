# Seedance 2.5: Referenz-Limit und Video-Referenzen gegen die ModelArk-Doku prüfen

## Was heute im Code steht (verifiziert)

- `src/config/aiVideoModelRegistry.ts`, Eintrag `seedance-2-5`: `multiRef: true`, `maxReferences: 7`, `refExclusive: true`, kein `v2v`, kein `endFrame`. Deshalb zeigt die UI „Multi-Reference (0–7 Bilder, optional)".
- `supabase/functions/_shared/modelark.ts`: Referenzbilder werden hart auf die ersten 7 gekappt (`.slice(0, 7)`), Rollen `reference_image` / `first_frame` / `last_frame`. Ein Video-Input existiert dort nicht.

Die Zahl 7 stammt aus unserer eigenen Annahme beim Erstintegrieren, nicht aus einer belegten Stelle der ModelArk-Doku. Ob 30 Referenzen oder Video-Referenzen möglich sind, ist damit offen — ich behaupte weder das eine noch das andere, bevor die Doku es sagt.

## Vorgehen

1. **Doku-Check ModelArk / BytePlus Ark** für `dreamina-seedance-2-5-260628`: maximale Anzahl `reference_image`-Einträge pro Task, erlaubte Kombination mit `first_frame` / `last_frame`, ob `video_url`-Inputs (Video-Referenz / Video-Extension) unterstützt werden, sowie Auflösungs- und Dauer-Enums. Quelle wird mit Link in `docs/ai-video-capability-matrix.md` protokolliert.
2. **Grenzwert-Test gegen die Live-API**, falls die Doku unklar bleibt: eine Task mit steigender Bildanzahl (8, 12, 30) auf kürzester Dauer/niedrigster Auflösung anlegen und die Provider-Antwort protokollieren. Kosten bleiben minimal, weil abgelehnte Tasks nichts erzeugen.
3. **Limit anheben, wenn belegt**: `maxReferences` in der Registry und der `slice()`-Cap in `modelark.ts` auf den verifizierten Wert setzen; UI-Text („0–N Bilder") und der Uploader ziehen automatisch nach.
4. **Video-Referenz nur, wenn die API sie kennt**: dann `v2v` bzw. ein Referenz-Video-Feld ergänzen (Registry + Edge Function + Upload-Feld in `ToolkitGenerator`). Ist es nicht dokumentiert, bleibt es aus, und die Matrix hält fest warum.
5. **Test erweitern**: `src/config/__tests__/aiVideoModelCapabilities.test.ts` prüft, dass `maxReferences` der Registry mit dem Server-Cap übereinstimmt, damit UI und Backend nie wieder auseinanderlaufen.

## Technische Details

Betroffen: `src/config/aiVideoModelRegistry.ts`, `supabase/functions/_shared/modelark.ts`, ggf. `supabase/functions/generate-seedance25-video/index.ts` und `src/components/ai-video/MultiReferenceUploader.tsx` / `ToolkitGenerator.tsx`, plus Matrix-Doku und Test.

Keine Änderung an Preisen, Credits, Poller oder Lip-Sync-Kette.
