import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        print(f"File {file_path} not found")
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'tx' not in content and 'import { tx }' not in content and 'import { tx, useTx }' not in content:
        import_match = re.search(r'import .+ from .+;', content)
        if import_match:
            end_pos = import_match.end()
            content = content[:end_pos] + '\nimport { tx } from "@/lib/i18nText";' + content[end_pos:]
        else:
            content = 'import { tx } from "@/lib/i18nText";\n' + content

    for old, new in replacements:
        content = content.replace(old, new)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# HybridExtendDialog.tsx
replace_in_file('src/components/video-composer/HybridExtendDialog.tsx', [
    ("prequelHint: 'Was passierte davor?'", "prequelHint: tx({ de: 'Was passierte davor?', en: 'What happened before?', es: '¿Qué pasó antes?' })"),
    ("castLabel: 'Hauptdarsteller (AI-Engine)'", "castLabel: tx({ de: 'Hauptdarsteller (AI-Engine)', en: 'Lead actor (AI engine)', es: 'Actor principal (motor de IA)' })"),
    ("castOff: 'Im Off'", "castOff: tx({ de: 'Im Off', en: 'Off-screen', es: 'Fuera de cámara' })"),
    ("targetScene: 'Ziel-Szene'", "targetScene: tx({ de: 'Ziel-Szene', en: 'Target scene', es: 'Escena de destino' })"),
    ("quality: 'Qualität'", "quality: tx({ de: 'Qualität', en: 'Quality', es: 'Calidad' })"),
    ("standard: 'Standard'", "standard: tx({ de: 'Standard', en: 'Standard', es: 'Estándar' })"),
    ("pro: 'Pro'", "pro: tx({ de: 'Pro', en: 'Pro', es: 'Pro' })"),
    ("duration: 'Dauer'", "duration: tx({ de: 'Dauer', en: 'Duration', es: 'Duración' })"),
    ("seconds: 'Sek.'", "seconds: tx({ de: 'Sek.', en: 'Sec.', es: 'Seg.' })"),
    ("prompt: 'Regie-Anweisung'", "prompt: tx({ de: 'Regie-Anweisung', en: 'Director\'s note', es: 'Instrucción del director' })"),
    ("cost: 'Drehbudget'", "cost: tx({ de: 'Drehbudget', en: 'Shoot budget', es: 'Presupuesto de rodaje' })"),
    ("rolling: 'Kamera läuft …'", "rolling: tx({ de: 'Kamera läuft …', en: 'Camera running …', es: 'Cámara en marcha …' })")
])

