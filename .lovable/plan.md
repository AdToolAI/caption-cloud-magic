## Ziel

World-Catalog um **+300 Assets** erweitern, sinnvoll auf alle 4 Achsen verteilt — mit Fokus auf Lücken in den bestehenden Themen und neuen Sub-Packs für Genres, die heute schwach abgedeckt sind.

---

## Mengengerüst (300 neue Bilder)

### A) Cast (Personen) — +120 Bilder

**A1 — Bestehende Cast-Packs von 6 → 8 erweitern (+2 pro Pack)**
13 Packs × 2 = **+26 Bilder**
(z. B. Roman: + Praetorian, Slave; Medieval: + Monk, Blacksmith; Cyberpunk: + Bartender, Bounty Hunter …)

**A2 — Neue Cast-Sub-Packs (à 6 Bilder)**
| Theme | Sub-Pack | 6 Archetypen |
|---|---|---|
| historical | greek | Hoplite, Philosopher, Athlete, Oracle, Trader, King |
| historical | aztec | Warrior, Priest, Farmer, Noble, Healer, Merchant |
| historical | feudal-japan | Daimyo, Peasant, Tea Master, Sumo, Court Lady, Archer |
| historical | victorian | Gentleman, Lady, Detective, Maid, Factory Worker, Doctor |
| historical | 1920s | Flapper, Gangster, Jazz Singer, Bootlegger, Socialite, Cop |
| modern | sports | Footballer, Boxer, Surfer, Gymnast, Cyclist, Coach |
| modern | medical | Surgeon, Paramedic, Therapist, Researcher, Dentist, Vet |
| modern | military | Soldier, SpecOps, Sniper, Engineer, Medic, Drone Operator |
| modern | nightlife | Bartender, Club Owner, Bouncer, Dancer, Party Promoter, VIP |
| fantasy | dark | Necromancer, Vampire Lord, Witch, Demon Hunter, Lich, Cultist |
| fantasy | nature | Forest Druid, Centaur, Faun, Elven Archer, Tree Shepherd, Beast Tamer |
| scifi | space-opera | Starship Captain, Alien Diplomat, Bounty Hunter, Engineer, Pilot, Smuggler |
| scifi | post-apocalyptic | Wanderer, Raider, Scavenger, Medic, Mutant, Trader |
| anime | shonen | Hero, Rival, Mentor, Mascot, Villain, Sidekick |
| bollywood | classic | Hero, Heroine, Villain, Comic Relief, Patriarch, Dancer |
| folklore | slavic | Baba Yaga, Cossack, Tsar, Volkh, Rusalka, Bogatyr |

16 neue Packs × 6 = **+96 Bilder**

**Cast gesamt:** +120

---

### B) Locations (Environments) — +60 Bilder

**B1 — Bestehende 7 Packs von 6 → 8 (+2 pro Pack):** +14
**B2 — Neue Sub-Packs (à 6 Bilder):**
| Theme | Sub-Pack |
|---|---|
| nature | desert (dune sea, oasis, canyon, salt flat, mesa, sandstorm) |
| nature | arctic (glacier, fjord, ice cave, tundra, frozen lake, aurora) |
| nature | tropical (jungle clearing, beach lagoon, waterfall, mangrove, volcano slope, coral reef) |
| urban | rooftop (NYC, Tokyo, Dubai, London, Berlin, LA) |
| urban | underground (subway, sewer, parking garage, bunker, club basement, tunnel) |
| interior | luxury (penthouse, yacht deck, private jet, ballroom, spa, vault) |
| interior | industrial (warehouse, factory floor, hangar, refinery, steel mill, shipyard) |
| sci-fi | spaceship (bridge, hangar, engine room, mess hall, airlock, observation deck) |
| sci-fi | colony (mars dome, lunar base, orbital station, terraform site, biosphere, control room) |

8 neue × 6 (1 hat keinen Anker, deshalb nur 8 statt 9) = **+46**
≈ **+60 gesamt**

---

### C) Buildings (Architektur) — +60 Bilder

**C1 — Bestehende 10 Packs von 6 → 8:** +20
**C2 — Neue Sub-Packs (à 5 Bilder):**
| Theme | Sub-Pack |
|---|---|
| historical | egyptian (pyramid, temple, palace, obelisk, market hall) |
| historical | aztec (step pyramid, palace, ball court, market, temple) |
| historical | feudal-japan (pagoda, castle, tea house, shrine, gate) |
| modern | infrastructure (airport terminal, train station, bridge, stadium, hospital) |
| modern | retail (luxury store, mall, café façade, boutique, supermarket) |
| modern | landmarks (skyscraper, museum, opera, cathedral, observatory) |
| sci-fi | megastructure (arcology, spaceport, orbital ring, habitat dome, mega-tower) |
| fantasy | strongholds (wizard tower, dwarven hall, elven palace, dark fortress, ruined keep) |

8 neue × 5 = **+40**
≈ **+60 gesamt**

---

### D) Props — +60 Bilder

**D1 — Bestehende 10 Packs von 6 → 8:** +20
**D2 — Neue Sub-Packs (à 5 Bilder):**
| Theme | Sub-Pack |
|---|---|
| weapons | historical (gladius, longsword, katana, musket, war hammer) |
| weapons | modern (handgun, tactical rifle, knife, taser, baton) |
| weapons | sci-fi (plasma rifle, energy sword, drone, exo-glove, EMP) |
| vehicles | historical (chariot, carriage, sailing ship, biplane, steam train) |
| vehicles | modern (sports car, motorcycle, helicopter, yacht, e-scooter) |
| vehicles | sci-fi (hover bike, mech, shuttle, fighter, rover) |
| food | global (sushi platter, pasta, burger, dim sum, paella) |
| tech | gadgets (vintage camera, hologram, AR glasses, retro radio, drone) |

8 neue × 5 = **+40**
≈ **+60 gesamt**

---

## Gesamt

| Achse | Vorher | Neu | Nachher |
|---|---:|---:|---:|
| Cast | 78 | +120 | 198 |
| Locations | 42 | +60 | 102 |
| Buildings | 60 | +60 | 120 |
| Props | 60 | +60 | 120 |
| **Total** | **240** | **+300** | **540** |

**Kosten:** 300 × ~€0.04 (Gemini Image) ≈ **€12** einmalig
**Laufzeit:** ~25–30 Min über vier `seed-world-catalog` Polling-Runs

---

## Technische Umsetzung

1. `supabase/functions/_shared/world-themes.ts` — neue Sub-Packs eintragen, bestehende Pack-Slot-Zahlen 6 → 8 erhöhen, Cast-Slot-Limit auf 8 setzen.
2. `seed-world-catalog/index.ts` — keine Schema-Änderung nötig (idempotent über `slug`-Skip), nur die neue Theme-Liste verarbeiten.
3. Vier parallele Seeder-Runs (location / building / prop / character) bis `done:true`.
4. Hook/UI: keine Code-Änderungen — `useWorldCatalog` + `CatalogBrowser` zeigen die neuen Theme-Pills automatisch.

## Out of Scope
- Catalog-Variants (Posen/Outfits) — nur für gespeicherte Brand Characters.
- Voice-Matching für neue Cast-Rows.
- Übersetzte Labels (bleiben EN für Prompt-Konsistenz).

---

## Bestätigung

Soll ich genau so umsetzen, oder bestimmte Bereiche stärker/schwächer gewichten (z. B. mehr Cast statt Props, oder Anime/Bollywood streichen)?
