// generate-avatar-wardrobe — Stage 21
// Hierarchical theme packs: Theme → Sub-Pack → 4 Outfits.
// Stores composite key `${theme}:${sub_pack}` in avatar_wardrobe_variants.theme_pack.
// Backwards-compatible: if `sub_pack` is omitted, falls back to first sub-pack of the theme.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

type Outfit = { id: string; label: string; modifier: string };
type ThemeId = 'lifestyle' | 'business' | 'historical' | 'fantasy' | 'scifi' | 'sport';

const THEME_PACKS: Record<ThemeId, Record<string, Outfit[]>> = {
  lifestyle: {
    everyday: [
      { id: 'casual', label: 'Casual', modifier: 'casual everyday outfit: well-fitted t-shirt or sweater, jeans, sneakers, relaxed natural styling' },
      { id: 'streetwear', label: 'Streetwear', modifier: 'modern streetwear: oversized graphic hoodie, cargo pants, fresh sneakers, minimal jewelry, urban styling' },
      { id: 'brunch', label: 'Brunch', modifier: 'sunday brunch outfit: linen shirt or blouse, relaxed trousers or midi-skirt, loafers or sandals, soft summery styling' },
      { id: 'loungewear', label: 'Loungewear', modifier: 'premium loungewear: matching knit set in cream or sand tones, slip-on slippers, cozy at-home styling' },
    ],
    formal: [
      { id: 'black-tie', label: 'Black Tie', modifier: 'classic black-tie attire: tuxedo with bow tie or floor-length evening gown, polished black dress shoes, gala styling, gender-appropriate cut' },
      { id: 'cocktail', label: 'Cocktail', modifier: 'elegant cocktail attire: fitted dark suit with open collar or knee-length cocktail dress, refined accessories, evening event styling, gender-appropriate cut' },
      { id: 'wedding-guest', label: 'Wedding Guest', modifier: 'wedding guest outfit: pastel or jewel-tone tailored suit or midi dress with subtle floral accent, polished shoes, garden-ceremony styling, gender-appropriate cut' },
      { id: 'gala', label: 'Gala', modifier: 'red-carpet gala outfit: structured velvet tuxedo or sequined floor-length gown, statement jewelry, opulent styling, gender-appropriate cut' },
    ],
    seasonal: [
      { id: 'summer', label: 'Summer', modifier: 'summer outfit: light linen shirt or sundress, beige shorts or flowing skirt, sandals or espadrilles, sun-drenched coastal styling' },
      { id: 'winter', label: 'Winter', modifier: 'winter outfit: thick wool coat over chunky cable-knit sweater, scarf, gloves, dark denim, leather boots, cold-weather styling' },
      { id: 'rainy', label: 'Rainy Day', modifier: 'rainy-day outfit: stylish trench coat over knit pullover, dark jeans, waterproof Chelsea boots, holding a classic umbrella' },
      { id: 'spring', label: 'Spring', modifier: 'spring outfit: pastel cardigan over white shirt, light chinos or pleated skirt, white sneakers, fresh blooming-park styling' },
    ],
    brand: [
      { id: 'brand-hero', label: 'Brand Hero', modifier: 'on-brand hero outfit in clean monochrome neutrals (white, black, gray) with one bold accent piece, modern minimal high-fashion styling' },
      { id: 'brand-casual', label: 'Brand Casual', modifier: 'on-brand casual look: branded tee in subtle palette, dark denim, clean trainers, lifestyle-shoot styling' },
      { id: 'brand-formal', label: 'Brand Formal', modifier: 'on-brand formal look: tailored monochrome suit or dress in brand neutrals, polished shoes, editorial fashion styling, gender-appropriate cut' },
      { id: 'brand-sport', label: 'Brand Sport', modifier: 'on-brand athletic look: technical performance-wear in brand neutrals, sleek trainers, dynamic sport-editorial styling' },
    ],
  },

  business: {
    corporate: [
      { id: 'executive-suit', label: 'Executive Suit', modifier: 'tailored dark navy two-piece business suit with crisp white dress shirt, silk tie or silk neck scarf, polished leather shoes, premium boardroom executive styling, gender-appropriate cut' },
      { id: 'boardroom', label: 'Boardroom', modifier: 'classic charcoal three-piece suit with waistcoat, tie or silk scarf, polished oxfords, conservative wall-street boardroom styling, gender-appropriate cut' },
      { id: 'banker', label: 'Banker', modifier: 'pinstripe banker suit, white double-cuff shirt with cufflinks, silk tie or scarf, polished black brogues, formal financial-district styling, gender-appropriate cut' },
      { id: 'consultant', label: 'Consultant', modifier: 'modern consultant attire: slim-fit mid-grey suit, light blue shirt, no tie, polished leather loafers, briefcase, contemporary McKinsey-style styling, gender-appropriate cut' },
    ],
    startup: [
      { id: 'smart-casual', label: 'Smart Casual', modifier: 'modern smart-casual office look: fitted unstructured blazer over a clean white shirt or blouse, dark chinos or tailored trousers, leather loafers, no tie, contemporary startup-office styling, gender-appropriate cut' },
      { id: 'founder-hoodie', label: 'Founder Hoodie', modifier: 'premium minimal heather-grey hoodie under an unstructured wool blazer, dark slim jeans, clean white sneakers, modern Silicon Valley founder aesthetic, gender-appropriate cut' },
      { id: 'power-blazer', label: 'Power Blazer', modifier: 'structured charcoal power blazer with statement lapels over a fitted black turtleneck, slim tailored trousers, polished ankle boots, confident keynote-stage styling, gender-appropriate cut' },
      { id: 'pitch', label: 'Pitch Day', modifier: 'pitch-day outfit: branded crewneck under a sharp navy blazer, dark trousers, premium minimalist sneakers, holding a slim laptop, demo-day stage styling, gender-appropriate cut' },
    ],
    creative: [
      { id: 'designer', label: 'Designer', modifier: 'creative designer outfit: black turtleneck or oversized linen shirt, tailored wide-leg trousers, statement frame glasses, minimal leather loafers, art-direction studio styling, gender-appropriate cut' },
      { id: 'agency', label: 'Agency Lead', modifier: 'agency creative lead: relaxed-fit single-breasted blazer over band tee, dark jeans, clean low-top sneakers, leather messenger bag, brooklyn-agency styling, gender-appropriate cut' },
      { id: 'architect', label: 'Architect', modifier: 'architect outfit: long oversized black coat over white shirt and tailored grey trousers, round metal glasses, minimalist leather boots, museum-opening styling, gender-appropriate cut' },
      { id: 'editor', label: 'Editor', modifier: 'magazine editor look: silk blouse or fine-knit jumper, high-waist tailored trousers, statement belt, kitten heels or polished loafers, refined press-day styling, gender-appropriate cut' },
    ],
    travel: [
      { id: 'airport-pro', label: 'Airport Pro', modifier: 'business-class airport outfit: long camel coat over knit polo, dark tailored joggers or trousers, clean leather sneakers, premium carry-on at side, jet-set styling, gender-appropriate cut' },
      { id: 'conference', label: 'Conference', modifier: 'industry conference outfit: smart blazer with branded lanyard around neck, button-down shirt, chinos, polished derby shoes, holding a coffee, expo-floor styling, gender-appropriate cut' },
      { id: 'networking', label: 'Networking', modifier: 'networking event outfit: refined blazer and dark turtleneck, slim trousers, polished Chelsea boots, subtle pocket square or scarf, rooftop-mixer styling, gender-appropriate cut' },
      { id: 'coworking', label: 'Coworking', modifier: 'modern coworking outfit: relaxed merino sweater over collared shirt, slim chinos, premium minimal sneakers, holding an espresso, weWork-style styling, gender-appropriate cut' },
    ],
  },

  historical: {
    antiquity: [
      { id: 'roman', label: 'Roman Legionary', modifier: 'Roman legionary uniform: lorica segmentata armor, red tunic, military sandals (caligae), gladius at belt, historically accurate ancient-Rome styling' },
      { id: 'greek-hoplite', label: 'Greek Hoplite', modifier: 'ancient Greek hoplite: bronze cuirass, crested Corinthian helmet held under arm, red tunic, greaves, large round bronze hoplon shield, historically accurate' },
      { id: 'egyptian-royal', label: 'Egyptian Royal', modifier: 'ancient Egyptian royal attire: pleated white linen shendyt or sheath dress, broad gold-and-lapis usekh collar, kohl-lined eyes, gold cuff bracelets, historically accurate New-Kingdom styling, gender-appropriate cut' },
      { id: 'celtic-warrior', label: 'Celtic Warrior', modifier: 'ancient Celtic warrior: woolen plaid tunic and trousers, leather harness, bronze torc around neck, fur-trimmed cloak, woad face markings, historically accurate Iron-Age styling' },
    ],
    medieval: [
      { id: 'knight', label: 'Knight', modifier: 'medieval knight in full polished steel plate armor, chainmail, heraldic surcoat, leather gauntlets, historically accurate' },
      { id: 'viking', label: 'Viking', modifier: 'Viking warrior outfit: layered wool tunic, leather harness with bronze fittings, fur mantle, braided belt, rugged historically accurate styling' },
      { id: 'crusader', label: 'Crusader', modifier: 'medieval crusader: chainmail hauberk, white surcoat with red cross, mail coif, leather belt with longsword, historically accurate twelfth-century styling' },
      { id: 'monk', label: 'Monk', modifier: 'medieval monk: brown or black hooded woolen habit with rope cinched at waist, simple leather sandals, wooden cross pendant, monastery-cloister styling' },
    ],
    renaissance: [
      { id: 'noble', label: 'Renaissance Noble', modifier: 'Renaissance noble attire: rich velvet doublet with slashed sleeves, ruff collar, embroidered brocade gown or hose, jeweled belt, historically accurate sixteenth-century styling, gender-appropriate cut' },
      { id: 'musketeer', label: 'Musketeer', modifier: 'seventeenth-century French musketeer: blue tabard with silver cross over leather doublet, wide-brimmed plumed hat, tall cavalier boots, rapier at hip, swashbuckling styling' },
      { id: 'pirate', label: 'Pirate', modifier: 'classic golden-age pirate outfit: long red coat over white linen shirt, leather baldric, tricorn hat, dark trousers, tall buccaneer boots, sash belt with cutlass, historically inspired styling' },
      { id: 'court', label: 'Court Attendant', modifier: 'Renaissance royal court attire: ornate gold-embroidered jacket or full-length damask gown with hoop skirt, high lace collar, jeweled headpiece, historically accurate styling, gender-appropriate cut' },
    ],
    industrial: [
      { id: 'edwardian', label: 'Edwardian', modifier: 'Edwardian-era formal attire: tailored three-piece suit with waistcoat and pocket watch, or long lace-trimmed dress with parasol, elegant 1900s styling, gender-appropriate cut' },
      { id: 'victorian', label: 'Victorian', modifier: 'Victorian attire: dark frock coat with silk waistcoat, top hat and cane, or full bustle gown with corseted bodice, high collar, lace gloves, historically accurate 1880s styling, gender-appropriate cut' },
      { id: 'steampunk', label: 'Steampunk', modifier: 'steampunk outfit: brown leather waistcoat over white shirt, brass goggles on top hat, fingerless gloves, gear-decorated utility belt, layered Victorian-industrial styling, gender-appropriate cut' },
      { id: 'wild-west', label: 'Wild West Gunslinger', modifier: 'Wild-West gunslinger: long brown duster coat over leather vest, dark trousers, cowboy hat, leather gun belt with revolver, dusty boots, frontier-saloon styling' },
    ],
    'world-war-1': [
      { id: 'doughboy', label: 'US Doughboy', modifier: 'WW1 American Expeditionary Force soldier: olive-drab wool tunic with brass buttons, breeches and puttees, M1917 Brodie helmet (no political insignia), leather ammo belt, historically accurate trench-era styling, generic field uniform' },
      { id: 'tommy', label: 'British Tommy', modifier: 'WW1 British infantry soldier: khaki serge tunic, puttees over ankle boots, Brodie helmet, webbing harness with ammo pouches, historically accurate Western-Front styling, generic field uniform without unit insignia' },
      { id: 'pilot-ace', label: 'Pilot Ace', modifier: 'WW1 fighter pilot: brown leather flight jacket with sheepskin collar, leather aviator helmet, goggles pushed up, white silk scarf, jodhpurs, tall flight boots, biplane-era styling' },
      { id: 'trench-officer', label: 'Trench Officer', modifier: 'WW1 trench officer: olive wool service tunic with Sam Browne belt, breeches with leather field boots, peaked cap, holstered service revolver, trench-coat over shoulders, historically accurate styling, generic insignia only' },
    ],
    'world-war-2': [
      { id: 'gi', label: 'US GI', modifier: 'WW2 American GI: olive-drab M1943 field jacket and trousers, M1 helmet with netting, ammo belt with canteen, leather combat boots, historically accurate ETO styling, generic field uniform without unit patches' },
      { id: 'german-soldier', label: 'German Soldier', modifier: 'WW2 German Wehrmacht infantry soldier in field-grey wool tunic and trousers, Stahlhelm (steel helmet), leather Y-strap webbing with ammo pouches, jackboots, historically accurate generic field uniform — explicitly NO political insignia, NO swastikas, NO SS runes, plain blank collar tabs only' },
      { id: 'raf-pilot', label: 'RAF Pilot', modifier: 'WW2 Royal Air Force fighter pilot: brown leather Irvin flight jacket with sheepskin collar, Mae-West life vest, leather flying helmet with oxygen mask hanging, white silk scarf, RAF-blue trousers, flight boots, Battle-of-Britain styling' },
      { id: 'resistance', label: 'Resistance Fighter', modifier: 'WW2 French Resistance fighter: civilian wool jacket over knit sweater, flat cap or beret, dark trousers, worn leather boots, slung Sten gun, neckerchief, occupied-Europe styling' },
    ],
    'feudal-japan': [
      { id: 'samurai', label: 'Samurai', modifier: 'feudal Japanese samurai in full ō-yoroi lacquered armor with kabuto helmet, silk under-kimono, two katana at obi belt, historically accurate Sengoku-era styling' },
      { id: 'ninja', label: 'Ninja', modifier: 'shinobi outfit: dark indigo high-collar jacket and trousers (shinobi shōzoku), face wrap revealing only eyes, tabi boots, kunai and ninjatō at belt, stealth-mission styling' },
      { id: 'geisha', label: 'Geisha', modifier: 'classical geisha attire: elaborate silk furisode kimono with embroidered floral motifs, wide brocade obi, white face makeup with red lips, ornate hair pins (kanzashi), wooden geta sandals, traditional Kyoto styling — gender-appropriate adaptation for male subjects (formal montsuki kimono with hakama)' },
      { id: 'ronin', label: 'Ronin', modifier: 'masterless ronin samurai: travel-worn dark kimono and hakama, woven straw sandals (waraji), conical sedge hat (sandogasa), single katana at hip, weathered Edo-period styling' },
    ],
  },

  fantasy: {
    light: [
      { id: 'wizard', label: 'Wizard', modifier: 'high-fantasy wizard robes in deep blue and gold, embroidered runes, hooded cloak, leather satchel and wooden staff' },
      { id: 'elven-ranger', label: 'Elven Ranger', modifier: 'elven ranger outfit: forest-green leather armor with silver filigree, hooded cloak, quiver of arrows, elegant high-fantasy styling' },
      { id: 'paladin', label: 'Paladin', modifier: 'holy paladin: gleaming silver-and-gold plate armor with sun emblem on chestplate, white tabard, blue cape, ornate longsword, radiant high-fantasy styling' },
      { id: 'royal', label: 'Royal', modifier: 'royal coronation attire: ermine-trimmed velvet robe, embroidered gold brocade tunic or gown, jeweled crown, regal and opulent, gender-appropriate cut' },
    ],
    dark: [
      { id: 'dark-knight', label: 'Dark Knight', modifier: 'dark fantasy knight: blackened plate armor with crimson trim, tattered cape, ornate pauldrons, brooding and cinematic' },
      { id: 'necromancer', label: 'Necromancer', modifier: 'necromancer robes: tattered black-and-violet hooded robes with bone-trimmed shoulders, skull amulet, glowing green crystal staff, dark fantasy styling' },
      { id: 'assassin', label: 'Assassin', modifier: 'fantasy assassin outfit: dark hooded leather armor with deep cowl, multiple sheathed daggers across chest, fingerless gloves, wraps around forearms, shadowy styling' },
      { id: 'vampire', label: 'Vampire Lord', modifier: 'gothic vampire lord: long black velvet coat with crimson silk lining, lace cravat, polished knee-high boots, ornate ring, pale skin, gothic-aristocrat styling, gender-appropriate cut' },
    ],
    mythic: [
      { id: 'dragon-rider', label: 'Dragon Rider', modifier: 'dragon-rider outfit: layered dark scale-leather armor with bronze fittings, asymmetric pauldron, riding harness, fur-lined cloak, windswept high-fantasy styling' },
      { id: 'druid', label: 'Druid', modifier: 'forest druid: earthy green-and-brown layered linen and fur robes, antler-crowned hood, vine-wrapped wooden staff, leaf jewelry, naturalistic fantasy styling' },
      { id: 'sorceress', label: 'Sorceress', modifier: 'arcane sorceress: flowing silk-and-velvet robes in deep purple and silver, glowing rune embroidery, ornate circlet, crystal-topped wand, magical high-fantasy styling, gender-appropriate cut' },
      { id: 'forest-guardian', label: 'Forest Guardian', modifier: 'mythic forest guardian: bark-and-moss living armor, antler crown, vine-wrapped longbow, ethereal woodland styling' },
    ],
  },

  scifi: {
    space: [
      { id: 'astronaut', label: 'Astronaut', modifier: 'modern white astronaut spacesuit (EVA style) with helmet held under arm, NASA-style patches, photorealistic spacefaring outfit' },
      { id: 'star-captain', label: 'Star Captain', modifier: 'sci-fi star-fleet captain uniform: tailored navy and red command jacket with rank insignia, fitted trousers, polished black boots, confident bridge-officer styling' },
      { id: 'alien-diplomat', label: 'Alien Diplomat', modifier: 'sci-fi xeno-diplomat robes: iridescent flowing layered fabric in teal and silver, ornate translator collar, ceremonial sash, otherworldly elegant styling, gender-appropriate cut' },
      { id: 'mech-pilot', label: 'Mech Pilot', modifier: 'sci-fi mech pilot suit: armored flight suit with hardpoints, helmet under arm, utility harness, military-industrial future styling' },
    ],
    cyber: [
      { id: 'cyberpunk', label: 'Cyberpunk', modifier: 'cyberpunk streetwear: oversized techwear jacket with reflective panels, neon-trim cargo pants, chunky boots, LED accent piece, gritty future styling' },
      { id: 'netrunner', label: 'Netrunner', modifier: 'netrunner outfit: form-fitting black bodysuit with glowing circuit lines, neural interface visor, tactical wrist-deck, fingerless gloves, dark hacker-den styling, gender-appropriate cut' },
      { id: 'corp-exec', label: 'Corp Exec', modifier: 'cyberpunk corporate executive: sleek dark suit with subtle glowing collar lines, holo-watch, mirrored shades, polished augmented-reality earpiece, dystopian-boardroom styling, gender-appropriate cut' },
      { id: 'street-samurai', label: 'Street Samurai', modifier: 'cyberpunk street samurai: long techwear coat with glowing accents over body armor, cybernetic arm visible, mono-katana on back, neon-lit night-city styling' },
    ],
    future: [
      { id: 'holo-suit', label: 'Holo Suit', modifier: 'sleek futuristic holo-suit: form-fitting matte composite armor with subtle glowing accent lines, minimalist clean future styling' },
      { id: 'bio-engineer', label: 'Bio-Engineer', modifier: 'future bio-engineer: clean white lab-suit with translucent panels showing soft blue bio-luminescence, holo-tablet in hand, advanced laboratory styling, gender-appropriate cut' },
      { id: 'energy-knight', label: 'Energy Knight', modifier: 'futuristic energy knight: white-and-gold plasma armor with glowing seams, helmet under arm, holographic shield emitter on forearm, ceremonial future-paladin styling' },
      { id: 'drone-pilot', label: 'Drone Pilot', modifier: 'sci-fi drone pilot: tactical grey flight suit with multi-screen wrist-controller, AR visor pushed up, harness with control sticks, command-tent styling' },
    ],
  },

  sport: {
    team: [
      { id: 'football', label: 'Football', modifier: 'professional football (soccer) kit: team jersey, shorts, knee-high socks, cleats, crisp athletic styling' },
      { id: 'basketball', label: 'Basketball', modifier: 'professional basketball uniform: sleeveless jersey and matching shorts, high-top sneakers, sweatband, crisp athletic styling' },
      { id: 'baseball', label: 'Baseball', modifier: 'classic baseball uniform: pinstripe jersey with team logo, matching pants, cap, leather glove, cleats, crisp athletic styling' },
      { id: 'american-football', label: 'American Football', modifier: 'American football player: full pads under team jersey, helmet under arm, tight pants, cleats, eye-black, crisp athletic styling' },
    ],
    combat: [
      { id: 'mma', label: 'MMA Fighter', modifier: 'MMA fight gear: rashguard top, fight shorts, fingerless gloves, hand wraps, athletic and intense' },
      { id: 'boxing', label: 'Boxing', modifier: 'professional boxer outfit: satin boxing trunks with championship-belt-style waistband, hand wraps, boxing gloves, high boxing boots, ring-corner styling' },
      { id: 'karate', label: 'Karate', modifier: 'traditional karate gi: crisp white cotton uniform with black belt tied at waist, barefoot, dojo styling, focused martial-arts pose' },
      { id: 'fencing', label: 'Fencing', modifier: 'fencing outfit: white protective jacket with chest-plate, white knickers, knee-high white socks, fencing shoes, mesh mask under arm, foil épée in hand, classical piste styling' },
    ],
    outdoor: [
      { id: 'tennis', label: 'Tennis', modifier: 'classic tennis whites: collared polo shirt and white shorts or pleated skirt, tennis shoes, holding a racquet, clean athletic styling, gender-appropriate cut' },
      { id: 'skiing', label: 'Skiing', modifier: 'alpine skiing outfit: insulated technical ski jacket and pants in bold colors, helmet, ski goggles, gloves, ski boots, snowy mountain styling' },
      { id: 'climbing', label: 'Rock Climbing', modifier: 'rock climber outfit: technical fitted t-shirt or tank, climbing pants with chalk bag at waist, harness with carabiners, climbing shoes, rugged outdoor styling' },
      { id: 'cycling', label: 'Cycling', modifier: 'professional road cyclist kit: aerodynamic team jersey and bib shorts, helmet, sunglasses, cycling shoes, performance athletic styling' },
    ],
  },
};

