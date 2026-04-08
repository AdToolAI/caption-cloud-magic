

## Plan: Demo-Video durch letztes Director's Cut Video ersetzen

### Änderung

Die `output_url` in `src/constants/demo-video.ts` wird auf das zuletzt gerenderte Director's Cut Video aktualisiert.

**Neue URL:** `https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-13gm4o6s90/renders/w25s7m56p8/directors-cut-f19f61ff-9253-40da-9e49-31ac870f8557.mp4`

(Gerendert am 8.4.2026, 19:47 Uhr)

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `src/constants/demo-video.ts` | `output_url` + `created_at` + `metadata.title` aktualisieren |

### Auswirkung

Das neue Video erscheint automatisch auf der Startseite (Hero/Karussell), in der Mediathek-Demo-Ansicht und überall wo `DEMO_VIDEO` referenziert wird.

