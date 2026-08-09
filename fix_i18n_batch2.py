import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        print(f"File {file_path} not found")
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'tx' not in content and 'import { tx }' not in content and 'import { tx, useTx }' not in content:
        # Try to insert after other imports
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

# BatchGeneratePanel.tsx
replace_in_file('src/components/picture-studio/BatchGeneratePanel.tsx', [
    ('toast.error("Mindestens 1 Prompt eingeben");', 'toast.error(tx({ de: "Mindestens 1 Prompt eingeben", en: "Enter at least 1 prompt", es: "Introduce al menos 1 mensaje" }));'),
    ('toast.error("Max. 20 Prompts pro Batch");', 'toast.error(tx({ de: "Max. 20 Prompts pro Batch", en: "Max. 20 prompts per batch", es: "Máx. 20 indicaciones por lote" }));'),
    ('`Nicht genügend Credits. Brauchst ${currencySymbol}${totalCost.toFixed(2)}.`', 'tx({ de: `Nicht genügend Credits. Du benötigst ${currencySymbol}${totalCost.toFixed(2)}.`, en: `Not enough credits. You need ${currencySymbol}${totalCost.toFixed(2)}.`, es: `No hay suficientes créditos. Necesitas ${currencySymbol}${totalCost.toFixed(2)}.` })'),
    ('`Batch fertig: ${prompts.filter((_, i) => true).length} verarbeitet`', 'tx({ de: `Batch fertig: ${prompts.length} verarbeitet`, en: `Batch finished: ${prompts.length} processed`, es: `Lote terminado: ${prompts.length} procesado` })'),
    ('Aufladen', '{tx({ de: "Aufladen", en: "Top up", es: "Recargar" })}'),
    ('Prompts (1 pro Zeile, max. 20)', '{tx({ de: "Prompts (1 pro Zeile, max. 20)", en: "Prompts (1 per line, max. 20)", es: "Indicaciones (1 por línea, máx. 20)" })}'),
    ('`${prompts.length} Prompt${prompts.length !== 1 ? \'s\' : \'\'} erkannt`', 'tx({ de: `${prompts.length} Prompt${prompts.length !== 1 ? "s" : ""} erkannt`, en: `${prompts.length} prompt${prompts.length !== 1 ? "s" : ""} recognized`, es: `${prompts.length} prompt${prompts.length !== 1 ? "s" : ""} reconocido` })'),
    ('Max. 20 Prompts erlaubt', '{tx({ de: "Max. 20 Prompts erlaubt", en: "Max. 20 prompts allowed", es: "Máx. 20 indicaciones permitidas" })}'),
    ('Qualität & Modell', '{tx({ de: "Qualität & Modell", en: "Quality & Model", es: "Calidad y modelo" })}'),
    ('{currencySymbol}{TIER_COSTS[t].toFixed(2)}/Bild', '{currencySymbol}{TIER_COSTS[t].toFixed(2)}/{tx({ de: "Bild", en: "Image", es: "Imagen" })}'),
    ('<Label>Stil</Label>', '<Label>{tx({ de: "Stil", en: "Style", es: "Estilo" })}</Label>'),
    ('<SelectItem value="realistic">Realistisch</SelectItem>', '<SelectItem value="realistic">{tx({ de: "Realistisch", en: "Realistic", es: "Realista" })}</SelectItem>'),
    ('<SelectItem value="cinematic">Cinematic</SelectItem>', '<SelectItem value="cinematic">{tx({ de: "Cinematic", en: "Cinematic", es: "Cinematográfico" })}</SelectItem>'),
    ('<SelectItem value="product-photo">Produktfoto</SelectItem>', '<SelectItem value="product-photo">{tx({ de: "Produktfoto", en: "Product photo", es: "Foto de producto" })}</SelectItem>'),
    ('<SelectItem value="minimalist">Minimalistisch</SelectItem>', '<SelectItem value="minimalist">{tx({ de: "Minimalistisch", en: "Minimalist", es: "Minimalista" })}</SelectItem>'),
    ('<SelectItem value="editorial">Editorial</SelectItem>', '<SelectItem value="editorial">{tx({ de: "Editorial", en: "Editorial", es: "Editorial" })}</SelectItem>'),
    ('<SelectItem value="3d-render">3D Render</SelectItem>', '<SelectItem value="3d-render">{tx({ de: "3D Render", en: "3D Render", es: "Renderizado 3D" })}</SelectItem>'),
    ('<Label>Format</Label>', '<Label>{tx({ de: "Format", en: "Format", es: "Formato" })}</Label>'),
    ('<SelectItem value="1:1">1:1 Quadrat</SelectItem>', '<SelectItem value="1:1">{tx({ de: "1:1 Quadrat", en: "1:1 Square", es: "1:1 Cuadrado" })}</SelectItem>'),
    ('<SelectItem value="16:9">16:9 Landscape</SelectItem>', '<SelectItem value="16:9">{tx({ de: "16:9 Landscape", en: "16:9 Landscape", es: "16:9 Paisaje" })}</SelectItem>'),
    ('<SelectItem value="9:16">9:16 Portrait</SelectItem>', '<SelectItem value="9:16">{tx({ de: "9:16 Portrait", en: "9:16 Portrait", es: "9:16 Retrato" })}</SelectItem>'),
    ('<SelectItem value="4:5">4:5 Instagram</SelectItem>', '<SelectItem value="4:5">{tx({ de: "4:5 Instagram", en: "4:5 Instagram", es: "4:5 Instagram" })}</SelectItem>'),
    ('Brand-Kit aktiv:', '{tx({ de: "Brand-Kit aktiv:", en: "Brand Kit active:", es: "Kit de marca activo:" })}'),
    ('\'Markenkit\'', 'tx({ de: "Markenkit", en: "Brand Kit", es: "Kit de marca" })'),
    ('Farben & Mood werden in jeden Prompt injiziert', '{tx({ de: "Farben & Mood werden in jeden Prompt injiziert", en: "Colors & mood are injected into every prompt", es: "Los colores y el estado de ánimo se inyectan en cada mensaje." })}'),
    ('Gesamtkosten', '{tx({ de: "Gesamtkosten", en: "Total cost", es: "Coste total" })}'),
    ('Credits unzureichend', '{tx({ de: "Credits unzureichend", en: "Insufficient credits", es: "Créditos insuficientes" })}'),
    ('`Generiere ${completed}/${items.length}…`', 'tx({ de: `Generiere ${completed}/${items.length}…`, en: `Generating ${completed}/${items.length}…`, es: `Generando ${completed}/${items.length}…` })'),
    ('`Batch starten (${prompts.length} Bilder)`', 'tx({ de: `Batch starten (${prompts.length} Bilder)`, en: `Start batch (${prompts.length} images)`, es: `Iniciar lote (${prompts.length} imágenes)` })'),
    ('`${successCount} erfolgreich · ${items.filter(i => i.status === \'failed\').length} fehlgeschlagen · ${completed} / ${items.length}`', 'tx({ de: `${successCount} erfolgreich · ${items.filter(i => i.status === "failed").length} fehlgeschlagen · ${completed} / ${items.length}`, en: `${successCount} successful · ${items.filter(i => i.status === "failed").length} failed · ${completed} / ${items.length}`, es: `${successCount} exitoso · ${items.filter(i => i.status === "failed").length} fallido · ${completed} / ${items.length}` })'),
    ('Wartet…', '{tx({ de: "Wartet…", en: "Waiting…", es: "Esperando…" })}')
])

