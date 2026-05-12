// Shared world-asset catalog: locations, buildings, props, characters.
// Used by seed-world-catalog and /library to render the catalog grid.
// Keep ids/labels stable — they are the unique key in the *_catalog_previews tables.

export type WorldKind = 'location' | 'building' | 'prop' | 'character';

export interface CatalogItem { id: string; label: string; modifier: string }

// theme_pack format mirrors wardrobe: "<theme>" or "<theme>:<sub>".
export type ThemePacks = Record<string, Record<string, CatalogItem[]>>;

// ---------- LOCATIONS (7 packs × 6 = 42) ----------
export const LOCATION_THEMES: ThemePacks = {
  indoor: {
    living: [
      { id: 'modern-loft', label: 'Modern Loft', modifier: 'open-plan modern loft living room with floor-to-ceiling windows, polished concrete floors, designer sofa, warm afternoon light' },
      { id: 'cozy-cottage', label: 'Cozy Cottage', modifier: 'cozy cottage interior with wooden beams, stone fireplace, knit throws, warm lamp light, rustic charm' },
      { id: 'scandi-apartment', label: 'Scandi Apartment', modifier: 'minimalist Scandinavian apartment, white walls, light oak floors, soft north-facing daylight, plants, hygge atmosphere' },
      { id: 'penthouse-night', label: 'Penthouse Night', modifier: 'luxury penthouse living room at night with city skyline through panoramic windows, dim warm lighting' },
      { id: 'industrial-loft', label: 'Industrial Loft', modifier: 'converted industrial loft with exposed brick walls, steel beams, large factory windows, leather couch, moody ambient light' },
      { id: 'japanese-ryokan', label: 'Japanese Ryokan', modifier: 'traditional japanese ryokan room with tatami floor, shoji paper screens, low wooden table, soft lantern light' },
    ],
    workspace: [
      { id: 'home-office', label: 'Home Office', modifier: 'modern home office with wooden desk, monitor, plants, soft daylight from side window, focused atmosphere' },
      { id: 'startup-loft', label: 'Startup Loft', modifier: 'open startup office loft with exposed brick, long shared desks, neon brand sign, casual coworking energy' },
      { id: 'corporate-boardroom', label: 'Corporate Boardroom', modifier: 'corporate glass boardroom on a high floor, long polished table, leather chairs, panoramic city view' },
      { id: 'creative-studio', label: 'Creative Studio', modifier: 'creative photo studio with seamless paper backdrop, softboxes, wooden floor, professional production atmosphere' },
      { id: 'podcast-studio', label: 'Podcast Studio', modifier: 'modern podcast studio with acoustic foam panels, broadcast microphones on boom arms, warm rim lighting, deep blue ambient backdrop' },
      { id: 'coworking-cafe', label: 'Coworking Café', modifier: 'bright modern coworking café with communal wooden tables, hanging pendant lights, plants, soft daylight, creative buzz' },
    ],
    venue: [
      { id: 'fine-dining', label: 'Fine Dining', modifier: 'upscale fine-dining restaurant interior, candlelight, white tablecloths, dark wood, intimate evening ambience' },
      { id: 'speciality-cafe', label: 'Speciality Café', modifier: 'speciality coffee café with light wood, brass espresso machine, natural daylight, minimalist artisan atmosphere' },
      { id: 'cocktail-bar', label: 'Cocktail Bar', modifier: 'moody speakeasy cocktail bar, brass fixtures, backlit bottle wall, leather booths, low warm lighting' },
      { id: 'art-gallery', label: 'Art Gallery', modifier: 'minimal white-cube art gallery, polished concrete floor, gallery spotlights, framed artworks on white walls' },
      { id: 'jazz-club', label: 'Jazz Club', modifier: 'intimate underground jazz club, small stage with grand piano, red curtain backdrop, smoky warm spotlight, cabaret tables' },
      { id: 'boutique-hotel', label: 'Boutique Hotel Lobby', modifier: 'luxurious boutique hotel lobby with velvet armchairs, marble floor, brass chandelier, fresh flowers, warm evening light' },
    ],
  },
  outdoor: {
    nature: [
      { id: 'forest-path', label: 'Forest Path', modifier: 'sunlit dense forest path, golden light beams through tall trees, soft moss, magical morning atmosphere' },
      { id: 'mountain-vista', label: 'Mountain Vista', modifier: 'epic alpine mountain vista at golden hour, snow-capped peaks, dramatic clouds, cinematic landscape' },
      { id: 'coastal-cliffs', label: 'Coastal Cliffs', modifier: 'rugged coastal cliffs with crashing turquoise ocean, dramatic sky, salt spray, cinematic wide landscape' },
      { id: 'desert-dunes', label: 'Desert Dunes', modifier: 'vast golden desert sand dunes at sunset, long shadows, warm orange light, minimalist landscape' },
      { id: 'misty-lake', label: 'Misty Lake', modifier: 'serene mountain lake at dawn with low mist over the water, pine forest reflection, soft pastel sky' },
      { id: 'lavender-field', label: 'Lavender Field', modifier: 'endless purple lavender field in provence at golden hour, lone tree on horizon, warm summer light' },
    ],
    urban: [
      { id: 'downtown-street', label: 'Downtown Street', modifier: 'busy modern downtown street at golden hour, glass skyscrapers, soft bokeh traffic lights, cinematic depth' },
      { id: 'rooftop-skyline', label: 'Rooftop Skyline', modifier: 'rooftop terrace overlooking city skyline at blue hour, string lights, cinematic urban background' },
      { id: 'neon-alley', label: 'Neon Alley', modifier: 'rainy neon-lit cyberpunk alley, reflective wet pavement, glowing signs in pink and cyan, nighttime moody atmosphere' },
      { id: 'historic-square', label: 'Historic Square', modifier: 'european historic city square at twilight, cobblestones, warm streetlamps, baroque facades, cinematic depth' },
      { id: 'subway-platform', label: 'Subway Platform', modifier: 'gritty urban subway platform with fluorescent tube lighting, tiled walls, motion-blurred train, cinematic perspective' },
      { id: 'graffiti-alley', label: 'Graffiti Alley', modifier: 'narrow urban alley covered in colorful street-art graffiti, soft afternoon backlight, fire escapes, gritty cool atmosphere' },
    ],
    travel: [
      { id: 'beach-paradise', label: 'Beach Paradise', modifier: 'tropical paradise beach, white sand, palm trees, turquoise water, soft golden sunlight, postcard atmosphere' },
      { id: 'mountain-cabin', label: 'Mountain Cabin', modifier: 'wooden mountain cabin in snowy alpine forest, smoke from chimney, warm window light, winter wonderland' },
      { id: 'safari-savanna', label: 'Safari Savanna', modifier: 'african savanna at sunset with acacia tree silhouette, golden grass, dramatic warm sky, cinematic wildlife landscape' },
      { id: 'tuscan-vineyard', label: 'Tuscan Vineyard', modifier: 'rolling Tuscan vineyard at golden hour, cypress trees, warm sunlight, romantic Italian countryside' },
      { id: 'santorini-village', label: 'Santorini Village', modifier: 'whitewashed cycladic santorini village with blue domes, narrow stairways, mediterranean sea backdrop, golden sun' },
      { id: 'iceland-glacier', label: 'Iceland Glacier', modifier: 'dramatic icelandic glacier landscape with black sand beach and ice chunks, overcast nordic light, cinematic wide shot' },
    ],
  },
  scifi: {
    futuristic: [
      { id: 'space-station', label: 'Space Station', modifier: 'sleek interior of orbital space station, glowing control panels, panoramic window with Earth view, sci-fi' },
      { id: 'cyber-city', label: 'Cyber City', modifier: 'futuristic cyberpunk megacity skyline at night, holographic billboards, flying vehicles, neon glow, blade-runner style' },
      { id: 'mars-base', label: 'Mars Base', modifier: 'mars colony habitat exterior, red dust landscape, geodesic domes, distant Earth in pink sky, cinematic sci-fi' },
      { id: 'lab-bioluminescent', label: 'Bioluminescent Lab', modifier: 'futuristic biotech lab with bioluminescent tanks, glowing teal and purple light, sleek dark surfaces, sci-fi atmosphere' },
      { id: 'underwater-dome', label: 'Underwater Dome', modifier: 'futuristic underwater research dome interior with curved glass wall showing deep ocean and bioluminescent fish, blue ambient glow' },
      { id: 'alien-jungle', label: 'Alien Jungle', modifier: 'lush alien planet jungle with bioluminescent oversized plants, twin moons in violet sky, cinematic sci-fi atmosphere' },
    ],
  },
};

