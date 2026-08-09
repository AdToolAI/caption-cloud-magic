import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'tx' not in content and 'import { tx }' not in content and 'import { tx, useTx }' not in content:
        import_match = re.search(r'import .+ from .+;', content)
        if import_match:
            end_pos = import_match.end()
            content = content[:end_pos] + '\nimport { tx } from "@/lib/i18nText";' + content[end_pos:]

    for old, new in replacements:
        content = content.replace(old, new)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# src/components/ai/AIJobStatusBadge.tsx
replace_in_file('src/components/ai/AIJobStatusBadge.tsx', [
    ("label: 'Warteschlange',", "label: tx({ de: 'Warteschlange', en: 'Queue', es: 'Cola' }),"),
    ("label: 'Verarbeitung',", "label: tx({ de: 'Verarbeitung', en: 'Processing', es: 'Procesamiento' }),"),
    ("label: 'Abgeschlossen',", "label: tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completado' }),"),
    ("label: 'Fehlgeschlagen',", "label: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }),"),
    ("label: 'Abgebrochen',", "label: tx({ de: 'Abgebrochen', en: 'Cancelled', es: 'Cancelado' }),"),
    ("` (Versuch ${retryCount})`", "tx({ de: ` (Versuch ${retryCount})`, en: ` (Attempt ${retryCount})`, es: ` (Intento ${retryCount})` })")
])

# src/components/ai-video/ModelSelector.tsx
replace_in_file('src/components/ai-video/ModelSelector.tsx', [
    ('placeholder="Modell wählen…"', 'placeholder={tx({ de: "Modell wählen…", en: "Select model…", es: "Seleccionar modelo…" })}')
])

# src/components/audio-studio/AudioBeforeAfterComparison.tsx
replace_in_file('src/components/audio-studio/AudioBeforeAfterComparison.tsx', [
    ('<span>maximal</span>', '<span>{tx({ de: "maximal", en: "maximum", es: "máximo" })}</span>')
])

# src/components/brand/BrandVoiceLibrary.tsx
replace_in_file('src/components/brand/BrandVoiceLibrary.tsx', [
    ('Löschen', 'tx({ de: "Löschen", en: "Delete", es: "Eliminar" })')
])

# src/components/video-composer/briefing/ProductionPlanSheet.tsx
replace_in_file('src/components/video-composer/briefing/ProductionPlanSheet.tsx', [
    ('Produktionsplan', 'tx({ de: "Produktionsplan", en: "Production Plan", es: "Plan de producción" })'),
    ('Übersicht der Szenen', 'tx({ de: "Übersicht der Szenen", en: "Scene overview", es: "Resumen de escenas" })')
])

# src/pages/UpgradeEnterprise.tsx
replace_in_file('src/pages/UpgradeEnterprise.tsx', [
    ('Upgrade auf Enterprise', 'tx({ de: "Upgrade auf Enterprise", en: "Upgrade to Enterprise", es: "Actualizar a Enterprise" })'),
    ('Kontaktiere uns für ein individuelles Angebot', 'tx({ de: "Kontaktiere uns für ein individuelles Angebot", en: "Contact us for a custom quote", es: "Contáctenos para una oferta individual" })')
])

