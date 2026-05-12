// Shared world-asset catalog: locations, buildings, props.
// Used by seed-world-catalog and (later) /library to render the catalog grid.
// Keep ids/labels stable — they are the unique key in the *_catalog_previews tables.

export type WorldKind = 'location' | 'building' | 'prop';

export interface CatalogItem { id: string; label: string; modifier: string }

// theme_pack format mirrors wardrobe: "<theme>" or "<theme>:<sub>".
export type ThemePacks = Record<string, Record<string, CatalogItem[]>>;

// ---------- LOCATIONS ----------
export const LOCATION_THEMES: ThemePacks = {
  indoor: {
    living: [
      { id: 'modern-loft', label: 'Modern Loft', modifier: 'open-plan modern loft living room with floor-to-ceiling windows, polished concrete floors, designer sofa, warm afternoon light' },
      { id: 'cozy-cottage', label: 'Cozy Cottage', modifier: 'cozy cottage interior with wooden beams, stone fireplace, knit throws, warm lamp light, rustic charm' },
      { id: 'scandi-apartment', label: 'Scandi Apartment', modifier: 'minimalist Scandinavian apartment, white walls, light oak floors, soft north-facing daylight, plants, hygge atmosphere' },
      { id: 'penthouse-night', label: 'Penthouse Night', modifier: 'luxury penthouse living room at night with city skyline through panoramic windows, dim warm lighting' },
    ],
    workspace: [
      { id: 'home-office', label: 'Home Office', modifier: 'modern home office with wooden desk, monitor, plants, soft daylight from side window, focused atmosphere' },
      { id: 'startup-loft', label: 'Startup Loft', modifier: 'open startup office loft with exposed brick, long shared desks, neon brand sign, casual coworking energy' },
      { id: 'corporate-boardroom', label: 'Corporate Boardroom', modifier: 'corporate glass boardroom on a high floor, long polished table, leather chairs, panoramic city view' },
      { id: 'creative-studio', label: 'Creative Studio', modifier: 'creative photo studio with seamless paper backdrop, softboxes, wooden floor, professional production atmosphere' },
    ],
    venue: [
      { id: 'fine-dining', label: 'Fine Dining', modifier: 'upscale fine-dining restaurant interior, candlelight, white tablecloths, dark wood, intimate evening ambience' },
      { id: 'speciality-cafe', label: 'Speciality Café', modifier: 'speciality coffee café with light wood, brass espresso machine, natural daylight, minimalist artisan atmosphere' },
      { id: 'cocktail-bar', label: 'Cocktail Bar', modifier: 'moody speakeasy cocktail bar, brass fixtures, backlit bottle wall, leather booths, low warm lighting' },
      { id: 'art-gallery', label: 'Art Gallery', modifier: 'minimal white-cube art gallery, polished concrete floor, gallery spotlights, framed artworks on white walls' },
    ],
  },
  outdoor: {
    nature: [
      { id: 'forest-path', label: 'Forest Path', modifier: 'sunlit dense forest path, golden light beams through tall trees, soft moss, magical morning atmosphere' },
      { id: 'mountain-vista', label: 'Mountain Vista', modifier: 'epic alpine mountain vista at golden hour, snow-capped peaks, dramatic clouds, cinematic landscape' },
      { id: 'coastal-cliffs', label: 'Coastal Cliffs', modifier: 'rugged coastal cliffs with crashing turquoise ocean, dramatic sky, salt spray, cinematic wide landscape' },
      { id: 'desert-dunes', label: 'Desert Dunes', modifier: 'vast golden desert sand dunes at sunset, long shadows, warm orange light, minimalist landscape' },
    ],
    urban: [
      { id: 'downtown-street', label: 'Downtown Street', modifier: 'busy modern downtown street at golden hour, glass skyscrapers, soft bokeh traffic lights, cinematic depth' },
      { id: 'rooftop-skyline', label: 'Rooftop Skyline', modifier: 'rooftop terrace overlooking city skyline at blue hour, string lights, cinematic urban background' },
      { id: 'neon-alley', label: 'Neon Alley', modifier: 'rainy neon-lit cyberpunk alley, reflective wet pavement, glowing signs in pink and cyan, nighttime moody atmosphere' },
      { id: 'historic-square', label: 'Historic Square', modifier: 'european historic city square at twilight, cobblestones, warm streetlamps, baroque facades, cinematic depth' },
    ],
    travel: [
      { id: 'beach-paradise', label: 'Beach Paradise', modifier: 'tropical paradise beach, white sand, palm trees, turquoise water, soft golden sunlight, postcard atmosphere' },
      { id: 'mountain-cabin', label: 'Mountain Cabin', modifier: 'wooden mountain cabin in snowy alpine forest, smoke from chimney, warm window light, winter wonderland' },
      { id: 'safari-savanna', label: 'Safari Savanna', modifier: 'african savanna at sunset with acacia tree silhouette, golden grass, dramatic warm sky, cinematic wildlife landscape' },
      { id: 'tuscan-vineyard', label: 'Tuscan Vineyard', modifier: 'rolling Tuscan vineyard at golden hour, cypress trees, warm sunlight, romantic Italian countryside' },
    ],
  },
  scifi: {
    futuristic: [
      { id: 'space-station', label: 'Space Station', modifier: 'sleek interior of orbital space station, glowing control panels, panoramic window with Earth view, sci-fi' },
      { id: 'cyber-city', label: 'Cyber City', modifier: 'futuristic cyberpunk megacity skyline at night, holographic billboards, flying vehicles, neon glow, blade-runner style' },
      { id: 'mars-base', label: 'Mars Base', modifier: 'mars colony habitat exterior, red dust landscape, geodesic domes, distant Earth in pink sky, cinematic sci-fi' },
      { id: 'lab-bioluminescent', label: 'Bioluminescent Lab', modifier: 'futuristic biotech lab with bioluminescent tanks, glowing teal and purple light, sleek dark surfaces, sci-fi atmosphere' },
    ],
  },
};