// ---------- BUILDINGS (10 packs × 6 = 60) ----------
export const BUILDING_THEMES: ThemePacks = {
  sacred: {
    christian: [
      { id: 'gothic-cathedral', label: 'Gothic Cathedral', modifier: 'majestic gothic cathedral exterior with pointed spires, flying buttresses, rose window, stone facade, dramatic sky' },
      { id: 'baroque-church', label: 'Baroque Church', modifier: 'ornate baroque church facade with twin towers, pastel stucco, golden hour light, southern european square' },
      { id: 'country-chapel', label: 'Country Chapel', modifier: 'small white country chapel with wooden steeple, wildflower meadow, blue sky, peaceful pastoral setting' },
      { id: 'orthodox-monastery', label: 'Orthodox Monastery', modifier: 'orthodox monastery with golden onion domes, white stone walls, gilded crosses, mountain backdrop' },
      { id: 'romanesque-abbey', label: 'Romanesque Abbey', modifier: 'medieval romanesque stone abbey with rounded arches, cloister courtyard, tall bell tower, soft overcast light' },
      { id: 'modern-cathedral', label: 'Modern Cathedral', modifier: 'modernist concrete cathedral with sweeping curves, slit stained-glass strips, dramatic geometric facade, blue hour' },
    ],
    eastern: [
      { id: 'zen-temple', label: 'Zen Temple', modifier: 'tranquil japanese zen temple with red wooden gate, raked gravel garden, cherry blossoms, soft mist' },
      { id: 'pagoda', label: 'Pagoda', modifier: 'multi-tiered red pagoda with curved roofs, stone lanterns, autumn maple trees, golden light' },
      { id: 'hindu-temple', label: 'Hindu Temple', modifier: 'intricately carved south indian hindu temple with towering gopuram, vibrant sculptures, warm golden stone' },
      { id: 'mosque', label: 'Mosque', modifier: 'elegant mosque with white marble dome, slender minarets, intricate geometric tilework, blue sky' },
      { id: 'tibetan-monastery', label: 'Tibetan Monastery', modifier: 'tibetan monastery with white walls and red trim on a himalayan ridge, prayer flags, snow peaks backdrop' },
      { id: 'thai-temple', label: 'Thai Temple', modifier: 'ornate thai buddhist temple with gilded pointed roofs, vibrant red and gold details, palm trees, golden light' },
    ],
  },
  residential: {
    classic: [
      { id: 'victorian-house', label: 'Victorian House', modifier: 'ornate victorian house with bay windows, wraparound porch, painted trim, garden fence, soft daylight' },
      { id: 'colonial-mansion', label: 'Colonial Mansion', modifier: 'stately colonial mansion with white columns, red brick, manicured lawn, wide driveway, warm afternoon light' },
      { id: 'tudor-cottage', label: 'Tudor Cottage', modifier: 'charming tudor cottage with timber framing, thatched roof, climbing roses, english countryside garden' },
      { id: 'mediterranean-villa', label: 'Mediterranean Villa', modifier: 'mediterranean villa with terracotta roof, white stucco walls, cypress trees, infinity pool, golden sunset' },
      { id: 'georgian-townhouse', label: 'Georgian Townhouse', modifier: 'elegant georgian townhouse facade with red brick, white sash windows, black door, iron railing, soft daylight' },
      { id: 'french-chateau', label: 'French Château', modifier: 'romantic french loire chateau with conical towers, manicured gardens, reflecting pond, golden hour' },
    ],
    modern: [
      { id: 'glass-villa', label: 'Glass Villa', modifier: 'modern glass villa with cantilevered roof, infinity pool, minimalist landscaping, dusk lighting from interior' },
      { id: 'concrete-cube', label: 'Concrete Cube', modifier: 'brutalist concrete cube residence with sharp angles, large slit windows, gravel courtyard, dramatic shadows' },
      { id: 'wooden-cabin', label: 'Wooden Cabin', modifier: 'modern A-frame wooden cabin in pine forest, large glass facade, warm interior glow at twilight' },
      { id: 'desert-bungalow', label: 'Desert Bungalow', modifier: 'low-slung desert modernist bungalow, palm trees, stone path, pool reflecting pink sunset sky' },
      { id: 'tiny-house', label: 'Tiny House', modifier: 'modern minimalist tiny house on wheels in alpine meadow, large windows, wood cladding, golden hour' },
      { id: 'eco-treehouse', label: 'Eco Treehouse', modifier: 'futuristic eco treehouse suspended in tropical canopy, curved wood and glass shell, lantern lighting, dusk' },
    ],
  },
  historical: {
    ancient: [
      { id: 'greek-temple', label: 'Greek Temple', modifier: 'ancient greek doric temple ruins on hilltop, marble columns, blue mediterranean sky, golden light' },
      { id: 'roman-colosseum', label: 'Roman Colosseum', modifier: 'roman colosseum exterior, weathered stone arches, dramatic golden hour light, epic scale' },
      { id: 'medieval-castle', label: 'Medieval Castle', modifier: 'medieval stone castle on cliff with battlements and towers, moody overcast sky, dramatic landscape' },
      { id: 'samurai-castle', label: 'Samurai Castle', modifier: 'japanese samurai castle with white walls, multi-tiered black tile roofs, cherry blossoms, blue sky' },
      { id: 'egyptian-pyramid', label: 'Egyptian Pyramid', modifier: 'great egyptian pyramid of giza at golden hour, vast desert sand, dramatic blue sky, cinematic wide shot' },
      { id: 'mayan-temple', label: 'Mayan Temple', modifier: 'mayan stone step pyramid temple in jungle clearing, lush vegetation, mist, soft morning light' },
    ],
    landmark: [
      { id: 'lighthouse', label: 'Lighthouse', modifier: 'tall striped lighthouse on rocky coast, stormy sea, dramatic sky, beam of light at dusk' },
      { id: 'old-windmill', label: 'Old Windmill', modifier: 'classic dutch windmill in tulip field, wooden blades, blue sky with soft clouds, golden light' },
      { id: 'observatory', label: 'Observatory', modifier: 'mountain-top astronomical observatory with white dome, starry twilight sky, snow-capped peaks' },
      { id: 'stone-bridge', label: 'Stone Bridge', modifier: 'arched stone bridge over misty river, autumn forest, soft morning light, romantic landscape' },
      { id: 'clock-tower', label: 'Clock Tower', modifier: 'iconic stone clock tower with ornate gothic detail, warm streetlamp light, evening city square' },
      { id: 'opera-house', label: 'Opera House', modifier: 'grand neoclassical opera house facade with columns and statues, illuminated at night, wide plaza' },
    ],
  },
  fortified: {
    castles: [
      { id: 'crusader-fortress', label: 'Crusader Fortress', modifier: 'massive crusader stone fortress on a desert hilltop, thick walls, square towers, golden hour' },
      { id: 'bavarian-castle', label: 'Bavarian Castle', modifier: 'fairytale bavarian castle with white walls and blue spires, surrounded by alpine forest, mist' },
      { id: 'highland-keep', label: 'Highland Keep', modifier: 'rugged scottish highland castle keep on a loch, moody overcast sky, heather hills' },
      { id: 'desert-citadel', label: 'Desert Citadel', modifier: 'sandstone desert citadel with crenellated walls, palm grove, warm sunset light' },
      { id: 'moorish-fort', label: 'Moorish Fort', modifier: 'andalusian moorish hilltop fortress with sand-coloured walls, horseshoe arches, palm trees, warm light' },
      { id: 'cliff-monastery', label: 'Cliff Monastery', modifier: 'fortified monastery clinging to a sheer cliff face, narrow stone bridge, mountain mist, dramatic scale' },
    ],
    bridges: [
      { id: 'roman-aqueduct', label: 'Roman Aqueduct', modifier: 'monumental roman stone aqueduct with tiered arches over a green valley, golden hour' },
      { id: 'covered-bridge', label: 'Covered Bridge', modifier: 'red wooden covered bridge over a mountain stream, autumn forest, crisp daylight' },
      { id: 'suspension-bridge', label: 'Suspension Bridge', modifier: 'iconic red suspension bridge crossing a foggy bay, dramatic cinematic wide shot' },
      { id: 'glass-skybridge', label: 'Glass Skybridge', modifier: 'futuristic glass-floor skybridge between two skyscrapers at dusk, glowing city below' },
      { id: 'rope-bridge', label: 'Rope Bridge', modifier: 'wooden rope bridge across a misty mountain canyon, dense jungle below, dramatic adventure atmosphere' },
      { id: 'medieval-drawbridge', label: 'Medieval Drawbridge', modifier: 'medieval stone gatehouse with wooden drawbridge over moat, banners, overcast sky' },
    ],
  },
  modern: {
    skyline: [
      { id: 'glass-skyscraper', label: 'Glass Skyscraper', modifier: 'sleek modern glass skyscraper reflecting sky, wide low-angle view, dramatic clouds, urban grandeur' },
      { id: 'twisted-tower', label: 'Twisted Tower', modifier: 'futuristic twisted spiral skyscraper, glass facade, dusk sky, surrounding city lights' },
      { id: 'mall-atrium', label: 'Mall Atrium', modifier: 'modern shopping mall atrium with curved glass roof, escalators, soft daylight, polished floors' },
      { id: 'concert-arena', label: 'Concert Arena', modifier: 'futuristic concert arena exterior at night, illuminated facade, crowd silhouettes, dramatic lighting' },
      { id: 'opera-modern', label: 'Modern Opera', modifier: 'iconic modern opera house with shell-like sculptural roof, harbor backdrop, blue hour lighting' },
      { id: 'stadium', label: 'Stadium', modifier: 'huge modern football stadium exterior at night, illuminated curved facade, crowds streaming in, dramatic floodlights' },
    ],
    tech: [
      { id: 'data-center', label: 'Data Center', modifier: 'industrial data center exterior at dusk with cooling towers, fenced perimeter, blue ambient lighting' },
      { id: 'rocket-pad', label: 'Rocket Pad', modifier: 'rocket launchpad with rocket on stand, gantry tower, sunrise sky, steam vapor, cinematic sci-fi atmosphere' },
      { id: 'wind-farm', label: 'Wind Farm', modifier: 'rolling hills wind farm at sunset, towering white turbines, golden meadow, dramatic clouds' },
      { id: 'solar-array', label: 'Solar Array', modifier: 'vast desert solar panel array reflecting blue sky, geometric patterns, distant mountains' },
      { id: 'satellite-dish', label: 'Satellite Dish Array', modifier: 'large radio telescope dish array on a high desert plateau, starry twilight sky, cinematic sci-fi mood' },
      { id: 'fusion-plant', label: 'Fusion Plant', modifier: 'futuristic fusion energy plant exterior with glowing reactor dome, cooling towers, blue ambient night light' },
    ],
  },
};