# LiveSweepTab.tsx
replace_in_file('src/pages/admin/LiveSweepTab.tsx', [
    ('toast.warning("Sweep läuft länger als 10 Min"', 'toast.warning(tx({ de: "Sweep läuft länger als 10 Min", en: "Sweep running longer than 10 min", es: "El barrido dura más de 10 minutos." })'),
    ('`Sweep abgeschlossen — ${ok + expected + asyncStarted}/${rows.length} grün`', 'tx({ de: `Sweep abgeschlossen — ${ok + expected + asyncStarted}/${rows.length} grün`, en: `Sweep completed — ${ok + expected + asyncStarted}/${rows.length} green`, es: `Barrido completado — ${ok + expected + asyncStarted}/${rows.length} verde` })'),
    ('`${failed} failed · ${timeout} timeout · ${asyncStarted} async · ${expected} expected · ${skipped} skipped · ${spent.toFixed(2)} € ausgegeben`', 'tx({ de: `${failed} fehlgeschlagen · ${timeout} Zeitüberschreitung · ${asyncStarted} async · ${expected} erwartet · ${skipped} übersprungen · ${spent.toFixed(2)} € ausgegeben`, en: `${failed} failed · ${timeout} timeout · ${asyncStarted} async · ${expected} expected · ${skipped} skipped · ${spent.toFixed(2)} € spent`, es: `${failed} fallido · ${timeout} tiempo agotado · ${asyncStarted} asíncrono · ${expected} esperado · ${skipped} omitido · ${spent.toFixed(2)} € gastado` })'),
    ('toast.success("Test-Assets bereit"', 'toast.success(tx({ de: "Test-Assets bereit", en: "Test assets ready", es: "Activos de prueba listos" })'),
    ('`${(data as any)?.assets?.length ?? 0} Asset(s) im Bucket.`', 'tx({ de: `${(data as any)?.assets?.length ?? 0} Asset(s) im Bucket.`, en: `${(data as any)?.assets?.length ?? 0} asset(s) in bucket.`, es: `${(data as any)?.assets?.length ?? 0} activo(s) en el cubo.` })'),
    ('`Sweep gestartet — ${s.total} Provider`', 'tx({ de: `Sweep gestartet — ${s.total} Provider`, en: `Sweep started — ${s.total} providers`, es: `Barrido iniciado — ${s.total} proveedores` })'),
    ('"UI updated sich live, ~3-8 Min erwartet."', 'tx({ de: "UI updated sich live, ~3-8 Min erwartet.", en: "UI updates live, ~3-8 min expected.", es: "La interfaz de usuario se actualiza en vivo, se esperan entre 3 y 8 minutos." })'),
    ('`Sweep abgeschlossen — ${effectiveOk}/${s?.total_tested ?? 0} grün`', 'tx({ de: `Sweep abgeschlossen — ${effectiveOk}/${s?.total_tested ?? 0} grün`, en: `Sweep completed — ${effectiveOk}/${s?.total_tested ?? 0} green`, es: `Barrido completado — ${effectiveOk}/${s?.total_tested ?? 0} verde` })'),
    ('Live Sweep — Hard Cap (per Run)', '{tx({ de: "Live Sweep — Hard Cap (pro Run)", en: "Live Sweep — Hard Cap (per run)", es: "Barrido en vivo — Límite estricto (por ejecución)" })}'),
    ('"Noch nie ausgeführt."', 'tx({ de: "Noch nie ausgeführt.", en: "Never executed.", es: "Nunca ejecutado." })'),
    ('Sweep läuft …', '{tx({ de: "Sweep läuft …", en: "Sweep running …", es: "Barrido en curso …" })}'),
    ('`Run Live Sweep (Cap: ${cap.toFixed(0)} €)`', 'tx({ de: `Run Live Sweep (Cap: ${cap.toFixed(0)} €)`, en: `Run Live Sweep (Cap: ${cap.toFixed(0)} €)`, es: `Ejecutar barrido en vivo (Límite: ${cap.toFixed(0)} €)` })'),
    ('Live Sweep starten?', '{tx({ de: "Live Sweep starten?", en: "Start live sweep?", es: "¿Iniciar barrido en vivo?" })}'),
    ('Dies feuert <strong>echte Provider-Calls</strong> bei Replicate, Runway und Hedra.', '{tx({ de: "Dies feuert echte Provider-Calls bei Replicate, Runway und Hedra.", en: "This fires real provider calls at Replicate, Runway, and Hedra.", es: "Esto activa llamadas a proveedores reales en Replicate, Runway y Hedra." })}'),
    ('Geschätzte Kosten: ~8 €. Hard-Cap stoppt bei {cap.toFixed(2)} €.', '{tx({ de: `Geschätzte Kosten: ~8 €. Hard-Cap stoppt bei ${cap.toFixed(2)} €.`, en: `Estimated costs: ~8 €. Hard cap stops at ${cap.toFixed(2)} €.`, es: `Costos estimados: ~8 €. El límite estricto se detiene en ${cap.toFixed(2)} €.` })}'),
    ('Test-Assets müssen vorher per "Bootstrap Assets" erzeugt sein.', '{tx({ de: "Test-Assets müssen vorher per \"Bootstrap Assets\" erzeugt sein.", en: "Test assets must have been created beforehand via \"Bootstrap Assets\".", es: "Los activos de prueba deben haberse creado previamente mediante \"Activos de arranque\"." })}'),
    ('<AlertDialogCancel>Abbrechen</AlertDialogCancel>', '<AlertDialogCancel>{tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}</AlertDialogCancel>'),
    ('Sweep starten', '{tx({ de: "Sweep starten", en: "Start sweep", es: "Iniciar barrido" })}'),
    ('`${effectiveOk}/${sweepRuns.length} grün`', 'tx({ de: `${effectiveOk}/${sweepRuns.length} grün`, en: `${effectiveOk}/${sweepRuns.length} green`, es: `${effectiveOk}/${sweepRuns.length} verde` })'),
    ('` · ${sweepSpent.toFixed(2)} € ausgegeben`', '` · ${sweepSpent.toFixed(2)} € ${tx({ de: "ausgegeben", en: "spent", es: "gastado" })}`'),
    ('Noch keine Live-Sweeps. Klicke "Bootstrap Assets" und dann "Run Live Sweep".', '{tx({ de: "Noch keine Live-Sweeps. Klicke \"Bootstrap Assets\" und dann \"Run Live Sweep\".", en: "No live sweeps yet. Click \"Bootstrap Assets\" and then \"Run Live Sweep\".", es: "Aún no hay barridos en vivo. Haz clic en \"Activos de arranque\" y luego en \"Ejecutar barrido en vivo\"." })}')
])