// ---------- BUILDINGS ----------
export const BUILDING_THEMES: ThemePacks = {
  sacred: {
    christian: [
      { id: 'gothic-cathedral', label: 'Gothic Cathedral', modifier: 'majestic gothic cathedral exterior with pointed spires, flying buttresses, rose window, stone facade, dramatic sky' },
      { id: 'baroque-church', label: 'Baroque Church', modifier: 'ornate baroque church facade with twin towers, pastel stucco, golden hour light, southern european square' },
      { id: 'country-chapel', label: 'Country Chapel', modifier: 'small white country chapel with wooden steeple, wildflower meadow, blue sky, peaceful pastoral setting' },
      { id: 'orthodox-monastery', label: 'Orthodox Monastery', modifier: 'orthodox monastery with golden onion domes, white stone walls, gilded crosses, mountain backdrop' },
    ],
    eastern: [
      { id: 'zen-temple', label: 'Zen Temple', modifier: 'tranquil japanese zen temple with red wooden gate, raked gravel garden, cherry blossoms, soft mist' },
      { id: 'pagoda', label: 'Pagoda', modifier: 'multi-tiered red pagoda with curved roofs, stone lanterns, autumn maple trees, golden light' },
      { id: 'hindu-temple', label: 'Hindu Temple', modifier: 'intricately carved south indian hindu temple with towering gopuram, vibrant sculptures, warm golden stone' },
      { id: 'mosque', label: 'Mosque', modifier: 'elegant mosque with white marble dome, slender minarets, intricate geometric tilework, blue sky' },
    ],
  },
  residential: {
    classic: [
      { id: 'victorian-house', label: 'Victorian House', modifier: 'ornate victorian house with bay windows, wraparound porch, painted trim, garden fence, soft daylight' },
      { id: 'colonial-mansion', label: 'Colonial Mansion', modifier: 'stately colonial mansion with white columns, red brick, manicured lawn, wide driveway, warm afternoon light' },
      { id: 'tudor-cottage', label: 'Tudor Cottage', modifier: 'charming tudor cottage with timber framing, thatched roof, climbing roses, english countryside garden' },
      { id: 'mediterranean-villa', label: 'Mediterranean Villa', modifier: 'mediterranean villa with terracotta roof, white stucco walls, cypress trees, infinity pool, golden sunset' },
    ],
    modern: [
      { id: 'glass-villa', label: 'Glass Villa', modifier: 'modern glass villa with cantilevered roof, infinity pool, minimalist landscaping, dusk lighting from interior' },
      { id: 'concrete-cube', label: 'Concrete Cube', modifier: 'brutalist concrete cube residence with sharp angles, large slit windows, gravel courtyard, dramatic shadows' },
      { id: 'wooden-cabin', label: 'Wooden Cabin', modifier: 'modern A-frame wooden cabin in pine forest, large glass facade, warm interior glow at twilight' },
      { id: 'desert-bungalow', label: 'Desert Bungalow', modifier: 'low-slung desert modernist bungalow, palm trees, stone path, pool reflecting pink sunset sky' },
    ],
  },
  historical: {
    ancient: [
      { id: 'greek-temple', label: 'Greek Temple', modifier: 'ancient greek doric temple ruins on hilltop, marble columns, blue mediterranean sky, golden light' },
      { id: 'roman-colosseum', label: 'Roman Colosseum', modifier: 'roman colosseum exterior, weathered stone arches, dramatic golden hour light, epic scale' },
      { id: 'medieval-castle', label: 'Medieval Castle', modifier: 'medieval stone castle on cliff with battlements and towers, moody overcast sky, dramatic landscape' },
      { id: 'samurai-castle', label: 'Samurai Castle', modifier: 'japanese samurai castle with white walls, multi-tiered black tile roofs, cherry blossoms, blue sky' },
    ],
    landmark: [
      { id: 'lighthouse', label: 'Lighthouse', modifier: 'tall striped lighthouse on rocky coast, stormy sea, dramatic sky, beam of light at dusk' },
      { id: 'old-windmill', label: 'Old Windmill', modifier: 'classic dutch windmill in tulip field, wooden blades, blue sky with soft clouds, golden light' },
      { id: 'observatory', label: 'Observatory', modifier: 'mountain-top astronomical observatory with white dome, starry twilight sky, snow-capped peaks' },
      { id: 'stone-bridge', label: 'Stone Bridge', modifier: 'arched stone bridge over misty river, autumn forest, soft morning light, romantic landscape' },
    ],
  },
  modern: {
    skyline: [
      { id: 'glass-skyscraper', label: 'Glass Skyscraper', modifier: 'sleek modern glass skyscraper reflecting sky, wide low-angle view, dramatic clouds, urban grandeur' },
      { id: 'twisted-tower', label: 'Twisted Tower', modifier: 'futuristic twisted spiral skyscraper, glass facade, dusk sky, surrounding city lights' },
      { id: 'mall-atrium', label: 'Mall Atrium', modifier: 'modern shopping mall atrium with curved glass roof, escalators, soft daylight, polished floors' },
      { id: 'concert-arena', label: 'Concert Arena', modifier: 'futuristic concert arena exterior at night, illuminated facade, crowd silhouettes, dramatic lighting' },
    ],
    tech: [
      { id: 'data-center', label: 'Data Center', modifier: 'industrial data center exterior at dusk with cooling towers, fenced perimeter, blue ambient lighting' },
      { id: 'rocket-pad', label: 'Rocket Pad', modifier: 'rocket launchpad with rocket on stand, gantry tower, sunrise sky, steam vapor, cinematic sci-fi atmosphere' },
      { id: 'wind-farm', label: 'Wind Farm', modifier: 'rolling hills wind farm at sunset, towering white turbines, golden meadow, dramatic clouds' },
      { id: 'solar-array', label: 'Solar Array', modifier: 'vast desert solar panel array reflecting blue sky, geometric patterns, distant mountains' },
    ],
  },
};

