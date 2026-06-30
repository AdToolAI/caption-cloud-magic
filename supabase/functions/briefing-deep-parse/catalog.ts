// supabase/functions/briefing-deep-parse/catalog.ts
//
// Edge-side mirror of `src/lib/video-composer/catalog/index.ts`.
// Wave 1 (v178): we only need the resolver here — UI labels and engine
// hints live on the frontend. Keep this list in sync with `src/lib/video-composer/catalog/index.ts`.
//
// If you add an entry on the frontend, mirror its id + synonyms here.

export const CATALOG_VERSION = 1;

export type CatalogAxis =
  | 'mimik' | 'gestik' | 'blick' | 'energy'
  | 'framing' | 'angle' | 'movement' | 'lighting'
  | 'delivery' | 'music_energy' | 'style_preset';

interface Entry { id: string; synonyms: string[]; }

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const e = (axis: CatalogAxis, slug: string, ...synonyms: string[]): Entry => ({
  id: `${axis}.${slug}`,
  synonyms: [
    slug,
    slug.replace(/_/g, '-'),
    slug.replace(/_/g, ' '),
    `${axis}.${slug}`,
    ...synonyms,
  ].map(norm).filter(Boolean),
});

const ALL: Record<CatalogAxis, Entry[]> = {
  mimik: [
    e('mimik','neutral','neutral'),
    e('mimik','confident','selbstbewusst','confident','souverän','assured','selbstsicher'),
    e('mimik','warm_smile','warmes lächeln','warm smile','lächeln','smile','warmes lacheln'),
    e('mimik','big_smile','breites lächeln','big smile','grinsen','grin'),
    e('mimik','serious','ernst','serious','focused','fokussiert'),
    e('mimik','curious','neugierig','curious','interessiert','interested'),
    e('mimik','concerned','besorgt','concerned','worried','sorgenvoll'),
    e('mimik','surprised','überrascht','surprised','shocked','geschockt'),
    e('mimik','thoughtful','nachdenklich','thoughtful','pondering','grübelnd'),
    e('mimik','determined','entschlossen','determined','resolute','willensstark'),
    e('mimik','amused','amüsiert','amused','playful','verspielt'),
    e('mimik','empathetic','empathisch','empathetic','caring','mitfühlend'),
  ],
  gestik: [
    e('gestik','still','ruhig','still','hands at rest','keine geste'),
    e('gestik','open_palms','offene hände','open palms','open hands','offene handflächen'),
    e('gestik','point_to_camera','zeigen','pointing','point to camera','zur kamera zeigen'),
    e('gestik','count_fingers','finger zählen','counting fingers','aufzählen'),
    e('gestik','thumbs_up','daumen hoch','thumbs up'),
    e('gestik','hands_explain','erklärende hände','explaining hands','gesticulating'),
    e('gestik','hand_to_chest','hand auf brust','hand on chest','aufrichtig','sincere'),
    e('gestik','arms_crossed','arme verschränkt','arms crossed'),
    e('gestik','lean_forward','nach vorne lehnen','lean forward','lean in'),
    e('gestik','shrug','schulterzucken','shrug'),
  ],
  blick: [
    e('blick','to_camera','in die kamera','to camera','direct','direkt','eye contact'),
    e('blick','away','weggewandt','away','looking away'),
    e('blick','down','nach unten','down','looking down'),
    e('blick','up','nach oben','up','looking up'),
    e('blick','side_left','links','looking left'),
    e('blick','side_right','rechts','looking right'),
    e('blick','at_object','auf objekt','at object','at product','auf produkt'),
    e('blick','at_partner','auf gegenüber','at partner','interlocutor'),
  ],
  energy: [
    e('energy','very_low','sehr ruhig','very low','1','sehr niedrig'),
    e('energy','low','ruhig','low','2','niedrig'),
    e('energy','mid','mittel','mid','3','medium','neutral'),
    e('energy','high','hoch','high','4','energetic'),
    e('energy','very_high','sehr hoch','very high','5','explosive'),
  ],
  framing: [
    e('framing','extreme_wide','extreme totale','extreme wide','ews','xws'),
    e('framing','wide','totale','wide','ws','weit'),
    e('framing','medium_wide','halbtotale','medium wide','mws'),
    e('framing','medium','halbnah','medium','ms','medium shot'),
    e('framing','medium_close_up','nahe','medium close up','medium close-up','mcu','nah'),
    e('framing','close_up','großaufnahme','close up','close-up','cu','nahaufnahme'),
    e('framing','extreme_close_up','detail','extreme close up','extreme close-up','ecu','makro'),
    e('framing','establishing','establishing','etablierende einstellung'),
  ],
  angle: [
    e('angle','eye_level','augenhöhe','eye level','eye-level','neutral angle'),
    e('angle','low','untersicht','low angle','low-angle','froschperspektive'),
    e('angle','high','aufsicht','high angle','high-angle','vogelperspektive'),
    e('angle','dutch','dutch','dutch angle','canted','schräg'),
    e('angle','over_shoulder','über schulter','over the shoulder','ots','schulter'),
    e('angle','three_quarter','dreiviertel','three quarter','three-quarter','3 4'),
    e('angle','profile','profil','profile'),
    e('angle','frontal','frontal'),
  ],
  movement: [
    e('movement','static','statisch','static','fixed','locked'),
    e('movement','slow_push_in','langsamer push in','slow push in','slow push-in','slow-push-in','dolly in slow'),
    e('movement','push_in','push in','push-in','dolly in'),
    e('movement','pull_out','pull out','pull-out','dolly out','rückzug'),
    e('movement','pan_left','schwenk links','pan left','pan-left'),
    e('movement','pan_right','schwenk rechts','pan right','pan-right'),
    e('movement','tilt_up','tilt up','tilt-up'),
    e('movement','tilt_down','tilt down','tilt-down'),
    e('movement','tracking','tracking','follow','verfolgung'),
    e('movement','handheld','handkamera','handheld','handgehalten'),
    e('movement','orbital','orbital','orbit','rundfahrt'),
    e('movement','crane_up','kran hoch','crane up','jib up'),
    e('movement','crane_down','kran runter','crane down','jib down'),
    e('movement','lean_in','lean in','lean-in'),
  ],
  lighting: [
    e('lighting','natural','natürlich','natural'),
    e('lighting','soft_window','weiches fensterlicht','soft window','soft daylight','fensterlicht'),
    e('lighting','hard_window','hartes fensterlicht','hard window'),
    e('lighting','golden_hour','golden hour','goldene stunde'),
    e('lighting','blue_hour','blue hour','blaue stunde'),
    e('lighting','low_key','low key','low-key','moody','dunkel'),
    e('lighting','high_key','high key','high-key','bright','hell'),
    e('lighting','rim','rim','rim light','rimlight'),
    e('lighting','backlit','gegenlicht','backlit','silhouette'),
    e('lighting','practical','praktisch','practical','lampen'),
    e('lighting','studio_softbox','studio softbox','softbox'),
    e('lighting','neon','neon','cyberpunk'),
    e('lighting','overcast','bewölkt','overcast'),
  ],
  delivery: [
    e('delivery','warm','warm','freundlich','friendly'),
    e('delivery','calm','ruhig','calm','gelassen','measured'),
    e('delivery','urgent','dringend','urgent','eilig','pressing'),
    e('delivery','energetic','energetisch','energetic','upbeat','schwungvoll'),
    e('delivery','authoritative','autoritär','authoritative','commanding','bestimmt'),
    e('delivery','conversational','locker','conversational','casual','natürlich'),
    e('delivery','whisper','flüstern','whisper'),
    e('delivery','inspirational','inspirierend','inspirational','motivierend'),
  ],
  music_energy: [
    e('music_energy','silent','stille','silent','none','keine musik'),
    e('music_energy','low','niedrig','low','ambient'),
    e('music_energy','mid','mittel','mid','medium','motivational'),
    e('music_energy','high','hoch','high','driving','energetic'),
    e('music_energy','cinematic','cinematic','filmisch','orchestral'),
  ],
  style_preset: [
    e('style_preset','documentary','dokumentarisch','documentary'),
    e('style_preset','commercial_clean','werbung clean','commercial clean','ad clean'),
    e('style_preset','cinematic_film','cinematic film','kino','35mm'),
    e('style_preset','noir','noir','film noir','schwarzweiß'),
    e('style_preset','vintage_super8','vintage super 8','super 8','super-8'),
    e('style_preset','high_fashion','high fashion','editorial'),
    e('style_preset','pastel_dream','pastell traum','pastel dream'),
    e('style_preset','cyberpunk_neon','cyberpunk','cyberpunk neon'),
    e('style_preset','golden_hour_warm','goldene stunde warm','golden hour warm'),
    e('style_preset','monochrome','monochrom','monochrome'),
    e('style_preset','high_energy_sport','high energy sport','sport edit'),
    e('style_preset','tech_minimal','tech minimal','minimal tech'),
  ],
};

const INDEX: Record<CatalogAxis, Map<string, string>> = Object.fromEntries(
  (Object.keys(ALL) as CatalogAxis[]).map((axis) => {
    const m = new Map<string, string>();
    for (const it of ALL[axis]) {
      for (const syn of it.synonyms) {
        if (syn && !m.has(syn)) m.set(syn, it.id);
      }
    }
    return [axis, m];
  }),
) as Record<CatalogAxis, Map<string, string>>;

/** Resolve a free-text value to a catalog id, or `null`. */
export function resolveCatalogId(axis: CatalogAxis, raw: unknown): string | null {
  const n = norm(raw);
  if (!n) return null;
  const idx = INDEX[axis];

  const exact = idx.get(n);
  if (exact) return exact;

  for (const [syn, id] of idx) {
    if (syn.length < 3) continue;
    if (n.includes(syn) || syn.includes(n)) return id;
  }
  return null;
}
