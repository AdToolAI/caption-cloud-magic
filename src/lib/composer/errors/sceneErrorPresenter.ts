/**
 * v430 Schritt 6.3 — Zentraler Fehler-Presenter (REINE DARSTELLUNG).
 *
 * Vertrag:
 *  - Diese Datei ist pure: keine Imports aus UI, DB, Hooks oder i18n-Runtime.
 *    Texte werden als `TriText` zurückgegeben und erst im Consumer mit `tx()` aufgelöst.
 *  - Erkennung ausschließlich über die explizite Tabelle unten (exakte Codes, definierte
 *    Präfixe, offizieller Provider-Code aus `[code]`). KEINE Freitext-Heuristik, die einen
 *    Backend-Fehler semantisch umdeutet — was nicht in der Tabelle steht, ist `unknown`.
 *  - Rohtext (`raw`) und Code bleiben unverändert erhalten und gehören in Debug/Details/Logs.
 *  - `autoRetryHint` ist reine Anzeige. Kein Gate, kein Trigger, keine Aktion hängt daran.
 *  - Interne Bezeichner (twoshot_stage, syncso_*, plate_*) werden NICHT umbenannt — sie
 *    erscheinen nur nicht mehr als Hauptbotschaft in der normalen UI.
 */

export type TriText = { de: string; en: string; es?: string };

export type SceneErrorKind = 'none' | 'known' | 'unknown';

export interface SceneErrorPresentation {
  kind: SceneErrorKind;
  /** Exakt extrahierter Code (Provider-Code aus `[…]` oder Tabellen-Match) — nur Debug/Badge. */
  code: string | null;
  /** Kundentaugliche Hauptbotschaft. */
  headline: TriText;
  /** Konkrete Handlungsempfehlung, falls definiert. */
  hint?: TriText;
  /** Nur Anzeige: Der Fehler wird vom System automatisch erneut versucht. */
  autoRetryHint: boolean;
  /** Ungekürzter Rohtext für Debug/Details. */
  raw: string;
}

const RERENDER_LIPSYNC: TriText = {
  de: 'Bitte „Lippensynchronisation neu erstellen" im Szenenmenü starten.',
  en: 'Please start "Re-create lip-sync" from the scene menu.',
  es: 'Inicia "Volver a crear la sincronización labial" en el menú de la escena.',
};

const RERENDER_FULL: TriText = {
  de: 'Bitte „Szene komplett neu erstellen" im Szenenmenü starten.',
  en: 'Please start "Re-create the whole scene" from the scene menu.',
  es: 'Inicia "Volver a crear la escena completa" en el menú de la escena.',
};

const REGENERATE_VOICE: TriText = {
  de: 'Bitte das Voiceover neu erzeugen und die Szene erneut starten.',
  en: 'Please regenerate the voiceover and start the scene again.',
  es: 'Vuelve a generar la locución e inicia la escena de nuevo.',
};

interface Entry {
  headline: TriText;
  hint?: TriText;
}

/**
 * Offizielle Provider-Fehlercodes (aus `[code]` im Rohtext).
 * Der Code selbst bleibt unverändert und wird nur als Debug-Chip gezeigt.
 */
