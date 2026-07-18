## Ausgangslage

Im Video Composer / Motion Studio Stage gibt es aktuell **kein UI-Feld** für ein Referenzbild direkt an der Szene. Referenzen kommen ausschließlich aus Cast & World (`brand_characters.reference_image_url`, `brand_locations.reference_image_url`, Snippets).

Das Datenmodell trägt aber bereits ein optionales Feld: `Scene.referenceImageUrl` (`src/types/video-composer.ts:242-243`) — es wird von den Compose-Pipelines als i2v-Anchor akzeptiert. Es fehlt lediglich die Bedien-UI.

Vorgabe des Nutzers:
- Slot soll **nur sichtbar** sein, wenn der **Lip-Sync-Toggle deaktiviert** ist (bei aktivem Lip-Sync kollidieren zwei Referenzbilder mit dem Anchor/Plate-Flow).
- Bedienung analog zum AI Video Studio (`ToolkitGenerator` → `MultiReferenceUploader`), also Drag-and-drop + Preview + Entfernen.

## Änderungen (nur Frontend / Persistenz-Mapping)

1. **`src/components/video-composer/SceneAvatarMode.tsx`**
   - Neuen Block „Szenen-Referenzbild (optional)" direkt unter dem Lip-Sync-Toggle rendern, **conditional** `!lipSyncOn`.
   - Wiederverwendung des bestehenden Upload-Patterns aus `ToolkitGenerator.handleImageUpload` (Supabase Storage Bucket `user-uploads`, User-ID als erstes Path-Segment gemäß RLS-Constraint aus dem Core-Memory).
   - State-Update via `onUpdate({ referenceImageUrl: url })` + Persistierung nach `composer_scenes.reference_image_url` (Spalte existiert bereits, wird von der Pipeline gelesen).
   - Preview mit „Entfernen"-Button (setzt Feld auf `null`).
   - Hinweistext: „Wird als Startframe (i2v-Anchor) an das AI-Video-Modell übergeben."

2. **Auto-Cleanup bei Lip-Sync-Reaktivierung**
   - Wenn `lipSyncWithVoiceover` von `false` → `true` gesetzt wird und `scene.referenceImageUrl` gefüllt ist: Feld nicht löschen, aber UI ausblenden + Toast: „Referenzbild ausgeblendet – Lip-Sync nutzt den Charakter-Anchor."
   - Kein Datenverlust: bei erneutem Ausschalten des Lip-Syncs erscheint das Bild wieder.

3. **Keine Backend-Änderungen nötig**
   - `compose-video-clips` verarbeitet `referenceImageUrl` bereits als `start_image` / `first_frame_image` / `image` je Engine (siehe `modelConsistencyRanking.ts`).
   - Keine neue Migration, keine RLS-Änderung.

## Nicht Teil dieses Plans

- Kein Upload-Slot bei aktivem Lip-Sync (bewusst, wie vom Nutzer vorgegeben).
- Keine Änderung an Cast & World oder Snippet-Referenzbild-Pfaden.
- Kein „Als Charakter speichern"-Button (kann später ergänzt werden).

## Verifikation nach Build

- Toggle Lip-Sync AUS → Upload-Slot erscheint, Bild hochladen, Szene rendern → in Edge-Logs steht `start_image`/`first_frame_image` = hochgeladene URL.
- Toggle Lip-Sync AN → Slot verschwindet, Wert bleibt persistiert.
- Reload der Szene → Preview-Thumbnail des Referenzbildes wieder sichtbar.