# directors-cut.ts
replace_in_file('src/types/directors-cut.ts', [
    ("description: 'Echte Edge-Detection + Cel-Shading'", "description: tx({ de: 'Echte Edge-Detection + Cel-Shading', en: 'Real edge detection + cel shading', es: 'Detección de bordes real + sombreado plano' })"),
    ("description: 'Glow-Effekte + Anime-Farbpalette'", "description: tx({ de: 'Glow-Effekte + Anime-Farbpalette', en: 'Glow effects + anime color palette', es: 'Efectos de brillo + paleta de colores de anime' })"),
    ("description: 'Scanlines + RGB-Verschiebung + Grain'", "description: tx({ de: 'Scanlines + RGB-Verschiebung + Grain', en: 'Scanlines + RGB shift + grain', es: 'Líneas de exploración + cambio de RGB + grano' })"),
    ("description: 'Neon-Glow + Cyan/Magenta-Palette'", "description: tx({ de: 'Neon-Glow + Cyan/Magenta-Palette', en: 'Neon glow + cyan/magenta palette', es: 'Brillo de neón + paleta de cian/magenta' })"),
    ("description: 'Weicher Glow + Highlight-Bloom'", "description: tx({ de: 'Weicher Glow + Highlight-Bloom', en: 'Soft glow + highlight bloom', es: 'Brillo suave + resplandor de reflejos' })"),
    ("description: 'Desaturiert + Grün-Tint + Film-Grain'", "description: tx({ de: 'Desaturiert + Grün-Tint + Film-Grain', en: 'Desaturated + green tint + film grain', es: 'Desaturado + tinte verde + grano de película' })"),
    ("description: 'Extreme Posterization + Warhol-Style'", "description: tx({ de: 'Extreme Posterization + Warhol-Style', en: 'Extreme posterization + Warhol style', es: 'Posterización extrema + estilo Warhol' })"),
    ("description: 'Falschfarben-Thermal-Look'", "description: tx({ de: 'Falschfarben-Thermal-Look', en: 'False color thermal look', es: 'Aspecto térmico de falso color' })"),
    ("description: 'Edge-Glow + Neon-Farben'", "description: tx({ de: 'Edge-Glow + Neon-Farben', en: 'Edge glow + neon colors', es: 'Brillo en los bordes + colores de neón' })"),
    ("description: 'Authentisches Film-Grain + Farbshift'", "description: tx({ de: 'Authentisches Film-Grain + Farbshift', en: 'Authentic film grain + color shift', es: 'Grano de película auténtico + cambio de color' })"),
    ("description: 'Desaturiert + Hoher Kontrast'", "description: tx({ de: 'Desaturiert + Hoher Kontrast', en: 'Desaturated + high contrast', es: 'Desaturado + alto contraste' })"),
    ("description: 'Farbkanal-Verschiebung'", "description: tx({ de: 'Farbkanal-Verschiebung', en: 'Color channel shift', es: 'Desplazamiento del canal de color' })"),
    ("description: 'Neon-Stadtlichter'", "description: tx({ de: 'Neon-Stadtlichter', en: 'Neon city lights', es: 'Luces de la ciudad de neón' })"),
    ("description: 'Lomographischer Look'", "description: tx({ de: 'Lomographischer Look', en: 'Lomographic look', es: 'Aspecto lomográfico' })"),
    ("description: 'Klassischer Kodak Portra Film'", "description: tx({ de: 'Klassischer Kodak Portra Film', en: 'Classic Kodak Portra film', es: 'Película clásica Kodak Portra' })"),
    ("description: 'Fuji Velvia Diafilm'", "description: tx({ de: 'Fuji Velvia Diafilm', en: 'Fuji Velvia slide film', es: 'Película de diapositivas Fuji Velvia' })"),
    ("description: 'Klassischer Technicolor-Look'", "description: tx({ de: 'Klassischer Technicolor-Look', en: 'Classic Technicolor look', es: 'Look clásico de Technicolor' })"),
    ("{ id: 'fadeIn', name: 'Fade In', description: 'Sanftes Einblenden' }", "{ id: 'fadeIn', name: 'Fade In', description: tx({ de: 'Sanftes Einblenden', en: 'Soft fade-in', es: 'Desvanecimiento suave' }) }"),
    ("{ id: 'scaleUp', name: 'Scale Up', description: 'Vergrößern von klein' }", "{ id: 'scaleUp', name: 'Scale Up', description: tx({ de: 'Vergrößern von klein', en: 'Enlarge from small', es: 'Agrandar desde pequeño' }) }"),
    ("{ id: 'bounce', name: 'Bounce', description: 'Hüpfende Animation' }", "{ id: 'bounce', name: 'Bounce', description: tx({ de: 'Hüpfende Animation', en: 'Bouncing animation', es: 'Animación de rebote' }) }"),
    ("{ id: 'typewriter', name: 'Typewriter', description: 'Schreibmaschine' }", "{ id: 'typewriter', name: 'Typewriter', description: tx({ de: 'Schreibmaschine', en: 'Typewriter', es: 'Máquina de escribir' }) }"),
    ("{ id: 'highlight', name: 'Highlight', description: 'Marker-Effekt' }", "{ id: 'highlight', name: 'Highlight', description: tx({ de: 'Marker-Effekt', en: 'Marker effect', es: 'Efecto marcador' }) }"),
    ("{ id: 'glitch', name: 'Glitch', description: 'Digitaler Störeffekt' }", "{ id: 'glitch', name: 'Glitch', description: tx({ de: 'Digitaler Störeffekt', en: 'Digital glitch effect', es: 'Efecto de falla digital' }) }"),
    ("{ id: 'slideLeft', name: 'Slide ←', description: 'Von rechts hereinfahren' }", "{ id: 'slideLeft', name: 'Slide ←', description: tx({ de: 'Von rechts hereinfahren', en: 'Slide in from the right', es: 'Deslizar desde la derecha' }) }"),
    ("{ id: 'slideRight', name: 'Slide →', description: 'Von links hereinfahren' }", "{ id: 'slideRight', name: 'Slide →', description: tx({ de: 'Von links hereinfahren', en: 'Slide in from the left', es: 'Deslizar desde la izquierda' }) }"),
    ("{ id: 'slideUp', name: 'Slide ↑', description: 'Von unten hereinfahren' }", "{ id: 'slideUp', name: 'Slide ↑', description: tx({ de: 'Von unten hereinfahren', en: 'Slide in from below', es: 'Deslizar desde abajo' }) }"),
    ("{ id: 'slideDown', name: 'Slide ↓', description: 'Von oben hereinfahren' }", "{ id: 'slideDown', name: 'Slide ↓', description: tx({ de: 'Von oben hereinfahren', en: 'Slide in from above', es: 'Deslizar desde arriba' }) }"),
    ("{ id: 'wipe', name: 'Wipe', description: 'Balken schiebt frei' }", "{ id: 'wipe', name: 'Wipe', description: tx({ de: 'Balken schiebt frei', en: 'Bar pushes free', es: 'La barra se libera' }) }"),
    ("{ id: 'pop', name: 'Pop', description: 'Kurzer Feder-Impuls' }", "{ id: 'pop', name: 'Pop', description: tx({ de: 'Kurzer Feder-Impuls', en: 'Short spring pulse', es: 'Pulso de resorte corto' }) }"),
    ("{ id: 'blurIn', name: 'Blur In', description: 'Aus der Unschärfe' }", "{ id: 'blurIn', name: 'Blur In', description: tx({ de: 'Aus der Unschärfe', en: 'Out of focus', es: 'Fuera de foco' }) }"),
    ("{ id: 'stagger', name: 'Zeilen-Stagger', description: 'Wörter nacheinander' }", "{ id: 'stagger', name: 'Zeilen-Stagger', description: tx({ de: 'Wörter nacheinander', en: 'Words one after another', es: 'Palabras una tras otra' }) }"),
    ("{ id: 'tickerLoop', name: 'Ticker', description: 'Endlos durchlaufend' }", "{ id: 'tickerLoop', name: 'Ticker', description: tx({ de: 'Endlos durchlaufend', en: 'Continuously running', es: 'Corriendo continuamente' }) }"),
    ("{ id: 'none', name: 'Ohne', description: 'Hart einblenden' }", "{ id: 'none', name: 'Ohne', description: tx({ de: 'Hart einblenden', en: 'Hard fade-in', es: 'Fundido de entrada duro' }) }"),
    ("{ id: 'cta', name: 'CTA Button', text: 'JETZT KAUFEN',", "{ id: 'cta', name: tx({ de: 'CTA Button', en: 'CTA Button', es: 'Botón CTA' }), text: tx({ de: 'JETZT KAUFEN', en: 'BUY NOW', es: 'COMPRAR AHORA' }),"),
    ("{ id: 'hashtag', name: 'Hashtags', text: '#trending #viral',", "{ id: 'hashtag', name: tx({ de: 'Hashtags', en: 'Hashtags', es: 'Hashtags' }), text: '#trending #viral',"),
    ("{ id: 'watermark', name: 'Watermark', text: '@username',", "{ id: 'watermark', name: tx({ de: 'Watermark', en: 'Watermark', es: 'Marca de agua' }), text: '@username',"),
    ("{ id: 'title', name: 'Titel', text: 'Mein Video',", "{ id: 'title', name: tx({ de: 'Titel', en: 'Title', es: 'Título' }), text: tx({ de: 'Mein Video', en: 'My Video', es: 'Mi Video' }),"),
    ("{ id: 'impact', name: 'Impact', text: 'WOW!',", "{ id: 'impact', name: tx({ de: 'Impact', en: 'Impact', es: 'Impacto' }), text: 'WOW!',"),
    ("{ id: 'countdown', name: 'Countdown', text: '3...2...1',", "{ id: 'countdown', name: tx({ de: 'Countdown', en: 'Countdown', es: 'Cuenta regresiva' }), text: '3...2...1',")
])

