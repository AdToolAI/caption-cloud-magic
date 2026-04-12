/**
 * Localization helper for the Universal Video Creator pipeline.
 * All status messages and AI prompts in EN/DE/ES.
 */

type Lang = 'en' | 'de' | 'es';

const STATUS_MESSAGES: Record<string, Record<Lang, string>> = {
  // Script generation
  'generating_script': { de: '📝 Drehbuch wird erstellt...', en: '📝 Generating script...', es: '📝 Generando guion...' },
  'script_complete': { de: '✅ Drehbuch fertig!', en: '✅ Script complete!', es: '✅ ¡Guion listo!' },

  // Character
  'generating_character': { de: '🎭 Charakter wird erstellt...', en: '🎭 Creating character...', es: '🎭 Creando personaje...' },
  'character_complete': { de: '✅ Charakter fertig!', en: '✅ Character complete!', es: '✅ ¡Personaje listo!' },

  // Visuals
  'generating_visuals': { de: '🎨 Szenen-Bilder werden erstellt...', en: '🎨 Generating scene images...', es: '🎨 Generando imágenes de escenas...' },
  'visuals_progress': { de: '🎨 {done}/{total} Szenen-Bilder fertig...', en: '🎨 {done}/{total} scene images done...', es: '🎨 {done}/{total} imágenes listas...' },
  'visuals_progress_priority': { de: '🎨 {done}/{total} Szenen-Bilder fertig (Priorität)...', en: '🎨 {done}/{total} scene images done (priority)...', es: '🎨 {done}/{total} imágenes listas (prioridad)...' },
  'visuals_complete': { de: '✅ Alle Szenen-Bilder fertig!', en: '✅ All scene images complete!', es: '✅ ¡Todas las imágenes listas!' },

  // Voiceover
  'generating_voiceover': { de: '🎙️ Voiceover wird erstellt...', en: '🎙️ Generating voiceover...', es: '🎙️ Generando voz en off...' },
  'voiceover_complete': { de: '✅ Voiceover fertig!', en: '✅ Voiceover complete!', es: '✅ ¡Voz en off lista!' },

  // Subtitles
  'generating_subtitles': { de: '📝 Untertitel werden erstellt...', en: '📝 Generating subtitles...', es: '📝 Generando subtítulos...' },
  'subtitles_complete': { de: '✅ Untertitel fertig!', en: '✅ Subtitles complete!', es: '✅ ¡Subtítulos listos!' },

  // Music
  'selecting_music': { de: '🎵 Hintergrundmusik wird ausgewählt...', en: '🎵 Selecting background music...', es: '🎵 Seleccionando música de fondo...' },
  'music_complete_with': { de: '✅ Hintergrundmusik ausgewählt!', en: '✅ Background music selected!', es: '✅ ¡Música de fondo seleccionada!' },
  'music_complete_without': { de: '✅ Audio vorbereitet (nur Voiceover)', en: '✅ Audio prepared (voiceover only)', es: '✅ Audio preparado (solo voz en off)' },

  // Beat analysis
  'analyzing_beats': { de: '🎼 Beat-Analyse läuft...', en: '🎼 Analyzing beats...', es: '🎼 Analizando ritmos...' },
  'beats_complete': { de: '✅ Beat-Analyse fertig!', en: '✅ Beat analysis complete!', es: '✅ ¡Análisis de ritmo completo!' },

  // Rendering
  'rendering': { de: '🎬 Video wird gerendert...', en: '🎬 Rendering video...', es: '🎬 Renderizando video...' },
  'rendering_preparing': { de: '🚀 Rendering wird vorbereitet...', en: '🚀 Preparing render...', es: '🚀 Preparando renderizado...' },

  // Errors
  'error_schema': { de: 'Schema-Fehler', en: 'Schema error', es: 'Error de esquema' },
  'error_preflight': { de: 'Pre-flight Fehler', en: 'Pre-flight error', es: 'Error de pre-vuelo' },
  'error_generic': { de: 'Fehler', en: 'Error', es: 'Error' },
  'error_render_only': { de: 'Render-Only Fehler', en: 'Render-only error', es: 'Error de solo renderizado' },

  // Capacity/cooldown
  'capacity_cooldown': { de: 'Zu viele fehlgeschlagene Versuche. Bitte warte 10 Minuten und versuche es dann erneut.', en: 'Too many failed attempts. Please wait 10 minutes and try again.', es: 'Demasiados intentos fallidos. Espera 10 minutos e inténtalo de nuevo.' },
  'render_retry_limit': { de: 'Maximale Render-Retries erreicht. Bitte warte einige Minuten.', en: 'Maximum render retries reached. Please wait a few minutes.', es: 'Máximo de reintentos alcanzado. Espera unos minutos.' },
  'render_only_no_payload': { de: 'Kein wiederverwendbarer Render-Payload gefunden. Bitte starte eine neue Generierung.', en: 'No reusable render payload found. Please start a new generation.', es: 'No se encontró un payload reutilizable. Inicia una nueva generación.' },

  // Render-only status
  'render_only_retry': { de: '🔄 Render-Only Retry — Assets werden wiederverwendet...', en: '🔄 Render-only retry — reusing assets...', es: '🔄 Reintento solo-render — reutilizando assets...' },
  'render_only_forced': { de: '🔄 Server-seitig erzwungener Render-Only Retry — Assets werden wiederverwendet...', en: '🔄 Server-forced render-only retry — reusing assets...', es: '🔄 Reintento forzado por servidor — reutilizando assets...' },
};

export function msg(key: string, lang?: string, params?: Record<string, string | number>): string {
  const l = (lang === 'en' || lang === 'es') ? lang : 'de';
  let text = STATUS_MESSAGES[key]?.[l] || STATUS_MESSAGES[key]?.['de'] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