// Build allowed `${theme}:${sub}` whitelist.
const VALID_KEYS = new Set<string>();
for (const [theme, subs] of Object.entries(THEME_PACKS)) {
  for (const sub of Object.keys(subs)) VALID_KEYS.add(`${theme}:${sub}`);
}
const VALID_THEMES = new Set<string>(Object.keys(THEME_PACKS));

const IDENTITY_LOCK =
  'CRITICAL: Preserve the EXACT face, age, skin tone, hair style, hair color, eye color, facial features and body proportions of the reference person. Do not alter the face or hair. Only the clothing and accessories change. Full-body, head-to-toe framing on a soft neutral studio background. Photorealistic.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.error('[generate-avatar-wardrobe] auth failed:', authErr?.message);
      throw new Error('Unauthorized');
    }

    const body = await req.json().catch(() => ({}));
    const { avatar_id } = body;
    if (!avatar_id) throw new Error('avatar_id required');

    // Resolve composite theme:sub key. Accept either:
    //   - { theme_pack: 'historical', sub_pack: 'medieval' }
    //   - { theme_pack: 'historical:medieval' }   (already composite)
    //   - { theme_pack: 'historical' }            (legacy → first sub)
    let themeRaw: string = String(body?.theme_pack ?? 'lifestyle');
    let subRaw: string | undefined = body?.sub_pack ? String(body.sub_pack) : undefined;
    if (themeRaw.includes(':')) {
      const [t, s] = themeRaw.split(':');
      themeRaw = t;
      subRaw = subRaw ?? s;
    }
    if (!VALID_THEMES.has(themeRaw)) themeRaw = 'lifestyle';
    const themeId = themeRaw as ThemeId;
    if (!subRaw || !THEME_PACKS[themeId][subRaw]) {
      // Default to first sub-pack of the theme.
      subRaw = Object.keys(THEME_PACKS[themeId])[0];
    }
    const compositeKey = `${themeId}:${subRaw}`;
    if (!VALID_KEYS.has(compositeKey)) throw new Error(`Invalid theme/sub-pack: ${compositeKey}`);

    const OUTFITS = THEME_PACKS[themeId][subRaw];

    const { data: avatar, error: avErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, reference_image_url, storage_path, portrait_url, name')
      .eq('id', avatar_id).single();
    if (avErr || !avatar) throw new Error('Avatar not found');
    if (avatar.user_id !== user.id) throw new Error('Forbidden');

    let sourceUrl = avatar.portrait_url || avatar.reference_image_url;
    if (avatar.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(avatar.storage_path, 60 * 10);
      if (signed?.signedUrl) sourceUrl = signed.signedUrl;
    }

    console.log('[generate-avatar-wardrobe] start', { avatar_id, theme: themeId, sub: subRaw, user_id: user.id });

    const results = await Promise.allSettled(OUTFITS.map(async (outfit) => {
      const prompt = `Restyle the same person wearing a ${outfit.modifier}. Soft neutral studio background, full-body head-to-toe framing, photorealistic. ${IDENTITY_LOCK} 3:4 portrait framing.`;
      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image-preview',
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: sourceUrl } },
          ]}],
          modalities: ['image', 'text'],
        }),
      });
      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`Gemini ${aiResp.status}: ${txt.slice(0, 120)}`);
      }
      const aiData = await aiResp.json();
      const dataUri: string | undefined = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUri?.startsWith('data:image/')) throw new Error('No image returned');

      const base64 = dataUri.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${user.id}/wardrobe/${avatar_id}/${themeId}/${subRaw}/${outfit.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-characters')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);
      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      await supabaseAdmin.from('avatar_wardrobe_variants').upsert({
        avatar_id,
        theme_pack: compositeKey,
        outfit_id: outfit.id,
        label: outfit.label,
        image_url: url,
        storage_path: path,
      }, { onConflict: 'avatar_id,theme_pack,outfit_id' });

      return { outfit_id: outfit.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-avatar-wardrobe] done', { ok, failed: failed.length, key: compositeKey });

    return new Response(JSON.stringify({
      success: true,
      theme_pack: themeId,
      sub_pack: subRaw,
      composite_key: compositeKey,
      generated: ok,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-avatar-wardrobe] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