// ---------- PROPS (10 packs × 6 = 60) ----------
export const PROP_THEMES: ThemePacks = {
  furniture: {
    seating: [
      { id: 'leather-armchair', label: 'Leather Armchair', modifier: 'premium chesterfield leather armchair, deep brown leather, brass studs, neutral studio backdrop' },
      { id: 'modern-sofa', label: 'Modern Sofa', modifier: 'minimalist three-seat modern sofa in cream bouclé, oak legs, neutral studio backdrop' },
      { id: 'designer-chair', label: 'Designer Chair', modifier: 'iconic designer accent chair in walnut and tan leather, sculptural form, neutral studio backdrop' },
      { id: 'rattan-lounger', label: 'Rattan Lounger', modifier: 'woven rattan lounge chair with linen cushion, boho styling, neutral studio backdrop' },
      { id: 'velvet-bench', label: 'Velvet Bench', modifier: 'low emerald-green velvet upholstered bench with brass legs, neutral studio backdrop' },
      { id: 'gaming-chair', label: 'Gaming Chair', modifier: 'modern ergonomic gaming chair in black and red, racing-style, neutral studio backdrop' },
    ],
    tables: [
      { id: 'oak-dining', label: 'Oak Dining Table', modifier: 'large solid oak dining table with chamfered edges, neutral studio backdrop' },
      { id: 'marble-coffee', label: 'Marble Coffee Table', modifier: 'round white marble coffee table with brass base, neutral studio backdrop' },
      { id: 'workspace-desk', label: 'Workspace Desk', modifier: 'minimalist walnut workspace desk with cable grommet, neutral studio backdrop' },
      { id: 'wooden-bench', label: 'Wooden Bench', modifier: 'long live-edge wooden bench, raw natural finish, neutral studio backdrop' },
      { id: 'glass-side-table', label: 'Glass Side Table', modifier: 'minimal round smoked-glass side table with thin black metal frame, neutral studio backdrop' },
      { id: 'rustic-farm-table', label: 'Rustic Farm Table', modifier: 'long reclaimed-wood rustic farm table with iron x-frame legs, neutral studio backdrop' },
    ],
  },
  vehicles: {
    cars: [
      { id: 'sport-coupe', label: 'Sport Coupe', modifier: 'sleek modern matte-black sport coupe, three-quarter front view, studio lighting, no logos' },
      { id: 'classic-roadster', label: 'Classic Roadster', modifier: 'cherry-red 1960s classic roadster convertible, three-quarter front view, studio lighting' },
      { id: 'luxury-suv', label: 'Luxury SUV', modifier: 'premium silver luxury SUV, three-quarter front view, soft studio lighting, no logos' },
      { id: 'electric-sedan', label: 'Electric Sedan', modifier: 'modern white electric sedan with minimalist design, three-quarter front view, studio lighting, no logos' },
      { id: 'pickup-truck', label: 'Pickup Truck', modifier: 'rugged matte-grey pickup truck with off-road tires, three-quarter front view, studio lighting, no logos' },
      { id: 'compact-city-car', label: 'Compact City Car', modifier: 'cute compact city car in pastel mint, three-quarter front view, soft studio lighting, no logos' },
    ],
    transport: [
      { id: 'vintage-bicycle', label: 'Vintage Bicycle', modifier: 'classic dutch city bicycle with leather saddle, woven basket, neutral studio backdrop' },
      { id: 'electric-scooter', label: 'Electric Scooter', modifier: 'modern foldable electric scooter, matte grey, neutral studio backdrop' },
      { id: 'sailing-yacht', label: 'Sailing Yacht', modifier: 'elegant white sailing yacht on calm turquoise sea, sunny sky, side view' },
      { id: 'helicopter', label: 'Helicopter', modifier: 'sleek private helicopter on helipad, studio-like overcast lighting, side view' },
      { id: 'cafe-motorcycle', label: 'Café Motorcycle', modifier: 'classic café-racer motorcycle in black and chrome, side view, neutral studio backdrop' },
      { id: 'private-jet', label: 'Private Jet', modifier: 'sleek private jet on tarmac at golden hour, three-quarter view, no logos' },
    ],
  },
  tech: {
    devices: [
      { id: 'laptop', label: 'Laptop', modifier: 'open premium silver laptop showing blank screen, neutral studio backdrop, soft shadow' },
      { id: 'smartphone', label: 'Smartphone', modifier: 'modern flagship smartphone with blank black screen, floating, neutral studio backdrop' },
      { id: 'vr-headset', label: 'VR Headset', modifier: 'futuristic white VR headset with controllers, soft studio lighting, neutral backdrop' },
      { id: 'drone', label: 'Drone', modifier: 'sleek black quadcopter drone hovering, soft studio backdrop, dramatic rim light' },
      { id: 'tablet', label: 'Tablet', modifier: 'premium tablet with stylus, blank screen, three-quarter view, neutral studio backdrop' },
      { id: 'smartwatch', label: 'Smartwatch', modifier: 'modern smartwatch with sport band, blank dial, three-quarter view, neutral studio backdrop' },
    ],
    studio: [
      { id: 'cinema-camera', label: 'Cinema Camera', modifier: 'professional cinema camera on tripod with cinema lens, neutral studio backdrop' },
      { id: 'mic-shock-mount', label: 'Studio Mic', modifier: 'broadcast condenser microphone on shock mount and boom arm, dark studio backdrop' },
      { id: 'mixing-console', label: 'Mixing Console', modifier: 'professional audio mixing console with backlit faders, dark studio backdrop' },
      { id: 'softbox', label: 'Softbox Light', modifier: 'large softbox studio light on stand, soft glow, dark studio backdrop' },
      { id: 'gimbal-rig', label: 'Gimbal Rig', modifier: 'professional 3-axis camera gimbal stabilizer rig with mirrorless camera, neutral studio backdrop' },
      { id: 'broadcast-headphones', label: 'Studio Headphones', modifier: 'premium over-ear studio reference headphones in matte black, neutral studio backdrop, soft shadow' },
    ],
  },
  food: {
    drinks: [
      { id: 'espresso-cup', label: 'Espresso Cup', modifier: 'porcelain espresso cup on saucer with rich crema, neutral studio backdrop, food-photography lighting' },
      { id: 'wine-glass', label: 'Wine Glass', modifier: 'crystal wine glass with red wine, soft backlight, neutral studio backdrop' },
      { id: 'cocktail', label: 'Cocktail', modifier: 'classic old-fashioned cocktail with citrus peel and large ice cube, dark moody backdrop' },
      { id: 'matcha-latte', label: 'Matcha Latte', modifier: 'ceramic cup of matcha latte with foam art, light wood backdrop, soft daylight' },
      { id: 'craft-beer', label: 'Craft Beer', modifier: 'tall craft beer pint glass with golden lager and foam head, dark moody studio backdrop' },
      { id: 'fresh-smoothie', label: 'Fresh Smoothie', modifier: 'tall glass of berry smoothie with fresh fruit garnish and straw, light studio backdrop, food photography' },
    ],
    plates: [
      { id: 'gourmet-plate', label: 'Gourmet Plate', modifier: 'minimalist fine-dining plated dish, sauce dots, microgreens, dark plate, overhead studio shot' },
      { id: 'sushi-platter', label: 'Sushi Platter', modifier: 'elegant sushi platter on slate board, soy and wasabi, overhead studio shot' },
      { id: 'pizza', label: 'Wood-Fired Pizza', modifier: 'rustic wood-fired margherita pizza on wooden board, overhead shot, warm light' },
      { id: 'fruit-bowl', label: 'Fruit Bowl', modifier: 'colorful fresh fruit bowl with berries and citrus, neutral studio backdrop, overhead shot' },
      { id: 'gourmet-burger', label: 'Gourmet Burger', modifier: 'gourmet beef burger with melted cheese and brioche bun, side view, dark moody studio backdrop' },
      { id: 'pasta-bowl', label: 'Pasta Bowl', modifier: 'rustic bowl of fresh pasta with herbs and parmesan, overhead studio shot, warm light' },
    ],
  },
  tools: {
    creative: [
      { id: 'sketchbook', label: 'Sketchbook', modifier: 'open leather sketchbook with pencil and graphite sketch, wooden desk, soft daylight' },
      { id: 'paint-set', label: 'Paint Set', modifier: 'wooden artist palette with vibrant oil paint blobs and brushes, neutral studio backdrop' },
      { id: 'vinyl-record', label: 'Vinyl Record', modifier: 'spinning black vinyl record on turntable, warm light, dark studio backdrop' },
      { id: 'film-camera', label: 'Film Camera', modifier: 'vintage 35mm film camera with leather strap, neutral studio backdrop, soft shadow' },
      { id: 'electric-guitar', label: 'Electric Guitar', modifier: 'iconic sunburst electric guitar on stand, dark studio backdrop, dramatic side light' },
      { id: 'pottery-wheel', label: 'Pottery Wheel', modifier: 'spinning clay vessel on a pottery wheel mid-shaping, hands of artist, warm rustic studio light' },
    ],
    work: [
      { id: 'briefcase', label: 'Briefcase', modifier: 'premium leather executive briefcase, brass clasps, neutral studio backdrop' },
      { id: 'notebook-pen', label: 'Notebook & Pen', modifier: 'open leather notebook with fountain pen, neutral wood desk, soft daylight' },
      { id: 'tool-belt', label: 'Tool Belt', modifier: 'rugged leather tool belt with hammer and tape measure, dark workshop backdrop' },
      { id: 'medical-kit', label: 'Medical Kit', modifier: 'professional medical kit open with stethoscope and instruments, clean white backdrop' },
      { id: 'chefs-knife', label: 'Chef\u2019s Knife', modifier: 'premium chef knife with damascus steel blade and walnut handle on wooden cutting board, food-photography lighting' },
      { id: 'lab-flask', label: 'Lab Flask', modifier: 'glass laboratory erlenmeyer flask with glowing teal liquid, dark scientific backdrop, soft rim light' },
    ],
  },
};

