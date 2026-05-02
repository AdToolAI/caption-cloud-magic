## Ziel

Im Director's Cut Studio öffnet der Button **„Video hinzufügen"** (links im Schnitt-Panel) aktuell nur einen lokalen Datei-Picker. Er soll stattdessen den bestehenden `AddMediaDialog` öffnen, sodass man Szenen aus drei Quellen erzeugen kann:

1. **Videos** aus der eigenen Mediathek (`video_creations`)
2. **Bilder** aus dem `images`-Bucket (mit einstellbarer Anzeigedauer)
3. **Upload** einer neuen Datei (Video oder Bild)

`AddMediaDialog.tsx` existiert bereits und unterstützt genau diese drei Tabs — er wird bisher nur im alten `SceneEditingStep` verwendet.

## Änderungen

### 1. `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
- Neue optionale Prop `onAddFromLibrary?: () => void` ergänzen.
- Den bestehenden „Video hinzufügen"-Button (Zeile 255–278) so umbauen, dass er — wenn `onAddFromLibrary` gesetzt ist — diesen Callback aufruft (öffnet den Dialog) statt direkt den File-Input zu triggern.
- Den lokalen `<input type="file">`-Pfad als Fallback behalten, falls `onAddFromLibrary` nicht gesetzt ist (Abwärtskompatibilität).
- Label leicht anpassen: Icon bleibt `FileVideo`, Text bleibt „Video hinzufügen" (Dialog enthält ja Videos + Bilder + Upload).

### 2. `src/components/directors-cut/studio/CapCutSidebar.tsx`
- Prop `onAddFromLibrary?: () => void` durchschleifen und an `CutPanel` weiterreichen (analog zum bestehenden `onAddVideoAsScene`).

### 3. `src/components/directors-cut/studio/CapCutEditor.tsx`
- `AddMediaDialog` importieren.
- Neuer State: `const [showAddMediaDialog, setShowAddMediaDialog] = useState(false);`
- An `CapCutSidebar` durchreichen: `onAddFromLibrary={() => setShowAddMediaDialog(true)}`.
- `<AddMediaDialog>` am Ende des JSX einbinden mit:
  - `open={showAddMediaDialog}`, `onOpenChange={setShowAddMediaDialog}`
  - `onMediaSelect={(media) => handleAddVideoAsScene(media.url, media.duration, media.name)}`
- `handleAddVideoAsScene` funktioniert bereits mit einer Remote-URL + Dauer + Name — keine Änderung nötig.
- **Bilder**: Da `handleAddVideoAsScene` ein Video-ähnliches Asset erwartet, prüfen wir vor dem Aufruf den `media.type`. Falls `image`, vorerst nur Videos zulassen und für Bilder eine kurze Hinweis-Toast zeigen („Bilder als Szene werden in einem späteren Schritt unterstützt") — ODER (bevorzugt) sofort mitumsetzen: einen kleinen Wrapper, der Bild-URLs als Hintergrund einer Blackscreen-Szene mit der gewählten Anzeigedauer anlegt.

> Default-Vorgehen: **Videos sofort funktional**, Bilder/Upload nutzen denselben Pfad (`handleAddVideoAsScene`) — Hochgeladene Videos kommen so über die `images`/`video-uploads`-Bucket-URL bereits als richtige Szene rein. Für Bilder: Hinweis-Toast, bis die Bild-als-Szene-Logik bestätigt ist.

## Technische Details

- `AddMediaDialog` lädt aus `video_creations` (status=`completed`) bis zu 20 Videos pro User → ausreichend für die Mediathek-Allgemein-Auswahl.
- Der Dialog liefert `{ type, url, duration, name, thumbnail }` — passt 1:1 zur Signatur von `handleAddVideoAsScene(url, duration, name)`.
- Keine DB-Migrationen nötig, keine neuen Edge Functions.
- Keine i18n-String-Änderungen erforderlich (Button-Label bleibt).

## Offene Frage (kann nach Approval geklärt werden)

Sollen **Bilder** aus der Mediathek im Director's Cut auch als Szene einfügbar sein (mit Standbild für die gewählte Dauer)? Falls ja, ergänze ich `handleAddVideoAsScene` um einen `mediaType`-Parameter und render im Preview ein `<img>` statt `<video>` für solche Szenen. Falls nein, blende ich den „Bilder"-Tab im Dialog aus, wenn er aus dem Director's Cut geöffnet wird.