# SlashCommandHandler.tsx
replace_in_file('src/components/ai-companion/SlashCommandHandler.tsx', [
    ('label: \'Credits anzeigen\'', 'label: tx({ de: "Credits anzeigen", en: "Show credits", es: "Mostrar créditos" })'),
    ('description: \'Erneuert Social Media Verbindung\'', 'description: tx({ de: "Erneuert Social Media Verbindung", en: "Renews social media connection", es: "Renueva la conexión a las redes sociales" })'),
    ('label: \'Tipps anzeigen\'', 'label: tx({ de: "Tipps anzeigen", en: "Show tips", es: "Mostrar consejos" })'),
    ('label: \'Einstellungen\'', 'label: tx({ de: "Einstellungen", en: "Settings", es: "Ajustes" })'),
    ('label: \'Hilfe\'', 'label: tx({ de: "Hilfe", en: "Help", es: "Ayuda" })'),
    ('Befehle', '{tx({ de: "Befehle", en: "Commands", es: "Comandos" })}'),
    ('📋 **Verfügbare Befehle:**', 'tx({ de: "📋 **Verfügbare Befehle:**", en: "📋 **Available commands:**", es: "📋 **Comandos disponibles:**" })'),
    ('Zeigt vollständige Account-Übersicht', 'tx({ de: "Zeigt vollständige Account-Übersicht", en: "Shows complete account overview", es: "Muestra la descripción completa de la cuenta" })'),
    ('Zeigt deine Credit-Balance', 'tx({ de: "Zeigt deine Credit-Balance", en: "Shows your credit balance", es: "Muestra tu saldo de crédito" })'),
    ('Zeigt aktive Video-Renderings', 'tx({ de: "Zeigt aktive Video-Renderings", en: "Shows active video renderings", es: "Muestra representaciones de vídeo activas" })'),
    ('Erneuert Social Media Verbindung', 'tx({ de: "Erneuert Social Media Verbindung", en: "Renews social media connection", es: "Renueva la conexión a las redes sociales" })'),
    ('Zeigt geplante Posts diese Woche', 'tx({ de: "Zeigt geplante Posts diese Woche", en: "Shows scheduled posts this week", es: "Muestra las publicaciones programadas de esta semana" })'),
    ('Zeigt personalisierte Tipps', 'tx({ de: "Zeigt personalisierte Tipps", en: "Shows personalized tips", es: "Muestra consejos personalizados" })'),
    ('Öffnet Account-Einstellungen', 'tx({ de: "Öffnet Account-Einstellungen", en: "Opens account settings", es: "Abre la configuración de la cuenta" })'),
    ('Zeigt diese Hilfe', 'tx({ de: "Zeigt diese Hilfe", en: "Shows this help", es: "Muestra esta ayuda" })'),
    ('💡 **Tipp:** Du kannst auch einfach Fragen stellen, ich verstehe natürliche Sprache!', 'tx({ de: "💡 **Tipp:** Du kannst auch einfach Fragen stellen, ich verstehe natürliche Sprache!", en: "💡 **Tip:** You can also just ask questions, I understand natural language!", es: "💡 **Consejo:** ¡También puedes hacer preguntas, entiendo el lenguaje natural!" })'),
    ('`Um eine Plattform neu zu verbinden, nutze:\\n\\n\\`/reconnect instagram\\`\\n\\`/reconnect youtube\\`\\n\\`/reconnect tiktok\\`\\n\\`/reconnect linkedin\\`\\n\\`/reconnect x\\`\\n\\nOder gehe direkt zu [Einstellungen](/settings/social-media).`', 'tx({ de: "Um eine Plattform neu zu verbinden, nutze:\\n\\n\\`/reconnect instagram\\`\\n\\`/reconnect youtube\\`\\n\\`/reconnect tiktok\\`\\n\\`/reconnect linkedin\\`\\n\\`/reconnect x\\`\\n\\nOder gehe direkt zu [Einstellungen](/settings/social-media).", en: "To reconnect a platform, use:\\n\\n\\`/reconnect instagram\\`\\n\\`/reconnect youtube\\`\\n\\`/reconnect tiktok\\`\\n\\`/reconnect linkedin\\`\\n\\`/reconnect x\\`\\n\\nOr go directly to [Settings](/settings/social-media).", es: "Para volver a conectar una plataforma, use:\\n\\n\\`/reconnect instagram\\`\\n\\`/reconnect youtube\\`\\n\\`/reconnect tiktok\\`\\n\\`/reconnect linkedin\\`\\n\\`/reconnect x\\`\\n\\nO vaya directamente a [Configuración](/settings/social-media)." })'),
    ('`Unbekannte Plattform: ${args[0]}. Verfügbare Plattformen: Instagram, YouTube, TikTok, LinkedIn, X, Facebook`', 'tx({ de: `Unbekannte Plattform: ${args[0]}. Verfügbare Plattformen: Instagram, YouTube, TikTok, LinkedIn, X, Facebook`, en: `Unknown platform: ${args[0]}. Available platforms: Instagram, YouTube, TikTok, LinkedIn, X, Facebook`, es: `Plataforma desconocida: ${args[0]}. Plataformas disponibles: Instagram, YouTube, TikTok, LinkedIn, X, Facebook` })')
])