// ---------- PROPS ----------
export const PROP_THEMES: ThemePacks = {
  furniture: {
    seating: [
      { id: 'leather-armchair', label: 'Leather Armchair', modifier: 'premium chesterfield leather armchair, deep brown leather, brass studs, neutral studio backdrop' },
      { id: 'modern-sofa', label: 'Modern Sofa', modifier: 'minimalist three-seat modern sofa in cream bouclé, oak legs, neutral studio backdrop' },
      { id: 'designer-chair', label: 'Designer Chair', modifier: 'iconic designer accent chair in walnut and tan leather, sculptural form, neutral studio backdrop' },
      { id: 'rattan-lounger', label: 'Rattan Lounger', modifier: 'woven rattan lounge chair with linen cushion, boho styling, neutral studio backdrop' },
    ],
    tables: [
      { id: 'oak-dining', label: 'Oak Dining Table', modifier: 'large solid oak dining table with chamfered edges, neutral studio backdrop' },
      { id: 'marble-coffee', label: 'Marble Coffee Table', modifier: 'round white marble coffee table with brass base, neutral studio backdrop' },
      { id: 'workspace-desk', label: 'Workspace Desk', modifier: 'minimalist walnut workspace desk with cable grommet, neutral studio backdrop' },
      { id: 'wooden-bench', label: 'Wooden Bench', modifier: 'long live-edge wooden bench, raw natural finish, neutral studio backdrop' },
    ],
  },
  vehicles: {
    cars: [
      { id: 'sport-coupe', label: 'Sport Coupe', modifier: 'sleek modern matte-black sport coupe, three-quarter front view, studio lighting, no logos' },
      { id: 'classic-roadster', label: 'Classic Roadster', modifier: 'cherry-red 1960s classic roadster convertible, three-quarter front view, studio lighting' },
      { id: 'luxury-suv', label: 'Luxury SUV', modifier: 'premium silver luxury SUV, three-quarter front view, soft studio lighting, no logos' },
      { id: 'electric-sedan', label: 'Electric Sedan', modifier: 'modern white electric sedan with minimalist design, three-quarter front view, studio lighting, no logos' },
    ],
    transport: [
      { id: 'vintage-bicycle', label: 'Vintage Bicycle', modifier: 'classic dutch city bicycle with leather saddle, woven basket, neutral studio backdrop' },
      { id: 'electric-scooter', label: 'Electric Scooter', modifier: 'modern foldable electric scooter, matte grey, neutral studio backdrop' },
      { id: 'sailing-yacht', label: 'Sailing Yacht', modifier: 'elegant white sailing yacht on calm turquoise sea, sunny sky, side view' },
      { id: 'helicopter', label: 'Helicopter', modifier: 'sleek private helicopter on helipad, studio-like overcast lighting, side view' },
    ],
  },
  tech: {
    devices: [
      { id: 'laptop', label: 'Laptop', modifier: 'open premium silver laptop showing blank screen, neutral studio backdrop, soft shadow' },
      { id: 'smartphone', label: 'Smartphone', modifier: 'modern flagship smartphone with blank black screen, floating, neutral studio backdrop' },
      { id: 'vr-headset', label: 'VR Headset', modifier: 'futuristic white VR headset with controllers, soft studio lighting, neutral backdrop' },
      { id: 'drone', label: 'Drone', modifier: 'sleek black quadcopter drone hovering, soft studio backdrop, dramatic rim light' },
    ],
    studio: [
      { id: 'cinema-camera', label: 'Cinema Camera', modifier: 'professional cinema camera on tripod with cinema lens, neutral studio backdrop' },
      { id: 'mic-shock-mount', label: 'Studio Mic', modifier: 'broadcast condenser microphone on shock mount and boom arm, dark studio backdrop' },
      { id: 'mixing-console', label: 'Mixing Console', modifier: 'professional audio mixing console with backlit faders, dark studio backdrop' },
      { id: 'softbox', label: 'Softbox Light', modifier: 'large softbox studio light on stand, soft glow, dark studio backdrop' },
    ],
  },
  food: {
    drinks: [
      { id: 'espresso-cup', label: 'Espresso Cup', modifier: 'porcelain espresso cup on saucer with rich crema, neutral studio backdrop, food-photography lighting' },
      { id: 'wine-glass', label: 'Wine Glass', modifier: 'crystal wine glass with red wine, soft backlight, neutral studio backdrop' },
      { id: 'cocktail', label: 'Cocktail', modifier: 'classic old-fashioned cocktail with citrus peel and large ice cube, dark moody backdrop' },
      { id: 'matcha-latte', label: 'Matcha Latte', modifier: 'ceramic cup of matcha latte with foam art, light wood backdrop, soft daylight' },
    ],
    plates: [
      { id: 'gourmet-plate', label: 'Gourmet Plate', modifier: 'minimalist fine-dining plated dish, sauce dots, microgreens, dark plate, overhead studio shot' },
      { id: 'sushi-platter', label: 'Sushi Platter', modifier: 'elegant sushi platter on slate board, soy and wasabi, overhead studio shot' },
      { id: 'pizza', label: 'Wood-Fired Pizza', modifier: 'rustic wood-fired margherita pizza on wooden board, overhead shot, warm light' },
      { id: 'fruit-bowl', label: 'Fruit Bowl', modifier: 'colorful fresh fruit bowl with berries and citrus, neutral studio backdrop, overhead shot' },
    ],
  },
  tools: {
    creative: [
      { id: 'sketchbook', label: 'Sketchbook', modifier: 'open leather sketchbook with pencil and graphite sketch, wooden desk, soft daylight' },
      { id: 'paint-set', label: 'Paint Set', modifier: 'wooden artist palette with vibrant oil paint blobs and brushes, neutral studio backdrop' },
      { id: 'vinyl-record', label: 'Vinyl Record', modifier: 'spinning black vinyl record on turntable, warm light, dark studio backdrop' },
      { id: 'film-camera', label: 'Film Camera', modifier: 'vintage 35mm film camera with leather strap, neutral studio backdrop, soft shadow' },
    ],
    work: [
      { id: 'briefcase', label: 'Briefcase', modifier: 'premium leather executive briefcase, brass clasps, neutral studio backdrop' },
      { id: 'notebook-pen', label: 'Notebook & Pen', modifier: 'open leather notebook with fountain pen, neutral wood desk, soft daylight' },
      { id: 'tool-belt', label: 'Tool Belt', modifier: 'rugged leather tool belt with hammer and tape measure, dark workshop backdrop' },
      { id: 'medical-kit', label: 'Medical Kit', modifier: 'professional medical kit open with stethoscope and instruments, clean white backdrop' },
    ],
  },
};

export function packFor(kind: WorldKind): ThemePacks {
  if (kind === 'location') return LOCATION_THEMES;
  if (kind === 'building') return BUILDING_THEMES;
  return PROP_THEMES;
}

export function listAllSlots(kind: WorldKind): Array<{ theme_pack: string; item: CatalogItem }> {
  const packs = packFor(kind);
  const out: Array<{ theme_pack: string; item: CatalogItem }> = [];
  for (const [theme, subs] of Object.entries(packs)) {
    for (const [sub, items] of Object.entries(subs)) {
      const tp = `${theme}:${sub}`;
      for (const item of items) out.push({ theme_pack: tp, item });
    }
  }
  return out;
}