const PROVIDER_CODES: Record<string, Entry> = {
  generation_timeout: {
    headline: { de: 'Der Lip-Sync-Dienst hat zu lange gebraucht.', en: 'The lip-sync service timed out.', es: 'El servicio de sincronización labial tardó demasiado.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_pipeline_failed: {
    headline: { de: 'Der Lip-Sync-Dienst konnte die Szene nicht verarbeiten.', en: 'The lip-sync service could not process the scene.', es: 'El servicio de sincronización labial no pudo procesar la escena.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_unhandled_error: {
    headline: { de: 'Beim Lip-Sync ist ein unerwarteter Fehler aufgetreten.', en: 'An unexpected error occurred during lip-sync.', es: 'Se produjo un error inesperado durante la sincronización labial.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_database_error: {
    headline: { de: 'Der Lip-Sync-Dienst ist vorübergehend gestört.', en: 'The lip-sync service is temporarily disrupted.', es: 'El servicio de sincronización labial está temporalmente interrumpido.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_infra_storage_error: {
    headline: { de: 'Der Lip-Sync-Dienst konnte die Datei nicht speichern.', en: 'The lip-sync service could not store the file.', es: 'El servicio de sincronización labial no pudo guardar el archivo.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_infra_resource_exhausted: {
    headline: { de: 'Der Lip-Sync-Dienst ist gerade überlastet.', en: 'The lip-sync service is currently overloaded.', es: 'El servicio de sincronización labial está sobrecargado.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_infra_service_unavailable: {
    headline: { de: 'Der Lip-Sync-Dienst ist gerade nicht erreichbar.', en: 'The lip-sync service is currently unavailable.', es: 'El servicio de sincronización labial no está disponible.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_input_audio_invalid: {
    headline: { de: 'Die Tonspur der Szene ist ungültig.', en: 'The scene audio is invalid.', es: 'El audio de la escena no es válido.' },
    hint: REGENERATE_VOICE,
  },
  generation_media_metadata_missing: {
    headline: { de: 'Zu Bild oder Ton fehlen Angaben.', en: 'Information about the video or audio is missing.', es: 'Faltan datos del video o del audio.' },
    hint: REGENERATE_VOICE,
  },
  generation_audio_length_exceeded: {
    headline: { de: 'Der Ton der Szene ist zu lang.', en: 'The scene audio is too long.', es: 'El audio de la escena es demasiado largo.' },
    hint: { de: 'Bitte den Dialog kürzen.', en: 'Please shorten the dialog.', es: 'Acorta el diálogo.' },
  },
  generation_text_length_exceeded: {
    headline: { de: 'Der Text der Szene ist zu lang.', en: 'The scene script is too long.', es: 'El guion de la escena es demasiado largo.' },
    hint: { de: 'Bitte das Skript kürzen.', en: 'Please shorten the script.', es: 'Acorta el guion.' },
  },
  generation_unsupported_model: {
    headline: { de: 'Das gewählte Lip-Sync-Modell ist nicht verfügbar.', en: 'The selected lip-sync model is unavailable.', es: 'El modelo de sincronización labial no está disponible.' },
    hint: RERENDER_LIPSYNC,
  },
  generation_audio_missing: {
    headline: { de: 'Für diese Szene fehlt das Voiceover.', en: 'The voiceover for this scene is missing.', es: 'Falta la locución de esta escena.' },
    hint: REGENERATE_VOICE,
  },
  generation_video_missing: {
    headline: { de: 'Das Video zu dieser Szene fehlt.', en: 'The video for this scene is missing.', es: 'Falta el video de esta escena.' },
    hint: RERENDER_FULL,
  },
  generation_input_validation_failed: {
    headline: { de: 'Der Lip-Sync-Dienst hat das Material abgelehnt.', en: 'The lip-sync service rejected the material.', es: 'El servicio de sincronización labial rechazó el material.' },
    hint: RERENDER_FULL,
  },
  generation_internal_auth: {
    headline: { de: 'Der Lip-Sync-Dienst hat den Zugriff abgelehnt.', en: 'The lip-sync service denied access.', es: 'El servicio de sincronización labial denegó el acceso.' },
    hint: { de: 'Bitte den Support kontaktieren.', en: 'Please contact support.', es: 'Contacta con el soporte.' },
  },
};

/** Exakte Codes (voller Rohtext-Match, case-sensitive). */
const EXACT_CODES: Record<string, Entry> = {
  multi_speaker_scene_routed_to_single_lipsync: {
    headline: { de: 'Die Dialogszene wurde falsch verteilt und wird neu aufgebaut.', en: 'The dialog scene was routed incorrectly and is being rebuilt.', es: 'La escena de diálogo se enrutó mal y se está reconstruyendo.' },
  },
  watchdog_stuck_lipsync_refunded: {
    headline: { de: 'Die Lippensynchronisation blieb stehen — die Credits wurden zurückerstattet.', en: 'Lip-sync got stuck — your credits were refunded.', es: 'La sincronización labial se bloqueó — se reembolsaron tus créditos.' },
    hint: RERENDER_LIPSYNC,
  },
  lipsync_canceled_by_user: {
    headline: { de: 'Die Lippensynchronisation wurde abgebrochen.', en: 'Lip-sync was canceled.', es: 'La sincronización labial se canceló.' },
  },
  audio_plan_not_ready_self_heal: {
    headline: { de: 'Die Tonvorbereitung läuft noch — die Szene wird automatisch fortgesetzt.', en: 'Audio preparation is still running — the scene continues automatically.', es: 'La preparación del audio sigue en curso — la escena continúa automáticamente.' },
  },
  audio_prep_transient_retry: {
    headline: { de: 'Die Tonvorbereitung wird automatisch wiederholt.', en: 'Audio preparation is retrying automatically.', es: 'La preparación del audio se reintenta automáticamente.' },
  },
  model_failed_silently: {
    headline: { de: 'Das Video-Modell hat die Erstellung ohne Angabe eines Grundes abgebrochen.', en: 'The video model aborted the generation without giving a reason.', es: 'El modelo de video interrumpió la generación sin dar un motivo.' },
    hint: RERENDER_FULL,
  },
  failed: {
    headline: { de: 'Das Video-Modell hat die Erstellung ohne Angabe eines Grundes abgebrochen.', en: 'The video model aborted the generation without giving a reason.', es: 'El modelo de video interrumpió la generación sin dar un motivo.' },
    hint: RERENDER_FULL,
  },
};

/** Definierte Präfixe (Reihenfolge = Priorität, längster/spezifischster zuerst). */
const PREFIX_CODES: Array<[string, Entry]> = [
  ['anchor_identity_clone_detected', {
    headline: { de: 'Eine Figur wurde doppelt erkannt.', en: 'A character was detected twice.', es: 'Un personaje se detectó dos veces.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_identity_duplicate_detected', {
    headline: { de: 'Eine Figur wurde doppelt erkannt.', en: 'A character was detected twice.', es: 'Un personaje se detectó dos veces.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_identity_missing_detected', {
    headline: { de: 'Im Bild fehlt eine der Figuren.', en: 'One of the characters is missing from the image.', es: 'Falta uno de los personajes en la imagen.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_identity_ambiguous', {
    headline: { de: 'Die Figuren im Bild sind nicht eindeutig erkennbar.', en: 'The characters in the image cannot be told apart.', es: 'Los personajes de la imagen no se distinguen con claridad.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_extra_person_detected', {
    headline: { de: 'Im Bild ist eine zusätzliche Person zu sehen.', en: 'An additional person appears in the image.', es: 'Aparece una persona adicional en la imagen.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_missing_speakers', {
    headline: { de: 'Es sind nicht alle Sprecher im Bild zu sehen.', en: 'Not all speakers are visible in the image.', es: 'No se ven todos los hablantes en la imagen.' },
    hint: RERENDER_FULL,
  }],
  ['anchor_identity_failed', {
    headline: { de: 'Das Ausgangsbild der Szene konnte nicht geprüft werden.', en: 'The scene reference image could not be verified.', es: 'No se pudo verificar la imagen de referencia de la escena.' },
    hint: RERENDER_FULL,
  }],
  ['source_clip_missing_speakers', {
    headline: { de: 'Im Video sind nicht alle Sprecher zu sehen.', en: 'Not all speakers are visible in the video.', es: 'No se ven todos los hablantes en el video.' },
    hint: RERENDER_FULL,
  }],
  ['dialog_too_long_for_plate', {
    headline: { de: 'Der Dialog ist länger als die Szene.', en: 'The dialog is longer than the scene.', es: 'El diálogo es más largo que la escena.' },
    hint: { de: 'Bitte den Dialog kürzen oder die Szene verlängern.', en: 'Please shorten the dialog or extend the scene.', es: 'Acorta el diálogo o alarga la escena.' },
  }],
  ['twoshot_audio_prep_failed', {
    headline: { de: 'Die Tonvorbereitung der Dialogszene ist fehlgeschlagen.', en: 'Audio preparation for the dialog scene failed.', es: 'Falló la preparación del audio de la escena de diálogo.' },
    hint: RERENDER_LIPSYNC,
  }],
  ['syncso_', {
    headline: { de: 'Der Lip-Sync-Dienst hat einen Fehler gemeldet.', en: 'The lip-sync service reported an error.', es: 'El servicio de sincronización labial informó un error.' },
    hint: RERENDER_LIPSYNC,
  }],
  ['watchdog_', {
    headline: { de: 'Die Szene blieb stehen und wurde abgebrochen.', en: 'The scene got stuck and was aborted.', es: 'La escena se bloqueó y se canceló.' },
    hint: RERENDER_LIPSYNC,
  }],
  ['auto-reset:', {
    headline: { de: 'Die Szene wurde automatisch zurückgesetzt und läuft weiter.', en: 'The scene was reset automatically and continues.', es: 'La escena se restableció automáticamente y continúa.' },
  }],
  ['auto-retry:', {
    headline: { de: 'Die Szene wird automatisch erneut versucht.', en: 'The scene is being retried automatically.', es: 'La escena se reintenta automáticamente.' },
  }],
  ['model_failed', {
    headline: { de: 'Das Video-Modell hat die Erstellung ohne Angabe eines Grundes abgebrochen.', en: 'The video model aborted the generation without giving a reason.', es: 'El modelo de video interrumpió la generación sin dar un motivo.' },
    hint: RERENDER_FULL,
  }],
  ['modelark_real_person_anchor_rejected', {
    headline: { de: 'Das Video-Modell hat das Ausgangsbild abgelehnt, weil darin reale Personen erkannt wurden.', en: 'The video model rejected the reference image because real people were detected in it.', es: 'El modelo de video rechazó la imagen de referencia porque detectó personas reales.' },
    hint: RERENDER_FULL,
  }],
  ['modelark_input_images_rejected', {
    headline: { de: 'Das Video-Modell hat das Eingabebild abgelehnt.', en: 'The video model rejected the input image.', es: 'El modelo de video rechazó la imagen de entrada.' },
    hint: { de: 'Bitte ein anderes, zulässiges Motiv verwenden.', en: 'Please use a different, permitted visual.', es: 'Usa otra imagen permitida.' },
  }],
  ['prompt_repair_exhausted', {
    headline: { de: 'Der Inhaltsfilter des Video-Modells hat die Szenenbeschreibung abgelehnt — auch der automatisch entschärfte Text wurde blockiert. Die Credits wurden zurückerstattet.', en: 'The video model content filter rejected the scene description — the automatically softened text was blocked too. Your credits were refunded.', es: 'El filtro de contenido del modelo rechazó la descripción de la escena — el texto suavizado también fue bloqueado. Se reembolsaron tus créditos.' },
    hint: { de: 'Bitte die Beschreibung kürzen oder ein anderes Video-Modell wählen.', en: 'Please shorten the description or choose a different video model.', es: 'Acorta la descripción o elige otro modelo de video.' },
  }],
  ['invalid_prompt_rejected', {
    headline: { de: 'Der Inhaltsfilter des Video-Modells hat die Szenenbeschreibung abgelehnt. Die Credits wurden zurückerstattet.', en: 'The video model content filter rejected the scene description. Your credits were refunded.', es: 'El filtro de contenido del modelo rechazó la descripción de la escena. Se reembolsaron tus créditos.' },
    hint: { de: 'Bitte die Beschreibung anpassen oder ein anderes Video-Modell wählen.', en: 'Please adjust the description or choose a different video model.', es: 'Ajusta la descripción o elige otro modelo de video.' },
  }],
  ['green_net_rejected', {
    headline: { de: 'Der Inhaltsfilter des Video-Modells hat die Szenenbeschreibung abgelehnt. Die Credits wurden zurückerstattet.', en: 'The video model content filter rejected the scene description. Your credits were refunded.', es: 'El filtro de contenido del modelo rechazó la descripción de la escena. Se reembolsaron tus créditos.' },
    hint: { de: 'Bitte die Beschreibung anpassen oder ein anderes Video-Modell wählen.', en: 'Please adjust the description or choose a different video model.', es: 'Ajusta la descripción o elige otro modelo de video.' },
  }],
];

/** Regex-Codes mit variablem Anteil (z. B. Pass-Nummern). */
const REGEX_CODES: Array<[RegExp, Entry]> = [
  [/^lipsync_pass_\d+_failed/, {
    headline: { de: 'Ein Lip-Sync-Durchgang ist fehlgeschlagen und wird wiederholt.', en: 'A lip-sync pass failed and is being retried.', es: 'Un pase de sincronización labial falló y se reintenta.' },
  }],
];

/** Rein anzeigende Angabe: Diese Fehler stößt das System selbst neu an. */
const AUTO_RETRY_EXACT = new Set([
  'multi_speaker_scene_routed_to_single_lipsync',
  'watchdog_stuck_lipsync_refunded',
  'audio_prep_transient_retry',
  'audio_plan_not_ready_self_heal',
]);
const AUTO_RETRY_PREFIXES = ['auto-retry:', 'auto-reset:'];
const AUTO_RETRY_REGEX = /^lipsync_pass_\d+_failed/;

export const NEUTRAL_SCENE_ERROR: TriText = {
  de: 'Diese Szene konnte nicht fertiggestellt werden.',
  en: 'This scene could not be completed.',
  es: 'No se pudo completar esta escena.',
};

const NEUTRAL_HINT: TriText = {
  de: 'Bitte die Szene erneut erstellen. Details stehen unter „Details".',
  en: 'Please create the scene again. Details are available under "Details".',
  es: 'Vuelve a crear la escena. Los detalles están en "Detalles".',
};

/** Offiziellen Provider-Code aus `[code]` extrahieren — ohne Umdeutung. */
export function extractProviderCode(raw: string): string | null {
  const m = raw.match(/\[([a-z][a-z0-9_]+)\]/i);
  return m ? m[1] : null;
}

function isAutoRetry(raw: string): boolean {
  if (AUTO_RETRY_EXACT.has(raw)) return true;
  if (AUTO_RETRY_REGEX.test(raw)) return true;
  return AUTO_RETRY_PREFIXES.some((p) => raw.startsWith(p));
}

/**
 * Übersetzt einen rohen `clip_error` in kundentaugliche Darstellung.
 * Reine Funktion — verändert nichts und interpretiert nichts jenseits der Tabellen.
 */
export function presentSceneError(rawInput: string | null | undefined): SceneErrorPresentation {
  const raw = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!raw) {
    return { kind: 'none', code: null, headline: NEUTRAL_SCENE_ERROR, autoRetryHint: false, raw: '' };
  }

  const autoRetryHint = isAutoRetry(raw);

  const providerCode = extractProviderCode(raw);
  if (providerCode && PROVIDER_CODES[providerCode]) {
    const e = PROVIDER_CODES[providerCode];
    return { kind: 'known', code: providerCode, headline: e.headline, hint: e.hint, autoRetryHint, raw };
  }

  if (EXACT_CODES[raw]) {
    const e = EXACT_CODES[raw];
    return { kind: 'known', code: raw, headline: e.headline, hint: e.hint, autoRetryHint, raw };
  }

  for (const [prefix, e] of PREFIX_CODES) {
    if (raw.startsWith(prefix)) {
      return { kind: 'known', code: prefix.replace(/[:_]$/, ''), headline: e.headline, hint: e.hint, autoRetryHint, raw };
    }
  }

  for (const [re, e] of REGEX_CODES) {
    const m = raw.match(re);
    if (m) {
      return { kind: 'known', code: m[0], headline: e.headline, hint: e.hint, autoRetryHint, raw };
    }
  }

  return {
    kind: 'unknown',
    code: providerCode,
    headline: NEUTRAL_SCENE_ERROR,
    hint: NEUTRAL_HINT,
    autoRetryHint,
    raw,
  };
}
