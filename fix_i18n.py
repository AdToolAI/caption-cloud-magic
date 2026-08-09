import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        print(f"File {file_path} not found")
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Add import if missing
    if 'tx' not in content and 'import { tx }' not in content and 'import { tx, useTx }' not in content:
        import_line = 'import { tx } from "@/lib/i18nText";\n'
        content = import_line + content
    elif 'import { useTx } from "@/lib/i18nText"' in content:
        content = content.replace('import { useTx } from "@/lib/i18nText"', 'import { tx, useTx } from "@/lib/i18nText"')

    for old, new in replacements:
        content = content.replace(old, new)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# LivePreview.tsx
replace_in_file('src/components/content-studio/LivePreview.tsx', [
    ('alt="Motiv-Vorschau"', 'alt={tx({ de: "Motiv-Vorschau", en: "Motif preview", es: "Vista previa del motivo" })}'),
    ('headline || "Deine Headline"', 'headline || tx({ de: "Deine Headline", en: "Your headline", es: "Tu titular" })'),
    ('subline || "Die Aussage in einem Satz."', 'subline || tx({ de: "Die Aussage in einem Satz.", en: "The statement in one sentence.", es: "La declaración en una frase." })')
])

# CharacterShotBadge.tsx
replace_in_file('src/components/video-composer/CharacterShotBadge.tsx', [
    ("{ label: 'Voll',", "{ label: tx({ de: 'Voll', en: 'Full', es: 'Completo' }),"),
    ("hint: 'Full Shot — Gesicht & Körper sichtbar (Establishing).'", "hint: tx({ de: 'Full Shot — Gesicht & Körper sichtbar (Establishing).', en: 'Full Shot — Face & body visible (Establishing).', es: 'Plano general: cara y cuerpo visibles (establecimiento).' })"),
    ("{ label: 'Ohne',", "{ label: tx({ de: 'Ohne', en: 'None', es: 'Ninguno' }),"),
    ("hint: 'Silhouette / Gegenlicht — Identifier statt Gesicht.'", "hint: tx({ de: 'Silhouette / Gegenlicht — Identifier statt Gesicht.', en: 'Silhouette / Backlight — Identifier instead of face.', es: 'Silueta / Contraluz — Identificador en lugar de cara.' })"),
    ("p className=\"font-medium mb-1\">Shot-Strategie: {meta.label}</p>", "p className=\"font-medium mb-1\">{tx({ de: 'Shot-Strategie:', en: 'Shot strategy:', es: 'Estrategia de toma:' })} {meta.label}</p>"),
    ("Weniger Gesichts-Closeups → konsistentere Charakter-Wahrnehmung.", "{tx({ de: 'Weniger Gesichts-Closeups → konsistentere Charakter-Wahrnehmung.', en: 'Fewer facial close-ups → more consistent character perception.', es: 'Menos primeros planos faciales → percepción del personaje más consistente.' })}"),
    ("lang === 'de' ? '— keiner —' : lang === 'es' ? '— ninguno —' : '— none —'", "tx({ de: '— keiner —', en: '— none —', es: '— ninguno —' })"),
    ("lang === 'de' ? 'Charakter:' : lang === 'es' ? 'Personaje:' : 'Character:'", "tx({ de: 'Charakter:', en: 'Character:', es: 'Personaje:' })"),
    ("REMOVE_LABEL: Record<Lang, string> = {", "// REMOVE_LABEL was here"),
    ("  en: 'Remove character from this scene',", ""),
    ("  de: 'Charakter aus dieser Szene entfernen',", ""),
    ("  es: 'Quitar personaje de esta escena',", ""),
    ("};", ""),
    ("aria-label={REMOVE_LABEL[lang]}", "aria-label={tx({ de: 'Charakter aus dieser Szene entfernen', en: 'Remove character from this scene', es: 'Quitar personaje de esta escena' })}"),
    ("{REMOVE_LABEL[lang]}", "{tx({ de: 'Charakter aus dieser Szene entfernen', en: 'Remove character from this scene', es: 'Quitar personaje de esta escena' })}")
])

