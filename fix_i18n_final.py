import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'tx' not in content and 'import { tx }' not in content:
        import_match = re.search(r'import .+ from .+;', content)
        if import_match:
            end_pos = import_match.end()
            content = content[:end_pos] + '\nimport { tx } from "@/lib/i18nText";' + content[end_pos:]

    for old, new in replacements:
        content = content.replace(old, new)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# MediaLibrary.tsx
replace_in_file('src/pages/MediaLibrary.tsx', [
    ('title: "🎉 Neue Medien hinzugefügt!"', 'title: tx({ de: "🎉 Neue Medien hinzugefügt!", en: "🎉 New media added!", es: "🎉 ¡Nuevos medios añadidos!" })'),
    ('console.log(\'🎥 Neues Video hinzugefügt:\'', '// Log'),
    ('`Sora 2 ${metadata?.model === \'sora-2-pro\' ? \'Pro\' : \'Standard\'} · ${metadata?.duration_seconds}s`', 'tx({ de: `Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s`, en: `Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s`, es: `Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s` })'),
    ('`Director\'s Cut · Sora 2 ${metadata?.model === \'sora-2-pro\' ? \'Pro\' : \'Standard\'} · ${metadata?.duration_seconds}s`', 'tx({ de: `Director\'s Cut · Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s`, en: `Director\'s Cut · Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s`, es: `Director\'s Cut · Sora 2 ${metadata?.model === "sora-2-pro" ? "Pro" : "Standard"} · ${metadata?.duration_seconds}s` })'),
    ('\'Exportiert mit Universal Director\\\'s Cut\'', 'tx({ de: "Exportiert mit Universal Director\'s Cut", en: "Exported with Universal Director\'s Cut", es: "Exportado con Universal Director\'s Cut" })'),
    ('\'Dein erstes Video könnte so aussehen\'', 'tx({ de: "Dein erstes Video könnte so aussehen", en: "Your first video could look like this", es: "Tu primer vídeo podría verse así" })'),
    ('title: \'Import successful\'', 'title: tx({ de: "Import erfolgreich", en: "Import successful", es: "Importación exitosa" })'),
    ('description: \'Media imported from URL\'', 'description: tx({ de: "Medien von URL importiert", en: "Media imported from URL", es: "Medios importados de URL" })'),
    ('title: \'Import failed\'', 'title: tx({ de: "Import fehlgeschlagen", en: "Import failed", es: "Importación fallida" })'),
    ('title: \'Speicher-Limit erreicht\'', 'title: tx({ de: "Speicher-Limit erreicht", en: "Storage limit reached", es: "Límite de almacenamiento alcanzado" })'),
    ('title: \'Limit erreicht\'', 'title: tx({ de: "Limit erreicht", en: "Limit reached", es: "Límite alcanzado" })'),
    ('title: \'Platz geschaffen\'', 'title: tx({ de: "Platz geschaffen", en: "Space created", es: "Espacio creado" })'),
    ('description: \'Media uploaded successfully\'', 'description: tx({ de: "Medien erfolgreich hochgeladen", en: "Media uploaded successfully", es: "Medios subidos con éxito" })'),
    ('title: \'Gelöscht\'', 'title: tx({ de: "Gelöscht", en: "Deleted", es: "Eliminado" })'),
    ('title: "✉️ Media gesendet"', 'title: tx({ de: "✉️ Medien gesendet", en: "✉️ Media sent", es: "✉️ Medios enviados" })'),
    ('title: "📅 Media gesendet"', 'title: tx({ de: "📅 Medien gesendet", en: "📅 Media sent", es: "📅 Medios enviados" })'),
    ('title: "🎨 Media gesendet"', 'title: tx({ de: "🎨 Medien gesendet", en: "🎨 Media sent", es: "🎨 Medios enviados" })'),
    ('title: "📸 Media gesendet"', 'title: tx({ de: "📸 Medien gesendet", en: "📸 Media sent", es: "📸 Medios enviados" })'),
    ('Alle', '{tx({ de: "Alle", en: "All", es: "Todos" })}'),
    ('Uploads', '{tx({ de: "Uploads", en: "Uploads", es: "Cargas" })}'),
    ('Gerendert', '{tx({ de: "Gerendert", en: "Rendered", es: "Renderizado" })}'),
    ('Kampagnen', '{tx({ de: "Kampagnen", en: "Campaigns", es: "Campañas" })}'),
    ('Alben', '{tx({ de: "Alben", en: "Albums", es: "Álbumes" })}'),
    ('<Label>Search</Label>', '<Label>{tx({ de: "Suche", en: "Search", es: "Buscar" })}</Label>'),
    ('placeholder="Search media..."', 'placeholder={tx({ de: "Medien suchen...", en: "Search media...", es: "Buscar medios..." })}'),
    ('<Label>File Type</Label>', '<Label>{tx({ de: "Dateityp", en: "File Type", es: "Tipo de archivo" })}</Label>'),
    ('<SelectItem value="all">All Types</SelectItem>', '<SelectItem value="all">{tx({ de: "Alle Typen", en: "All Types", es: "Todos los tipos" })}</SelectItem>'),
    ('<SelectItem value="image">Images</SelectItem>', '<SelectItem value="image">{tx({ de: "Bilder", en: "Images", es: "Imágenes" })}</SelectItem>'),
    ('<SelectItem value="video">Videos</SelectItem>', '<SelectItem value="video">{tx({ de: "Videos", en: "Videos", es: "Videos" })}</SelectItem>'),
    ('ausgewählt', 'tx({ de: "ausgewählt", en: "selected", es: "seleccionado" })'),
    ('An Generator', 'tx({ de: "An Generator", en: "To generator", es: "Al generador" })'),
    ('An Composer', 'tx({ de: "An Composer", en: "To composer", es: "Al compositor" })'),
    ('In Kalender', 'tx({ de: "In Kalender", en: "To calendar", es: "Al calendario" })'),
    ('Löschen', 'tx({ de: "Löschen", en: "Delete", es: "Borrar" })'),
    ('Video abspielen', 'tx({ de: "Video abspielen", en: "Play video", es: "Reproducir video" })'),
    ('An KI-Post-Generator senden', 'tx({ de: "An KI-Post-Generator senden", en: "Send to AI post generator", es: "Enviar al generador de publicaciones de IA" })'),
    ('An Composer senden', 'tx({ de: "An Composer senden", en: "Send to composer", es: "Enviar al compositor" })'),
    ('In Kalender einplanen', 'tx({ de: "In Kalender einplanen", en: "Schedule in calendar", es: "Programar en el calendario" })'),
    ('Hintergrund ersetzen', 'tx({ de: "Hintergrund ersetzen", en: "Replace background", es: "Reemplazar fondo" })'),
    ('Herunterladen', 'tx({ de: "Herunterladen", en: "Download", es: "Descargar" })'),
    ('Lizenz-Zertifikat', 'tx({ de: "Lizenz-Zertifikat", en: "License certificate", es: "Certificado de licencia" })'),
    ('\'Unbenannt\'', 'tx({ de: "Unbenannt", en: "Untitled", es: "Sin título" })'),
    ('Wartet…', 'tx({ de: "Wartet…", en: "Waiting…", es: "Esperando…" })')
])