// ---------- CHARACTERS (13 packs × 6 = 78) ----------
// Cast Catalog. Style lock pushes "full-body cinematic portrait, neutral studio backdrop".
// Items below describe identity + signature wardrobe; the seeder appends the style lock.
export const CHARACTER_THEMES: ThemePacks = {
  historical: {
    roman: [
      { id: 'roman-legionary', label: 'Roman Legionary', modifier: 'roman legionary soldier in lorica segmentata armor, red tunic, gladius sword, scutum shield, plumed helmet, period-accurate' },
      { id: 'roman-centurion', label: 'Roman Centurion', modifier: 'roman centurion in muscled cuirass with transverse-crested helmet, red cloak, vine staff, commanding presence' },
      { id: 'roman-senator', label: 'Roman Senator', modifier: 'roman senator in white toga with broad purple stripe, laurel wreath, dignified posture, classical features' },
      { id: 'roman-gladiator', label: 'Roman Gladiator', modifier: 'roman murmillo gladiator with crested helmet, manica arm guard, large rectangular shield and short sword, leather subligaculum' },
      { id: 'roman-vestal', label: 'Roman Vestal', modifier: 'roman vestal virgin priestess in long white stola and palla, hair veiled with white infula, holding sacred flame' },
      { id: 'roman-emperor', label: 'Roman Emperor', modifier: 'roman emperor in golden laurel crown and richly embroidered purple toga, regal jewelry, imperial bearing' },
    ],
    medieval: [
      { id: 'medieval-knight', label: 'Medieval Knight', modifier: 'medieval knight in full plate armor with surcoat, longsword and heater shield with heraldic blazon, helm under arm' },
      { id: 'medieval-peasant', label: 'Medieval Peasant', modifier: 'medieval peasant in coarse linen tunic and hood, leather belt, simple sandals, weathered honest face' },
      { id: 'medieval-bishop', label: 'Medieval Bishop', modifier: 'medieval catholic bishop in white alb, embroidered chasuble, mitre, holding crosier staff, solemn expression' },
      { id: 'medieval-queen', label: 'Medieval Queen', modifier: 'medieval queen in flowing burgundy gown with gold embroidery, golden crown, ermine-trimmed cloak, regal posture' },
      { id: 'medieval-bard', label: 'Medieval Bard', modifier: 'medieval bard in colourful tunic with feathered cap, holding a lute, lively expressive face' },
      { id: 'medieval-crusader', label: 'Crusader Knight', modifier: 'crusader knight in chainmail hauberk and white tabard with red cross, steel helm, sword and kite shield' },
    ],
    viking: [
      { id: 'viking-warrior', label: 'Viking Warrior', modifier: 'viking warrior in fur-trimmed leather armor, round wooden shield, axe, braided beard, fierce stance' },
      { id: 'viking-shieldmaiden', label: 'Shieldmaiden', modifier: 'viking shieldmaiden in leather and chainmail, round shield, sword, braided blonde hair, determined expression' },
      { id: 'viking-jarl', label: 'Viking Jarl', modifier: 'viking jarl chieftain in fur cloak over chainmail, silver torc, ornate axe, commanding presence' },
      { id: 'viking-skald', label: 'Skald', modifier: 'viking skald poet in earthy wool robe, fur shoulders, holding small harp, weathered storyteller face' },
      { id: 'viking-berserker', label: 'Berserker', modifier: 'viking berserker bare-chested with bear-fur cloak, war paint, two axes, wild ferocious expression' },
      { id: 'viking-seeress', label: 'Seeress', modifier: 'viking völva seeress in dark hooded robe with bone necklaces, staff topped with antler, mystical aura' },
    ],
    samurai: [
      { id: 'samurai-warrior', label: 'Samurai', modifier: 'samurai warrior in full lacquered ō-yoroi armor with horned kabuto helmet, katana at side, stoic expression' },
      { id: 'samurai-ronin', label: 'Ronin', modifier: 'wandering ronin in worn dark kimono and hakama, straw hat, katana, tired battle-scarred face' },
      { id: 'samurai-geisha', label: 'Geisha', modifier: 'geisha in elaborate silk kimono with intricate floral pattern, white face makeup, ornate hair pins, holding paper fan' },
      { id: 'samurai-daimyo', label: 'Daimyo', modifier: 'feudal japanese daimyo lord in richly embroidered kimono and kataginu, swords at side, dignified bearing' },
      { id: 'samurai-ninja', label: 'Ninja', modifier: 'shinobi ninja in dark indigo gi with masked face cloth, ninjato sword across back, shuriken pouch, agile crouch' },
      { id: 'samurai-monk', label: 'Warrior Monk', modifier: 'sōhei warrior monk with shaved head, simple grey robe, naginata polearm, calm but resolute face' },
    ],
    egyptian: [
      { id: 'egypt-pharaoh', label: 'Pharaoh', modifier: 'ancient egyptian pharaoh in nemes striped headcloth with uraeus, golden pectoral collar, crook and flail, regal pose' },
      { id: 'egypt-priestess', label: 'Egyptian Priestess', modifier: 'ancient egyptian priestess in pleated white linen gown, broad turquoise faience collar, ankh in hand, kohl-rimmed eyes' },
      { id: 'egypt-scribe', label: 'Scribe', modifier: 'ancient egyptian scribe in white linen kilt seated cross-legged with papyrus and reed pen, calm intelligent expression' },
      { id: 'egypt-charioteer', label: 'Charioteer', modifier: 'ancient egyptian chariot warrior in leather scale armor with composite bow, blue and gold headband, athletic build' },
      { id: 'egypt-worker', label: 'Stoneworker', modifier: 'ancient egyptian stoneworker in simple white loincloth with leather belt, copper chisel and mallet, dust-covered skin' },
      { id: 'egypt-royal-guard', label: 'Royal Guard', modifier: 'ancient egyptian royal guard with bronze khopesh sword, leather breastplate, striped headcloth, tall and imposing' },
    ],
    greek: [
      { id: 'greek-hoplite', label: 'Hoplite', modifier: 'ancient greek hoplite warrior in bronze cuirass and corinthian helmet, large round aspis shield with sigma, doru spear' },
      { id: 'greek-philosopher', label: 'Philosopher', modifier: 'ancient greek philosopher in white himation robe, long beard, holding a scroll, contemplative expression' },
      { id: 'greek-athlete', label: 'Athlete', modifier: 'ancient greek olympic athlete with athletic nude torso and simple loincloth, olive wreath, holding a discus' },
      { id: 'greek-oracle', label: 'Oracle', modifier: 'oracle of delphi priestess in flowing white peplos with golden cord, laurel crown, mystic distant gaze' },
      { id: 'greek-trader', label: 'Greek Trader', modifier: 'ancient greek merchant in earthy chiton, leather satchel, weighing scales, wise approachable face' },
      { id: 'greek-king', label: 'Spartan King', modifier: 'spartan king in red cloak over bronze armor, plumed corinthian helmet, spear and shield with lambda, commanding stance' },
    ],
    ww2: [
      { id: 'ww2-soldier', label: 'Allied Soldier', modifier: 'WWII era infantry soldier in olive-drab uniform with helmet, rifle slung over shoulder, no insignia, weathered determined face' },
      { id: 'ww2-pilot', label: 'WWII Pilot', modifier: 'WWII era fighter pilot in brown leather flight jacket, fleece collar, leather flight cap with goggles, no insignia, brave expression' },
      { id: 'ww2-nurse', label: 'Field Nurse', modifier: 'WWII era field nurse in olive-grey uniform with white apron and red cross armband, hair pinned, kind tired expression' },
      { id: 'ww2-resistance', label: 'Resistance Fighter', modifier: '1940s resistance fighter in worn civilian coat and beret, scarf, satchel, shadowed determined face, no insignia' },
      { id: 'ww2-officer', label: 'Field Officer', modifier: 'WWII era field officer in tailored olive uniform with peaked cap and binoculars, no insignia, decisive posture' },
      { id: 'ww2-engineer', label: 'Field Engineer', modifier: 'WWII era combat engineer in dusty olive coveralls and helmet, tool belt and field radio, focused practical look' },
    ],
    wildwest: [
      { id: 'west-sheriff', label: 'Sheriff', modifier: 'old west sheriff in long brown duster coat, vest with star badge, wide-brimmed cowboy hat, revolver in holster, weathered face' },
      { id: 'west-outlaw', label: 'Outlaw', modifier: 'old west outlaw in dusty long coat and bandana mask around neck, dual revolvers, narrow eyes, dangerous demeanor' },
      { id: 'west-saloon', label: 'Saloon Owner', modifier: 'old west saloon owner woman in elegant burgundy bustle dress with lace, feathered hat, confident knowing smile' },
      { id: 'west-prospector', label: 'Prospector', modifier: 'old west gold prospector in patched flannel shirt, suspenders, battered hat, holding pickaxe, grizzled bearded face' },
      { id: 'west-cowgirl', label: 'Cowgirl', modifier: 'old west cowgirl in fringed leather jacket and divided riding skirt, bandana, lasso in hand, confident smile' },
      { id: 'west-scout', label: 'Frontier Scout', modifier: 'frontier scout in fringed buckskin jacket, fur cap, rifle across back, weathered observant face' },
    ],
  },
  modern: {
    professions: [
      { id: 'mod-doctor', label: 'Doctor', modifier: 'modern doctor in clean white lab coat over scrubs, stethoscope around neck, kind confident expression, hospital lighting' },
      { id: 'mod-chef', label: 'Chef', modifier: 'modern executive chef in crisp white double-breasted jacket and tall toque, focused expression, kitchen ambient backdrop' },
      { id: 'mod-police', label: 'Police Officer', modifier: 'modern uniformed police officer in dark blue uniform with generic badge, utility belt, calm authoritative stance' },
      { id: 'mod-firefighter', label: 'Firefighter', modifier: 'modern firefighter in turnout gear with reflective stripes, helmet under arm, soot-marked face, heroic stance' },
      { id: 'mod-pilot', label: 'Airline Pilot', modifier: 'modern airline captain in dark navy uniform with epaulets and white shirt, peaked cap, confident professional smile' },
      { id: 'mod-barista', label: 'Barista', modifier: 'modern speciality coffee barista in denim apron over henley shirt, beanie, holding cup, friendly creative vibe' },
    ],
    business: [
      { id: 'biz-ceo', label: 'CEO', modifier: 'modern CEO in tailored charcoal suit with crisp shirt no tie, confident relaxed posture, premium executive look' },
      { id: 'biz-lawyer', label: 'Lawyer', modifier: 'modern lawyer in sharp navy suit holding leather portfolio, focused intelligent expression, professional polish' },
      { id: 'biz-trader', label: 'Stock Trader', modifier: 'modern wall street trader in shirtsleeves and tie, sleeves rolled up, intense focused expression, energetic stance' },
      { id: 'biz-consultant', label: 'Consultant', modifier: 'modern management consultant in smart-casual blazer over open-collar shirt, holding tablet, approachable confident look' },
      { id: 'biz-receptionist', label: 'Receptionist', modifier: 'modern hotel receptionist in tailored uniform blazer with name-badge style accent, warm welcoming smile, polished hair' },
      { id: 'biz-manager', label: 'Project Manager', modifier: 'modern tech project manager in smart casual outfit with rolled sleeves, glasses, holding sticky-notes, calm leader vibe' },
    ],
    creative: [
      { id: 'cre-photographer', label: 'Photographer', modifier: 'modern photographer in black tee and utility vest, camera around neck, focused creative expression' },
      { id: 'cre-dj', label: 'DJ', modifier: 'modern club DJ in black hoodie and oversized headphones around neck, low neon lighting backdrop, cool focused look' },
      { id: 'cre-designer', label: 'Designer', modifier: 'modern graphic designer in stylish minimalist outfit, holding tablet with stylus, thoughtful creative expression' },
      { id: 'cre-painter', label: 'Painter', modifier: 'modern painter in paint-splattered apron over t-shirt, holding palette and brush, focused artistic expression' },
      { id: 'cre-filmmaker', label: 'Filmmaker', modifier: 'modern indie filmmaker in casual jacket with vintage cinema camera on shoulder, observant directorial look' },
      { id: 'cre-influencer', label: 'Influencer', modifier: 'modern lifestyle influencer in trendy outfit holding ring-light selfie phone, natural styled hair, bright friendly smile' },
    ],
  },
  fantasy: {
    classic: [
      { id: 'fan-wizard', label: 'Wizard', modifier: 'fantasy wizard in long star-embroidered indigo robe and pointed hat, long white beard, gnarled wooden staff with glowing crystal' },
      { id: 'fan-elf-ranger', label: 'Elf Ranger', modifier: 'fantasy elf ranger with long pointed ears, leather and green cloth armor, hooded cloak, longbow and quiver, agile graceful pose' },
      { id: 'fan-dwarf', label: 'Dwarf Warrior', modifier: 'fantasy dwarf warrior with massive braided red beard, ornate plate armor with runes, two-handed war hammer, sturdy stance' },
      { id: 'fan-paladin', label: 'Paladin', modifier: 'fantasy paladin in gleaming silver-and-gold plate armor with holy emblem on tabard, glowing longsword, righteous noble stance' },
      { id: 'fan-sorceress', label: 'Sorceress', modifier: 'fantasy sorceress in deep-purple flowing robe with arcane embroidery, crystal staff, glowing magical wisps around hands' },
      { id: 'fan-druid', label: 'Druid', modifier: 'fantasy druid in earthen leaf-cloak with antler headdress, gnarled wooden staff with vines, gentle wise expression' },
    ],
  },
  scifi: {
    cyberpunk: [
      { id: 'cy-hacker', label: 'Hacker', modifier: 'cyberpunk hacker in dark hoodie with subtle LED trim, augmented reality glasses, fingerless gloves, neon backlight' },
      { id: 'cy-netrunner', label: 'Netrunner', modifier: 'cyberpunk netrunner with neural jack ports on neck, sleek techwear jacket with cyan accents, holographic data interface around hand' },
      { id: 'cy-streetsamurai', label: 'Street Samurai', modifier: 'cyberpunk street samurai in long black trench coat with red lining, cybernetic katana at hip, chrome cybernetic arm, stoic stance' },
      { id: 'cy-corp-suit', label: 'Corp Suit', modifier: 'cyberpunk megacorp executive in glossy black suit with metallic lapel chip, slick hair, cold confident expression, neon office backdrop' },
      { id: 'cy-mech-pilot', label: 'Mech Pilot', modifier: 'cyberpunk mech pilot in pressurized flight suit with helmet under arm, neon-blue HUD glow on visor, athletic stance' },
      { id: 'cy-synth', label: 'Synth Android', modifier: 'cyberpunk humanoid synth android with porcelain-smooth skin, exposed circuit lines on neck, glowing iris, sleek minimalist outfit' },
    ],
  },
};

export function packFor(kind: WorldKind): ThemePacks {
  if (kind === 'location') return LOCATION_THEMES;
  if (kind === 'building') return BUILDING_THEMES;
  if (kind === 'prop') return PROP_THEMES;
  return CHARACTER_THEMES;
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