# useAICoPilot.ts
# Fixing nested tx calls and German strings
replace_in_file('src/hooks/useAICoPilot.ts', [
    ('• tx({ de: "Analysiere Szenen", en: "Analyze scenes", es: "Analizar escenas" }) - Startet KI-Analyse', '• Analysiere Szenen - Startet KI-Analyse'),
    ('• tx({ de: "Teile Szene", en: "Share scene", es: "compartir escena" }) - Aktuelle Szene splitten (oder Taste S)', '• Teile Szene - Aktuelle Szene splitten (oder Taste S)'),
    ('• tx({ de: "Dupliziere Szene", en: "Duplicate scene", es: "escena duplicada" }) - Szene kopieren (oder Taste D)', '• Dupliziere Szene - Szene kopieren (oder Taste D)'),
    ('• tx({ de: "Lösche Szene", en: "Delete scene", es: "eliminar escena" }) - Szene entfernen (oder Delete)', '• Lösche Szene - Szene entfernen (oder Delete)'),
    ('de: "Wende", en: "Applying", es: "Aplicando"', '"Wende"'), # Simplified back for concatenation
    ('localCommand.params.style || tx({ de: "Style", en: "style", es: "estilo" })', 'localCommand.params.style || "Style"'),
    ('preset || tx({ de: "Farbkorrektur", en: "color correction", es: "corrección de color" })', 'preset || "Farbkorrektur"'),
    ('quality || "HD"', 'quality || "HD"'),
    ('tx({ de: "Starte", en: "Starting", es: "Iniciando" })', '"Starte"'),
    ('tx({ de: "Export", en: "export", es: "exportación" })', '"Export"'),
    ('tx({ de: "ausgeführt", en: "executed", es: "ejecutado" })', 'tx({ de: "ausgeführt", en: "executed", es: "ejecutado" })')
])
