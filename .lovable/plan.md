

## Plan: Konfigurierbares Watermark im Composer Export-Tab

User will im Export-Tab des Motion Studios das Watermark vollständig konfigurieren: An/Aus, Text, Position, Größe.

### Was ich gefunden habe

- `ExportOptions` (in `ExportOptionsEditor.tsx`) hat aktuell nur `includeWatermark: boolean` — kein Text, keine Position, keine Größe
- Der Composer-Renderer (`ComposedAdVideo.tsx`) und die Assemble-Edge-Function müssen die Watermark-Config durchreichen
- Im Screenshot sehe ich: Color Grading + Kinetic Typography sind schon im Export-Tab — Watermark fehlt komplett als sichtbare Sektion

### Änderungen

**1. `src/types/video-composer.ts` (oder wo `AssemblyConfig` definiert ist)**
Neuen Typ ergänzen:
```ts
interface WatermarkConfig {
  enabled: boolean;
  text: string;              // z.B. "@deinname" oder "MyBrand"
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  size: 'small' | 'medium' | 'large';   // 16/24/36 px @ 1080p
  opacity: number;           // 0.3–1.0, default 0.7
}
```
Default: `{ enabled: false, text: '', position: 'bottom-right', size: 'medium', opacity: 0.7 }`

**2. `src/components/video/ExportOptionsEditor.tsx` (oder Composer-Pendant im Export-Tab)**
Watermark-Sektion ausbauen:
- Switch "Wasserzeichen anzeigen"
- Wenn aktiv: Input für Text, 5-Optionen-Grid für Position (Eck-Auswahl), Slider/Select für Größe, optional Opacity-Slider
- Live-Preview-Hint (kleine Vorschau-Box mit dem Text an gewählter Position)

**3. Composer Export-Tab Komponente** (`src/components/video-composer/AssemblyTab.tsx` o.ä.)
Neue Watermark-Karte zwischen "Color Grading" und dem Director's-Cut-Hinweis einfügen — gleiche James-Bond-2028-Optik (gold accent, glassmorphism).

**4. `src/remotion/templates/ComposedAdVideo.tsx`**
Watermark als `<AbsoluteFill>` Overlay über alle Szenen rendern (außerhalb der `<TransitionSeries>`, damit es bei Crossfades stabil bleibt). Position via `flexbox` justify/align, Größe via fontSize-Mapping (small=16/medium=24/large=36 px relativ zur 1080p-Höhe).

**5. `supabase/functions/compose-video-assemble/index.ts`**
`watermark`-Config in die Render-Payload an Lambda durchreichen.

**6. Persistierung**
`useComposerPersistence.ts` speichert `assembly_config` bereits — Watermark ist Teil davon, also kein DB-Schema-Change nötig.

**7. Bundle-Redeploy**
Renderer-Änderung → `bash scripts/deploy-remotion-bundle.sh` muss laufen (mache ich nach Code-Änderung).

### Was bleibt

- Aktueller `includeWatermark: boolean` wird erweitert, nicht ersetzt — wir mappen `enabled` auf das alte Feld für Backwards-Compat
- Andere Export-Optionen (Format, Quality, FPS, EndScreen) unverändert

