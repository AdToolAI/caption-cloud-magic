

## Plan: Google Drive als externen Cloud-Speicher anbinden

### Konzept

Nutzer können ihren Google Drive verbinden und Medien dorthin auslagern. Der lokale Speicher (10 GB) bleibt bestehen, aber Google Drive dient als Erweiterung -- ältere oder große Dateien können dorthin verschoben oder direkt dort gespeichert werden.

### Voraussetzungen

Die Google OAuth-Credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) sind bereits vorhanden. Es muss lediglich der **Google Drive API Scope** (`https://www.googleapis.com/auth/drive.file`) zur bestehenden OAuth-Konfiguration hinzugefügt werden.

### Umsetzung

**1. Datenbank: Cloud-Storage-Verbindungen speichern**
- Neue Tabelle `cloud_storage_connections` mit Feldern: user_id, provider (google_drive/dropbox), access_token (encrypted), refresh_token (encrypted), token_expires_at, folder_id, is_active, quota_bytes, used_bytes
- RLS: Nur eigene Verbindungen sichtbar

**2. Edge Function: `cloud-storage-oauth`**
- Startet den Google Drive OAuth-Flow mit dem zusätzlichen Scope `drive.file`
- Callback speichert Tokens verschlüsselt in `cloud_storage_connections`
- Token-Refresh-Logik (wie bei YouTube bereits vorhanden)

**3. Edge Function: `cloud-storage-sync`**
- Upload: Datei von Supabase Storage nach Google Drive kopieren
- Download: Datei von Google Drive holen und temporär bereitstellen
- List: Dateien im verbundenen Google Drive Ordner auflisten
- Delete: Datei in Google Drive löschen

**4. UI: Cloud-Storage-Einstellungen**
- Neuer Bereich in den Account-Settings oder direkt in der Mediathek-Header
- "Google Drive verbinden"-Button mit OAuth-Flow
- Anzeige: Verbundener Account, verfügbarer Speicher, Ordner-Auswahl
- Toggle: "Neue Medien automatisch in Cloud speichern"

**5. Mediathek-Integration**
- Cloud-Medien werden mit einem Cloud-Badge markiert
- Neuer Tab/Filter: "Cloud" neben "Alle Medien", "Uploads", etc.
- Kontextmenü pro Medium: "In Cloud verschieben" / "Lokal herunterladen"
- Speicheranzeige im Header erweitern: Lokaler Speicher + Cloud-Speicher

**6. MediaLibrary.tsx anpassen**
- `NormalizedMediaItem` um `storageLocation: 'local' | 'cloud'` erweitern
- Beim Laden Cloud-Medien aus `cloud_storage_connections` + Drive API mischen
- Löschen/Verschieben-Logik für Cloud-Dateien

### Betroffene Dateien

1. Migration: `cloud_storage_connections` Tabelle + RLS
2. `supabase/functions/cloud-storage-oauth/index.ts` -- OAuth-Flow
3. `supabase/functions/cloud-storage-sync/index.ts` -- Upload/Download/List
4. `src/hooks/useCloudStorage.ts` -- React-Hook für Cloud-Status
5. `src/components/media-library/CloudStorageConnect.tsx` -- Verbindungs-UI
6. `src/pages/MediaLibrary.tsx` -- Cloud-Tab und Badge-Integration
7. `src/components/media-library/MediaLibraryHeroHeader.tsx` -- Erweiterte Speicheranzeige

### Einschränkung

Google Drive API erfordert, dass der `drive.file`-Scope im Google Cloud Console Projekt aktiviert ist. Da die OAuth-Verifizierung bereits abgeschlossen ist, muss bei Scope-Änderungen ggf. eine neue Verifizierung eingereicht werden.

