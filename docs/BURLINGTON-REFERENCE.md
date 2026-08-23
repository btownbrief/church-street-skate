# Burlington Reference — Church Street Skate

**Purpose.** Ground truth for building downtown Burlington, Vermont in 3D. Written for someone who has never been there. Another agent is supplying OpenStreetMap geometry and elevation; this document supplies *visual identity* — materials, colors, storeys, signage, what is on which corner, what the light and the crowd look like.

**Confidence markers.** Every substantive claim is tagged:
- `[verified: source]` — confirmed in a named source (local Btown Brief data, a photo I examined, or a cited web source).
- `[likely]` — strongly implied by evidence but not stated outright.
- `[unsure]` — a guess, a conflict between sources, or something a builder should check before spending time on it.

**Photo evidence.** Twelve-plus reference photographs live in `~/btownbrief/church-street-runner/` (repo root). I opened and described them; where I write `[verified: photo]` I mean I looked at one of those images. **These are reference only — no photo, texture, or logo from them goes into the game.** See §8.

**Currency.** Local data is from Stephen's own Btown Brief datasets, most regenerated between 2026-07-10 and 2026-08-02. Web sources run through August 2026.

---

## 1. Orientation & geography

### The spine
Church Street runs **north–south**. The pedestrian mall — the **Church Street Marketplace** — is the **four blocks between Pearl Street (north) and Main Street (south)**. [verified: Wikipedia, Church Street Marketplace]

Cross streets, north to south:

| # | Cross street | What's there |
|---|---|---|
| — | **Pearl St** | North end. Unitarian Church directly on axis, on the north side of Pearl. |
| 1 | **Cherry St** | Hotels, transit, the north edge of the old mall block. |
| 2 | **Bank St** | Restaurant row; Burlington Square's new tower fronts here. |
| 3 | **College St** | Leunig's corner; City Hall Park's north edge. |
| — | **Main St** | South end. City Hall closes the axis. The Flynn is a block east. |

Block names used throughout this doc:
- **Block 1 — Pearl → Cherry** (locals say "the top block")
- **Block 2 — Cherry → Bank**
- **Block 3 — Bank → College**
- **Block 4 — College → Main** (the City Hall block)

### The axis — the single most important fact
Standing anywhere on Church Street and looking **north**, the **white spire of the Unitarian Church closes the view**. Looking **south**, **City Hall closes the view**. The street was laid out to do this and it is how Burlingtonians orient themselves — *"the state's own historic district file says the church provides a focal point for the area, and that directions in Burlington are frequently given in relation to it."* [verified: Btown Out Loud, `out-loud/stories.json`, pin `unitarian-church`, fact-checked from the VT Division for Historic Preservation Head of Church Street Historic District file]

If the player can see both terminations from mid-street, the level reads as Burlington. If they can't, it doesn't.

### Address numbering (important, and easy to get backwards)
- **Numbers start at 1–2 at the Pearl Street (north) end and increase going south.** 2 Church St is at Pearl; 156 Church St is near Main. [verified: cross-referencing addresses against coordinates in `btown-brief/data/small-bites.json`]
- **ODD numbers = WEST side. EVEN numbers = EAST side.** This is city ordinance, not a guess: *"In all streets running north and south, the numbering shall commence at the end nearest Pearl Street… The odd numbers shall be on the WEST side and the even numbers on the EAST side."* [verified: City of Burlington, burlingtonvt.gov/1013/Authority-Duties] Independently confirmed by plotting 19 Church Street businesses' coordinates: every odd address sits at longitude ≈ −73.2128 to −73.2130 (west of centerline), every even address at ≈ −73.2123 to −73.2126 (east). [verified: computed from `btown-brief/data/small-bites.json`]
- Sanity check: City Hall = **149** Church (odd → west, and it is indeed on the park block). BCA Firehouse = **135** Church (odd → west). Ben & Jerry's = **36** Church (even → east). Richardson Place = **2** Church (even → east; the audio-tour script independently says "on the east side"). [verified: `small-bites.json` + Btown Out Loud]

Block boundaries by house number:

| Block | Cross streets | West (odd) | East (even) |
|---|---|---|---|
| 1 "Top Block" | Pearl → Cherry | 1–37 | 2–36 |
| 2 | Cherry → Bank | 39–79 | 38–78 |
| 3 | Bank → College | 81–115 | 80–116 |
| 4 "City Hall Block" | College → Main | 117–149 | 118–156 |

[verified: derived from three UVM Historic Preservation block surveys (uvm.edu/~hp206) plus the Howard Opera House parcel record; independently consistent with the coordinate plot]

### Dimensions
- **Total mall length, Main → Pearl: ~1,643 ft over four blocks — about 410 ft per block.** [verified: OSM geometry]
- **Width of the brick pedestrian corridor: ~80 ft at the Bank Street intersection, ~65 ft at College Street.** Typical building-face to building-face on a mid-block stretch scales to roughly **54–60 ft**. [verified: Dubois & King / CCRPC, *Church Street Marketplace Pedestrian & Streetscape Assessment*, 2 June 2017 — hereafter **D&K 2017**; mid-block figure is [likely], measured off the survey sheets]
- **Grid rotation:** Church Street bears **357.4°** — 2.6° west of true north. Cross streets bear **87.2°–87.6°**. The whole downtown grid is rotated ~3° counterclockwise from true north–south. [verified: measured from OSM] For a game, treat Church Street as north–south and don't worry about it, but the rotation is why afternoon sun rakes the street the way it does.

### Topography — the slope is a gameplay gift
**Church Street climbs steadily northward.** Surveyed spot elevations (NAVD 88):

| Intersection | Elevation |
|---|---|
| Church & **Pearl** | **228 ft** |
| Church & **Cherry** | 223 ft |
| Church & **Bank** | 218–219 ft |
| Church & **College** | 208–210 ft |
| Church & **Main** | **196–199 ft** |

[verified: D&K 2017 survey contours + Great Streets BTV Ch.2 + USGS 3DEP]

- **The Marketplace drops ~32 ft over its four blocks going south — a steady ~2% grade.** *"Church Street gently rises toward the white-steepled 1816 Unitarian church at its top."* [verified: American Planning Association, Great Places in America]
- **Skating the mall north→south (church → City Hall) is downhill the entire way.** That is free level design. The steepest single block is **Bank → College (~9–10 ft over ~410 ft, ~2.4%)**.
- **The east–west cross streets fall much harder toward the lake.** Computed from USGS 10 m DEM against measured distances [verified by calculation, ±0.5%]:
  - **Main St, Church → Battery: 1,613 ft, 70 ft of drop, 4.3% average.** Steepest block **St Paul → Pine at 5.4%**.
  - **College St, Church → Battery: 1,600 ft, 71 ft of drop, 4.4% average.** Steepest blocks **S Champlain → Battery 7.2%** and **Battery → Union Station/ECHO 7.8%**.
  - **College Street is the marquee bomb hill**: ~1,600 ft, 71 ft, and it gets steeper as it goes, finishing 20 ft above the water at ECHO and the ferry dock.
- **Lake Champlain surface averages 95.5–96.5 ft ASL.** Church & Main (196 ft) sits **~100 ft above the lake**; Battery Park (211 ft) sits ~115 ft above it. [verified: Lake Champlain Committee water-level study]
- **There is no grand staircase down to the waterfront.** OSM shows only short unnamed step flights near Battery/King, Battery/College and Battery/Main. A Cherry/Battery pedestrian connection has been "contemplated" but not built. **The streets themselves are the descent.** [verified: Great Streets BTV Ch.2; OSM]

### The view west
Looking **west** down College Street or Main Street you see **Lake Champlain and, across ~10 miles of water, the Adirondack Mountains of New York**. Great Streets sheets record the views explicitly: Battery St — *"one can catch a glimpse of Lake Champlain and Adirondacks"*; Pearl St — *"To Battery Park and Adirondacks"*; College St — *"Lake and mountains to the west, Old Mill [UVM] to the east."* [verified: Great Streets BTV Ch.2]
- **Whiteface Mountain (4,867 ft)** is the reliably identifiable Adirondack peak from Burlington. The peak directly across from the waterfront is **Trembleau Mountain**, a low lakeshore ridge. [verified]
- **The Green Mountains are EAST** — **Mount Mansfield (4,393 ft, Vermont's high point)** and **Camel's Hump (4,083 ft)**. From downtown street level they are mostly blocked by the hill east of Winooski Ave; you see them looking back from the Main Street/UVM climb. [likely] **Do not put mountains at the west end of the street and call them the Greens.**
- *"Spring and fall sunsets align with the cross streets,"* framing the lake and the Adirondacks. [verified: American Planning Association]
- Sunsets over the Adirondacks are a civic ritual — "locals check the sky around 7, then walk down." [verified: `guides.json`] For a game: **warm low sun straight down the cross streets in the evening**, long shadows raking across the north–south mall.

### Which streets carry cars
- **Church Street between Pearl and Main: pedestrian only.** No cars. Buses cross it but do not drive along it. **Church Street does not continue north of Pearl** — it dead-ends at the Unitarian Church. Only the blocks south of Main are a normal street. [verified: OSM; Wikipedia]
- **Every cross street carries traffic** and crosses the mall at grade: Pearl, Cherry, Bank, College, Main. **Removable bollards** block each crossing.
  - **The bollards come out at 7:00 a.m.** so delivery and repair vehicles can drive onto the bricks; **the street is closed to vehicles again by mid-morning.** A great daily-cycle detail. [verified: Seven Days, *We Spent 24 Hours on Church Street*, June 2026 — hereafter **Seven Days 24-Hours**]
- Historical detail so you don't build the wrong thing: the mall was **not** built all at once. **Only the two center blocks (College–Cherry) closed on 7 July 1980**, opening 15 Sept 1981. **The top block (Cherry–Pearl) was not bricked until 1994.** **The City Hall block (College–Main) was not finished until 2005.** [verified: Btown Out Loud `church-street-marketplace`; churchstmarketplace.com/history]

### One-way streets — **the brief's premise was wrong**
**Downtown Burlington's core grid is essentially all TWO-WAY.** [verified: OpenStreetMap query run 2026-08-23; Great Streets BTV Ch.2 per-street sheets]

| Street | Direction | Lanes | ROW / roadway |
|---|---|---|---|
| **Main St** (US-2) | Two-way | 2 (3 at signals) | 99' / 38' |
| **College St** | Two-way | 2 (3 at Battery) | 66' / 35' |
| **Bank St** | Two-way | 2 | 66' / 35' |
| **Cherry St** | Two-way | 2 | 66' / 36' |
| **Pearl St** | Two-way, **bike lanes both sides** | 2 | 66' / 38' |
| **St Paul St** | Two-way | 2 (3 at Main) | 66' / 36' |
| **S Winooski Ave** | Two-way Pearl→Main | **4 lanes in a 40' roadway** | 66' |
| **Battery St** | Two-way; **4 lanes** Pearl→Main, 2 south of Main | | 99' |
| **Pine St** | Two-way | 2 | 66' |
| **S Champlain St** | **One-way NB** Main→College; **one-way SB** Main→Maple; two-way south of Maple | 1 | 66' |
| **Lake St** | Two-way, **20 mph**, 3 blocks, 1,584' | 2 | 49.5' |

Other genuine one-ways: **Center St** (one block Bank→Cherry, **northbound**), **S Union St** (northbound, Main→Pearl), S Winooski south of King (southbound), and the GMT transit-center service drives on St Paul between Cherry and Pearl (a one-way pair).

Two corrections worth carrying: **Battery St is not US-7** (US-7 mainline is Willard St; **US-7 Alternate** is southbound-only via S Winooski → St Paul → Shelburne Rd).

### The Main Street rebuild — recent enough that most references are stale
The **Great Streets BTV Main Street reconstruction ran 5 Feb 2024 → a completion block party in July 2026**, ~$30M [likely]. Three blocks fully reconstructed **Pine St → S Winooski Ave**, mill-and-overlay east to S Willard. It included relocating the **buried 19th-century ravine sewer** — the same ravine Church Street originally detoured around — from Main to Maple Street.

What Main Street now has: **a protected bike lane with a buffer, an 8-ft tree belt, diagonal parking converted to parallel, wider sidewalks, rain gardens and pervious paver belts, new lighting, and four permanent public sculptures** including Nancy Winship Milliken's **48-ft "Lakebone."** The design goal was to shift from 50–75% of the right-of-way given to cars down to **60% non-vehicular**. [verified: greatstreetsbtv.com; Vermont Business Magazine 2026-07-12; WCAX 2026-07-17]

**Great Streets materials palette** (applies to Main and to any street rebuilt to standard — *not* to Church Street, which keeps its own "Church Street Brick") [verified: Great Streets Ch.7]:
- 6" granite curb
- **8-ft permeable clay brick paver parking lane with a 6" concrete band** on the travel-lane side
- tree-belt pavers: **Techo Block "Victorien: Shale Grey,"** 4"×8"×3" precast concrete
- **concrete sidewalks scored in a 3'×4' running-bond pattern**; 4'×4' tree cutouts
- lighting: **5" straight steel pole, 4-ft straight arm, Philips Renaissance teardrop luminaire with skirt, 18-ft mounting height, 3000K, powder-coat "River Texture Black,"** banner arms at 8 ft

Other bike infrastructure: **Pearl St has bike lanes both directions; Pine St and College St carry sharrows; Cherry St is a shared right-of-way.** Protected lanes on Battery and S Winooski are proposed, not built. The **Burlington Greenway** is ~8 mi of paved lakeshore path at 104–113 ft ASL. [verified: Great Streets Ch.2]

---

## 2. Block-by-block storefronts

**Read the caveats first.**

1. **Do not reproduce real logos, wordmarks, brand colors or signage art.** This roster exists so the *rhythm* of the street is right — where the ice cream shop is, where the bookstore is, where the bar with the patio is — and so a local recognizes the sequence. Names below are for placement and homage, not for reproduction. Give shops invented names in the same register.
2. **The list is a snapshot, roughly August 2026.** Church Street turns over fast. Where local Btown Brief data and web research disagree, both readings are given.
3. **Build the vacancies.** As of April 2026, Pomerleau Real Estate counted **12 empty storefronts** on Church Street and immediately intersecting streets — *"Church Street is suffering the worst blight with 12 empty storefronts."* Seven Days independently counted "about a dozen" in June 2026. The formal vacancy rate was **7.7% in July 2026** (20-year average 6.7%; it was 9.7% in Dec 2025). [verified: Vermont Business Magazine 2026-04-19; Seven Days June 2026; VTDigger 2026-07-07] **A Church Street with zero empty storefronts is not the real Church Street. Put 2–4 papered-over windows in.**
4. **Context for why:** the **Main Street reconstruction** (Great Streets BTV, Feb 2024 → summer 2026) hammered downtown foot traffic. 100+ businesses signed an open letter to the mayor in May 2025. Outdoor Gear Exchange reported foot traffic down 40%; Honey Road reported diners down 20%. [verified: Seven Days May 2025; Vermont Business Magazine Sept 2025]

### Block 1 — Pearl → Cherry ("the Top Block")
*Bricked in 1994. Framed at the head by the Masonic Temple (west) and Richardson Place (east). Retail-heavy, fewer patios, the best view of the church, and the Big Joe Burrell statue.*

**WEST side (odd, 1–37):**

| # | Tenant | Notes |
|---|---|---|
| 3–5 | **Masonic Temple** | 1898. Five storeys of rough grey stone, slate pyramid roof, arched storefronts. See §3.5. [verified: UVM HP206] |
| 11 | Brandy Melville | Opened May 2025 in the former Black Diamond Equipment space. [verified: Seven Days] |
| 21 | Tina's Home Design | |
| 21/23 | Underground Closet | vintage/consignment; address ambiguous [unsure] |
| 25 | **Urban Outfitters** | Open. [verified: churchstmarketplace.com] |
| 29 | Burlington Paint & Sip | |
| 31 | **Lululemon** | Open. |
| 35 | **CVS** | Pharmacy. |
| 37 | **Outdoor Gear Exchange (Gear X)** | Corner of Cherry. Occupies the **former Old Navy** space (Old Navy left ~2011). **A 206-ft mural of Vermont's four seasons by Jess Graham runs along its Cherry Street side wall** — a big, cheap, very recognizable surface. [verified: burlingtoncityarts.org] |

**EAST side (even, 2–36):**

| # | Tenant | Notes |
|---|---|---|
| 2 | **Richardson Building / "Abernethy's"** | 1895 Chateauesque, conical turrets. See §3.6. Multi-tenant: Kru Coffee, Top of the Block Sandwich Shoppe, Origins Massage, Vermont Community Acupuncture, Safe and Sound Gallery. **Danform Shoes closed here.** [verified: NRHP; `small-bites.json`] |
| 10 | E.B. Strong's Prime Steakhouse | [verified: `restaurants.json`] |
| 14 | **Crow Bookshop** | Used and new books, creaky floors. On Church St since 1995. [verified: `things.json`] |
| 16 | **Halvorson's Upstreet Café** | **The Big Joe Burrell statue stands on the brick right in front of it.** Black storefront band with gold "HALVORSON'S" lettering, projecting white blade sign, glass-and-white-metal canopy over the patio, dark red brick bulkhead under the windows. [verified: photo 15] |
| 28 | Bickford USA; Smugglers' Notch Distillery | |
| 30 | Posh Nails; Statements Hair Design | **This was Apple Mountain — now closed.** Partly vacant. [verified] |
| 32 | Public Vintage; Wild Lark; Fear and Cloathing | |
| 34 | Daydream Art Supply (2nd fl); Silver Threads Tailoring | |
| 36 | **Ben & Jerry's Scoop Shop** | **Northeast corner of Church & Cherry.** Two-storey **tan/buff brick** with **black window frames**, a **white awning band**, a black sign band with the wordmark, and beneath it a **turquoise band reading "PEACE, LOVE & ICE CREAM."** Out front: **three reclaimed-wood planter boxes on casters, planks painted white / sage / teal / bare wood**, planted with ornamental grasses and flowers. [verified: photo 23 — one of the clearest storefront references available] |
| 42 | *(vacant / pending)* | **Black Cap Coffee & Bakery closed here end of Dec 2025**; **PopUp Bagels** announced May 2026 for this space, **no opening date confirmed**. Good candidate for a papered window. [verified: `openings.json` 2026-08-02] |

### Block 2 — Cherry → Bank

**WEST side (odd, 39–79) — dominated by the Burlington Square construction block:**

| # | Tenant | Notes |
|---|---|---|
| 49 | **Burlington Square** (ex-CityPlace / ex-Burlington Town Center / ex-Burlington Square Mall) | The whole block behind. **South tower built and open (11 storeys, ~140 ft, Vermont's tallest), fronting Bank St. North tower still an active construction site behind fencing.** See §3.11. [verified: multiple] |
| 57–63 | Zinnia · Hatley Boutique · Bertha Church Intimate Apparel · Pepper Palace | |
| 65 | **Lake Champlain Chocolates** store & café | Open. Their A-frame ice-cream sign appears in street photos. [verified: photo 20; `small-bites.json`] |
| 71 | **Ken's Pizza and Pub** | Open. [verified: `small-bites.json`] |
| 75 | Catamount Tobacco and Convenience | |

**EAST side (even, 38–78):**

| # | Tenant | Notes |
|---|---|---|
| 38–44 | **Payn's Block.** 38 = Whizbangs Candy Lab | 38 is the **former Dear Lucy** shoe boutique — an 18-year fixture that **closed end of Jan 2026**, its owner saying retail and downtown had changed. Brick storefront at the Cherry corner. [verified: `openings.json`; Seven Days] |
| 40 | PokeWorks | [verified: `small-bites.json`] |
| 46–50 | **Nelson's Block.** 46 = Catamount Store | |
| 52–54 | **Montgomery Ward Building**, 1929, Classical Revival | **Two storeys: brick ground floor, second storey in concrete finished to imitate stone.** 52 = **Homeport** (housewares; this is the old **Pier 1 Imports** address). Homeport opened a second store at the Essex Experience 1 Aug 2026 — **the Church St flagship stays**, and 2026 is its 20th anniversary. [verified: UVM HP206 Rizer; `openings.json`] |
| 56 | Banana Republic; Bernique's Boutique | |
| 60–78 | **former Stetson's Row**: 62 Whim Boutique · 66 Helly Hansen · 70 **Flora & Fauna** · 72 Vermont Flannel Company · 74 Vermont Teddy Bear · 78 Karlise Fine Jewelers | Flora & Fauna is "downtown's oddest and best gift shop — taxidermy-adjacent curiosities, plants." [verified: `things.json`] |

### Block 3 — Bank → College

**WEST side (odd, 81–115) — the Howard Opera House occupies most of it:**

| # | Tenant | Notes |
|---|---|---|
| 81–93 | **Howard Opera House**, 1878–79 (also addressed 159 Bank St) | The whole north end of the block face. **Five large round-arched bays on the Church Street face, each ~three windows wide, separated by brick pilasters, under a battlemented galvanized-iron cornice.** See §3.7. [verified: UVM HP206 Socinski; VHS *Proceedings*] |
| 81 | Ecco Clothes | Open. |
| 83 | **Pascolo Ristorante** | **Moved BACK here 2 Jan 2026** from 120 Church, into its original **subterranean** space — same menu, same staff. Before that, **Riko's Pizza** occupied 83 Church for eight months and closed Aug 2025. [verified: `openings.json` 2026-08-02] |
| 85 | **Frog Hollow Vermont Craft Gallery** | Juried Vermont craft — ceramics, fiber, glass, jewelry. **Green-painted storefront reading "crafted in vermont."** [verified: photo 12; `things.json`] |
| 87 | Golden Hour Gift Co | |
| 89 | **Phoenix Books Burlington** | **MOVED here 16 Aug 2024 from 191 Bank St** into the former Slate space. Retail ground floor, offices and a black-box theatre upstairs. **191 Bank St is the wrong address — do not use it.** [verified: Seven Days; phoenixbooks.biz] |
| 93 | **Burlington Bagel Bakery** | The old **Bruegger's Bagels** address (Bruegger's left Dec 2017). Plus a Cafe Istanbul cart. |
| 97–101 | Garcia's Tobacco Shop · Little Istanbul · 4T2D | |
| 103 | **Church Street Tavern** | Open, reopened under new owners. [verified: `small-bites.json`] |
| 107–113 | The Optical Center · Danforth Pewter · Vermont Gem Lab · Yoga Vermont (3rd fl) | |
| 115 | **Leunig's Bistro & Café** | **Northwest corner of Church & College.** Facade is a surprise and worth getting right: **Art Deco / Streamline Moderne — cream-colored enameled steel panels with thin brown line detailing, square windows framed in glass block, and a parapet carrying "Leunig's" in brown lettering.** Four storeys on Church, three on College. Sidewalk café seating out on the brick. [verified: UVM HP206 Socinski] **The awning color could not be verified** — the widely repeated "red awning" is [unsure]; do not stake anything on it. |

**EAST side (even, 80–116):**

| # | Tenant | Notes |
|---|---|---|
| 80–82 | **Fisher Block** (1865). **80 Church is VACANT** | **Nostalgia Toys & More closed 5 July 2026** after seven months — "rent, staffing, and theft made it unsustainable." Before that, Weenies Hot Dogs (Nov 2024–Sept 2025). **Build this one as an empty storefront.** [verified: `openings.json`; Seven Days] |
| 84 | Insomnia Cookies | Mid-1860s Italianate building. [verified: `small-bites.json`] |
| 86 | **Saratoga Olive Oil Co.** | **Black awning with a round emblem, white lettering.** [verified: photo 21] |
| 88 | **Asiana Noodle Shop** | Weller Block, 1889. Hanging blade sign. [verified: photo 05; `small-bites.json`] |
| 90 | **Free People** | **White-painted brick storefront with black window frames and big warm-lit gold windows** — the brightest shopfront on the block. [verified: photo 21] |
| 92 | Cappadocia Bistro | |
| 96 | Harbour Thread | Warner Block, 1886. |
| 98 | FP Movement | |
| 100 | SoulShine Power Yoga (3rd fl) | Isham Block, 1894. |
| 102 | **Kiss the Cook** | Seymour's Building. Open. |
| 104 | **Artemus Café & Burlington Art Mini Museum** | Narrow storefront, opened ~mid-Aug 2026. Was **Cosmic Grind** (closed fall 2025), and before that **Speeder & Earl's**. Wingate Block, early 1850s. **Conflict:** Stephen's `small-bites.json` (2026-08-02) still lists Cosmic Grind here. [unsure — treat as a café either way] |
| 106 | Amberli | **FatFace closed here Aug 2025.** |
| 110 | Tradewinds Imports | Building erected 1970 by Antonio Pomerleau — a modern intrusion in a Victorian block. |
| 112 | **Lippa's Estate & Fine Jewelry — CLOSING ~Aug 2026** | Moving to Colchester after 93 years. Mid-century-modern building. **Treat as vacant or imminently vacant.** [verified: Seven Days] |
| 114/116 | **Former Howard National Bank Building**; 116 = Northfield Savings Bank | This is the **white marble** bank block described in §3.8. |

### Block 4 — College → Main ("the City Hall block")
*Pedestrianized only in 2005 — the newest-feeling block.*

**WEST side (odd, 117–149):**

| # | Tenant | Notes |
|---|---|---|
| 117 | MK Clothing | |
| 123 | **Ri Rá Irish Pub** | In the **former Merchants Bank, 1931** (Harper & West of Boston). The renovation **kept the detailed marble façade** — another pale stone punctuation in the brick. [verified: rira.com/burlington; `small-bites.json`] |
| 131 | Von Bargen's Fine Diamonds & Jewelry | |
| 135 | **BCA Center — the Ethan Allen Firehouse** | See §3.4. The best building on the street. |
| 149 | **Burlington City Hall / Contois Auditorium** | See §3.2. |

**EAST side (even, 118–156):**

| # | Tenant | Notes |
|---|---|---|
| 120 | **Sweetwaters** | **Southeast corner of Church & College.** In the original **1880s Burlington Trust Company bank building** — retains original mouldings, cornerstone and **a clock**. **Large first-come first-served patio** out on the brick. **REOPENED 23 April 2026 after a four-year absence** (closed 2022; Pascolo occupied the space 2023–Dec 2025). Chef Jessee Lawyer co-owns. This is a fresh, very locally legible change. [verified: WCAX 2026-04-23; `restaurants.json`] |
| 126 | Global Pathways | |
| 128 | **Maven** | **The skate shop — on the Marketplace itself.** Its people led the decade-long campaign that built the A_Dog skatepark. A skate shop sitting on a mall where skating is legally a trespass. See §6.5. [verified: churchstmarketplace.com] |
| 130 | Country Roads Jamaican Flair; Dreamlike Pictures | |
| 132 | True 802 Cannabis | Dispensary. Cannabis retail is legal and visible downtown — worth including as texture. |
| 134 | Akes' Place | |
| 136 | **Red Square** | **Yes, it is on Church Street** — directly across from City Hall. Three bars, two music rooms, **large outdoor patio**. Live music nearly every night; "the reliable answer to 'where's something happening right now.'" [verified: churchstmarketplace.com; `things.json`] |
| 136½ | Float On Dispensary | |
| 144 | Gaku Ramen | [verified: `small-bites.json`] |
| 146–148 | Laliguras Indian Nepali Restaurant | [verified: `small-bites.json`] |
| 150 | The Altar | |
| 156 | **Honey Road** | Eastern Mediterranean mezze; James Beard–finalist chef Cara Tobin. "The fried halloumi has a citywide reputation." Hard to book. [verified: `things.json`, `restaurants.json`] |

### Carts and kiosks
- **A city-owned kiosk sits at the Church & College corner** (addressed 180 College St). **Sabah's House took it over in 2026**, replacing **Leunig's Petit Bijou**. [verified: Seven Days]
- Regular cart vendors: Church Street Cheesesteaks (City Hall block), A-Maize-ing Kettlekorn (173 College), Captain Tom's Tiki Bar (170 Bank), plus roving carts — Kona Beachside, The Cuban Kitchen, Trinidadian Cuisine, Micro Mobile Kitchen. [verified: agent research from Marketplace directory]
- Photo 22 shows a night food cart with a **Cuban flag painted on its side, wrapped in string lights, chalkboard menus in the window, an A-frame chalkboard beside it** — a perfect model for a generic cart. [verified: photo 22]

### Immediately off Church Street — worth building if the map extends a block

**Cherry St:** The Harborvale (25, hotel — see §3.12) · Hotel Vermont + Juniper (41) · Hen of the Wood (55, the state's benchmark farm-to-table) · Vivid Coffee (150) · Frankie's (169) · Marketplace Garage entrance (147). [verified: `small-bites.json`, `restaurants.json`]

**Bank St:** Burlington Square south tower + Jitters Cafe (130) · A Single Pebble (133, Chinese banquet in a rowhouse) · **Henry's Diner (155, serving Bank Street since the 1920s)** · Farmhouse Tap & Grill (160) · **Burl's Downtown Kitchenette (189) — a 1954 Oasis diner car turned into an all-day Southern diner, opened June 2026, replacing El Cortijo Taqueria after 15 years.** A real diner car is a great low-poly asset. [verified: `openings.json`, `small-bites.json`]

**College St:** Vermont Pub & Brewery (144, at St Paul — Vermont's original brewpub, 1988) · Onyx Tonics (126) · Deli 126 (126 #40, renamed "The 126" but nobody calls it that) · Sherpa Kitchen (119) · The Archives (191, arcade bar) · Burlington Records (194) · Zabby & Elf's Stone Soup (211) · **Partizanfilm (230) — a member-run nonprofit micro-cinema, two screening rooms of 31 and 19 seats plus a café-bookstore lobby, opened Dec 2025 in the void the Roxy left** · Fletcher Free Library (235, Carnegie, columns and stone steps — good skate geometry). [verified: `small-bites.json`, `openings.json`, `things.json`]

**St Paul St:** GMT Downtown Transit Center (101) · The Friendly Toast (86) · **American Flatbread / Burlington Hearth (115)** — its house brewery **rebranded from Zero Gravity to Mothership Brewery in Jan 2026** · Trattoria Delia (152) · Pizzeria Verità (156) · Shy Guy Gelato (198). **Note: "Drink," the cocktail bar across from City Hall Park on St Paul, closed January 2026 after 27 years.** [verified: `openings.json`]

**Main St:** Vermont Comedy Club (101) · **Flynn Center (153)** · Kountry Kart Deli (155) · Ruben James (159) · Ahli Baba's Kabob Shop (163, open to 3 a.m. weekends) · Muddy Waters (184, "all wood, plants, and low light — a Main Street coffee cave that hasn't changed in decades"). [verified: `things.json`, `small-bites.json`]

### Dead landmarks — do NOT put these in the game
These are the traps. Each one is something a builder would confidently add and each one is gone.

| Thing | Status |
|---|---|
| **Nectar's + Club Metronome, 188 Main St** | **CLOSED 30 July 2025 after ~50 years.** The club that gave Phish its start played its final set; construction, changing nightlife and failed lease talks ended it. The building is a brick block **with a marquee that went dark in May 2025**. Listed for lease, no confirmed tenant. **This is the biggest landmark loss downtown and the most likely mistake.** [verified: `openings.json`, Btown Out Loud `nectars`, Seven Days] |
| **Manhattan Pizza & Pub, Church & Main** | Closed 17 Jan 2025 by fire-marshal order over unpermitted work, weeks after reopening as "Manhattan's." **Sources conflict on the successor:** Stephen's data says *What Ales You* later claimed the space; web research says it was **renamed "Rincon Pizzeria and Tapas Bar"** in May 2025. [unsure — the corner is occupied by *something*, not by Manhattan Pizza] |
| **The Gryphon, Main St** | Closed Sept 2025 after 11 years, citing construction detours. Building sold in a 2026 bankruptcy sale; no tenant. [verified: `openings.json`] |
| **"Everyone Loves a Parade!" mural, Leahy Way** | **Removed August 2020.** See §3.15. |
| **Danform Shoes, 2 Church** | Closed. |
| **Apple Mountain, 30 Church** | Closed. |
| **Dear Lucy, 38 Church** | Closed Jan 2026. |
| **Black Cap Coffee, 42 Church** | Closed Dec 2025. |
| **Nostalgia Toys, 80 Church** | Closed July 2026. |
| **Old Navy (37), Pier 1 (52), Bruegger's (93), Macy's/L.L.Bean (mall block)** | All long gone; all refilled. |
| **Skinny Pancake** | **Has no Church Street location.** Waterfront only, 60 Lake St. It *began* as a Church St cart in 2003 — history, not a storefront. |
| **Sephora, Talbots, Jos. A. Bank, Sweet Clover Market** | No evidence any ever had a Church Street storefront. Do not include. |
| **Monarch & the Milkweed, Dedalus Wine, Maglianero, Bueno y Sano (College St)** | All closed or replaced. |
| **Memorial Auditorium, 250 Main** | Locked since 2016. Dark building, not a venue. |
| **Common Deer** | At **210 College St**, not 16 Church. |

---

## 3. Landmarks

Ranked roughly by how much they matter to recognition.

### 3.1 Unitarian Universalist Church (First Unitarian Universalist Society), 152 Pearl St
**The single most important object in the level.** It sits on the **north side of Pearl Street**, **facing south straight down Church Street**. The street is named for it. [verified: Btown Out Loud `unitarian-church`; UVM HP206 — "the front entrance, centered in the tower, looks down the street, which is named for the church"]

- Built **1816**, dedicated 9 Jan 1817. Architect **Peter Banner** of Boston (Charles Bulfinch may have amended the plan). **Federal style, Wren–Gibbs meeting-house type.** Oldest surviving place of worship in the city. [verified: Btown Out Loud, fact-checked]
- **Body: red brick, two storeys, gable roof, ~91 ft long × 60 ft wide.** The brick was fired in Burlington; the nails were hand-hammered. [verified: Wikipedia, *Northern Sentinel* Dec 1816, quoted; Btown Out Loud]
- **Trim: white painted wood** — cornices, quoin-like pilasters, window surrounds. Strong white-on-red contrast. [verified: photos 06, 08, 20, 24]
- **Front (south) elevation, from the ground up** [verified: photos 08, 20, 24]:
  1. A **white pedimented entrance porch / pavilion** at the base of the tower, one storey, with a **round-arched doorway**.
  2. Above it a tall **arched window** with white surround, set in the brick tower face.
  3. **A large round CLOCK — white face, black numerals and hands — set into the brick of the tower.** This is a signature. Do not omit it.
  4. **Square brick tower** rising past the roofline, capped by a white cornice.
  5. **White octagonal belfry** with open round-arched openings and a balustrade with urns.
  6. A smaller **white octagonal lantern** stage above that.
  7. A tall, slender **spire painted DARK GREEN**, topped by a weathervane. [verified: photos 08, 20 — the spire reads clearly green against the sky, not white; from a distance in low light it can look white/grey, as in photo 24]
- **Total height ~170 ft.** The tower is ~85 ft of it. [verified: Wikipedia / Btown Out Loud]
- **The spire you see is a 1958 replica.** Lightning took the original in Aug 1954; it was dismantled in 1956 and rebuilt by 1958. It therefore reads slightly crisper than the 1816 brick. [verified: Wikipedia]
- The first bell was cast by **Paul Revere's foundry, Oct 1816, ~1,286–1,300 lb**; cracked and recast 1828, replaced with a Meneely bell in 1928. **The bell still rings the hour.** [verified: Btown Out Loud; Wikipedia] — for audio design, church bells on the hour are correct.
- **Site:** the church stands slightly above the street on a modest terrace/lawn, with a small paved plaza and a **stone monument/obelisk** in front of it at the head of Church Street. [verified: photo 06 shows a low stone monument on the plaza; photos 08/20 show a raised terrace and steps]
- **[unsure]:** whether there is an iron fence, exactly how many steps, whether there is a columned portico (sources do not confirm free-standing columns — model a pedimented pavilion, not a temple front), and whether the Pearl/Church junction has any traffic island. Do not model a rotary.

### 3.2 Burlington City Hall, 149 Church St
**Closes the south end of the axis.** Occupies the **south end of the City Hall Park block**, at Church & Main. It presents proper facades **both to Church Street (east) and to City Hall Park (west)** — this dual orientation is documented and is why photos disagree about which is the "front." [verified: Wikipedia, City Hall Park Historic District; UVM HP206]

- Opened **12 May 1928**. Architect **William M. Kendall of McKim, Mead & White** — the firm that did the original Penn Station. Cost **$475,000**, $25,000 under budget. Neo-Classical / Georgian Revival. [verified: Btown Out Loud `city-hall-park`; `history-facts.json`]
- **"Nearly every finish material in that building was produced in Vermont"** — the red brick, the carved marble, the granite, the slate roof. That is the whole point of the building. [verified: Btown Out Loud, fact-checked]
- **Massing (from photo 03, a straight-on shot of the grand entrance):**
  - **Rusticated light-grey granite ground floor / basement storey**, with a plain recessed doorway at grade.
  - Above: **two storeys of red brick** divided by **giant white marble pilasters with Corinthian capitals** running the full height — roughly **nine bays wide**. Tall multi-pane double-hung sash windows with **white marble sills and flat lintels**.
  - A **white marble entablature and cornice** with dentils runs the full width; **slate roof** behind.
  - **Centerpiece:** a **round-arched entrance bay** — a semicircular **fanlight with radiating tracery** over a white classical door surround carrying **"CITY HALL"** in Roman capitals, flanked by columns, and above the arch a **carved marble cartouche with the city coat of arms and swag garlands**.
  - **A white wooden cupola** on the ridge: square base, louvered belfry, **a clock face**, and a small dome. The clock faces east and west and the bell rings the hours. [verified: photo 03; UVM HP206]
- **The stairs — a prime skate feature.** A **split double granite staircase** climbs from the plaza up to the second-floor entrance: two symmetric flights running outward and turning back inward to a **granite landing/balcony** in front of the door. **Black wrought-iron railings**, with ornate cast-iron panels and a decorative iron medallion in the balcony rail. Below and between the two flights, a **recessed ground-level door** with a small red-brick paving apron in front. Low **curved granite retaining walls** flank the whole composition. [verified: photo 03] The **western steps are 48 ft wide**. [verified: UVM HP206]
- **The bronzes.** Two **Frank Stout** bronze animals sit on **rough-hewn grey granite blocks** at the foot of the stairs, one on each side: a **deer** (left/north, mid-stride, head up, antlers) and a **mother bear with a cub climbing on her back** (right/south, on all fours, turning toward the viewer). Both have a **green verdigris patina**. [verified: photo 03, photo 10, photo 11]

### 3.3 City Hall Park
Occupies most of the block bounded by **Main St (S), St Paul St (W), College St (N), Church St (E)**. The **east edge of the block is lined with buildings** — City Hall at the south end, the BCA Firehouse further north — which separate the park from Church Street. So from Church Street you do *not* see the park directly; you walk past or between buildings into it. [verified: Wikipedia, City Hall Park Historic District]

- The land was **set aside in June 1798** by the town proprietors at the same meeting where William Coit presented the street grid downtown still runs on. It was **"Court House Square"** for its first century. [verified: Btown Out Loud `city-hall-park`, fact-checked]
- **Completely rebuilt and reopened 16 October 2020**, landscape architects **Wagner Hodgson**. What is there now: [verified: Great Streets BTV project page; Wagner Hodgson; Seven Days]
  - Wide accessible paths **radiating from the center**, meeting at a **central ellipse defined by a low granite sitting wall**.
  - **Paving is deliberately multi-material and multi-color: permeable brick pavers, tan concrete, and granite cobbles** — noticeably different from Church Street's uniform brick.
  - **The Antonia & Rita Pomerleau Fountain** — a **flush splash-pad jet fountain** set into the paving, offset from center, with **colored lights** and programmed sequences. It runs roughly 9:30 a.m.–10:30 p.m. in warm months and shuts off automatically in wind or rain. Kids run through it. It replaced a **1905 granite horse trough**.
  - A **granite seat wall along the southern edge**; roughly **twice as much seating as the old park**; long benches of **thermally modified ash** (warm honey-brown wood) along the paths.
  - **~48 trees.** Mature big-canopy trees kept along the west, south and north edges; **young trees set in metal grates in the hardscape.** The redesign is **more open and less shaded** than the old park — long sight lines.
  - An **open central lawn** for sitting, markets and gatherings; **flexible hardscape zones** for performances.
  - A **restroom structure**, a **trilevel drinking fountain** (lowest spout at dog height), a **food/beverage kiosk on the terrace west of the fountain**, and **terraced seating at the northeast corner**.
- **Movable teal/turquoise-green metal bistro chairs and tables** are scattered through the park. [verified: photo 19]
- **Overhead café string lights** are strung across the park's paved areas, and **triangular pennant bunting** appears for events. Portable low stages get set up for concerts (photo 19 shows a band under an **orange Otter Creek Brewing pop-up tent**). [verified: photos 19, 22]
- Food carts park along the park's edges at night, strung with lights. [verified: photo 22]
- **[unsure]:** no source confirms a permanent sculpture or a "blue tree" in the park. Do not model one.

### 3.4 BCA Center / the Firehouse, 135 Church St
**Church Street's best single building and the easiest to model memorably.** West side of Church Street, in Block 4 (College–Main), on the northeast corner of the City Hall Park block. Its **main facade faces east onto Church Street**; a second designed elevation faces the park behind. [verified: Wikipedia, Ethan Allen Engine Company No. 4]

From photos 09 and 18, which show it straight on:
- **Three storeys, red-orange brick**, narrow (roughly 2½ storefront widths), flat-fronted, flat roof.
- **Ground floor:** heavy **rough-faced brownstone/red-sandstone piers** (four of them) with squared bases and simple caps, framing **two former equipment bays** now glazed as **dark-framed glass storefronts with glass double doors**. An **antique fire engine painted orange** is displayed inside the left bay, visible from the street. **"135"** is carved/mounted on the left pier.
- **A carved brownstone belt course** above the bays reads **`· ETHAN · ALLEN · ENGINE · CO · NO · 4 ·`** in incised Roman capitals. This is the identifying detail.
- **Upper two floors: one huge round-arched central window flanked by two narrower round-arched windows**, a Palladian arrangement, all glazed with **dark teal-green painted metal mullions** in a fine grid. The arches are outlined in **radiating brick voussoirs**.
- **A corbelled brick cornice** with a dentil-like course and a projecting brick band under it.
- **The tower.** Set back behind the front wall, an **85-ft brick shaft** rising to a **grey slate-shingled belfry** with **open round-arched openings on each face, a bell visible inside**, and a **steep pyramidal slate roof**. It was built to **hang wet fire hose vertically to dry** — that is why it's a narrow shaft. The original bell went to the Shelburne Museum for decades and was **hoisted back into the tower in 2002**. [verified: Btown Out Loud `firehouse-gallery`, fact-checked; photo 09]
- **Yellow vertical fabric art banners** hang down the facade between the arched windows — BCA's exhibition banners. Color changes with the show. [verified: photos 09, 18]
- Built **1887–89**, architect **A. B. Fisher**, "a commercial variation of the Richardsonian Romanesque." Listed on the National Register 16 April 1971. Burlington Police occupied it until the late 1960s; BCA put a gallery in half the ground floor in 1995 and took the whole building in 2002. [verified: Btown Out Loud; Wikipedia]

### 3.5 Masonic Temple — head of Church Street, **west** corner at Pearl
One of the two heavy masonry buildings that **frame the view of the church**. [verified: Btown Out Loud `masonic-temple`, fact-checked]

- **Five storeys of rough grey stone** — "Willard's Ledge" stone with local brick. **Richardsonian Romanesque**: heavy masonry, round arches, **arched storefronts at ground level**. **It is the tallest building on the Marketplace** (excluding the new Burlington Square tower a block over). [verified: Btown Out Loud; Wikipedia, Masonic Temple (Burlington, Vermont)]
- **Roof: a steep slate pyramid over the corner, intersected part-way up on each side by a gable.** Very distinctive silhouette — in evening photos it reads as a large dark blue-grey mass on the left as you look north. [verified: Wikipedia; photo 06]
- **The Pearl Street (north) elevation has windows that climb the wall diagonally** — an internal staircase showing through the stone. A nice, specific, cheap detail. [verified: Btown Out Loud]
- Built **1897–98**, architect **John McArthur Harris** of Wilson Brothers & Co., Philadelphia, for ~$87,000, as the state headquarters of the Grand Lodge of Vermont. Retail was on the ground floor from day one. **No lodge meets there now** — the last Burlington lodge merged away in 2016. Every floor is retail and offices. [verified: Btown Out Loud, fact-checked]
- One of three buildings in the **Head of Church Street Historic District**, National Register, 15 July 1974 (with the church and the Richardson Building). [verified: Btown Out Loud]
- **Side note / conflict:** one web source placed it on the *northeast* corner. The odd-address rule (1–5 Church St), the audio-tour framing, and photo 06 all put it on the **WEST** side. Going with west. [likely]

### 3.6 Richardson Building / "Richardson Place" / **"Abernethy's"**, 2 Church St — head of Church Street, **east** corner
The other framing building. **Nobody who grew up in Burlington calls it the Richardson Building. They call it Abernethy's.** [verified: Btown Out Loud `richardson-building`, fact-checked]

- Built **1895** as the largest department store in Burlington. **Chateauesque** — one of very few in the city. Four-and-a-half storeys, **red brick**. [verified: Btown Out Loud; Church Street Marketplace historic tour]
- **Signature: round bays / turrets bulging out of the front, each capped by a shingled CONICAL roof with a finial.** Steep roofline punched with **dormers**. In photos the turret roofs read **green (weathered copper)**. [verified: Btown Out Loud; photos 08, 20]
- **Small iron balconies on the front with the letter "R" worked into the ironwork.** Abernethy's covered the R's with gold **A**'s; the R's came back in **1983**. A perfect low-poly detail. [verified: Btown Out Loud, fact-checked]
- Ground floor retail, upper floors residential/office. Currently home to **Kru Coffee** and **Top of the Block Sandwich Shop** among others. [verified: `small-bites.json` 2026-08-02]

### 3.7 Howard Opera House, 81–93 Church St — **southwest** corner of Church & Bank
*(also addressed 159 Bank St)*
- Built **1878–79** for **John Purple Howard**, architect **Stephen D. Hatch** of New York, ~$100,000. [verified: Vermont Historical Society, *Proceedings* Fall 1977; Btown Out Loud `howard-opera-house`]
- **Dimensions: 130 ft along Church Street × 76 ft along Bank Street × 60 ft high** — so roughly **four storeys and a big chunk of the block**. A **tower 28 × 30 ft** originally crowned the northwest corner. [verified: VHS *Proceedings*]
- **Pressed brick** with **Nova Scotia stone trim and colored Minton tiles**; **five large round Romanesque arched windows dominate the Church Street facade**; **battlemented galvanized-iron cornice**, and originally a **red-painted tin and copper roof**. Modern descriptions add "geometric and ornamental bands, **carved masks and instruments**" in the cornice. [verified: VHS *Proceedings*; Church Street Marketplace historic tour]
- Behind that wall, on the upper floors, was an auditorium seating **1,300–1,400**. Last performance **30 Nov 1904**; the space was carved up afterward. Retail below, offices above today. [verified: Btown Out Loud, fact-checked]
- **[unsure]:** whether the corner tower survives. No source confirms it does. Do not model a tall corner tower without checking a photo. Sources do **not** support a mansard roof.

### 3.8 The white marble bank on Church Street (~114–116 Church St, Block 4, east side)
Worth building because it **breaks the red-brick rhythm**.
- **Three to four storeys, faced entirely in WHITE MARBLE from the Vermont Marble Co. of Proctor** — a monumental pale block among red brick. **Grand arched entry on Church Street**, symmetrical facades, prominent cornices, sculptural Greek detail; a two-storey arched window inside looks west toward City Hall Park. Built for the Howard Bank / later Merchants Bank; 1942 expansion. [verified: UVM HP206 Telesca]
- A pale rusticated classical bank facade is clearly visible on the east side in photo 14 (night). [verified: photo 14]

### 3.9 Burlington Savings Bank (1900), corner of College & St Paul — NW corner of the City Hall Park block
- Architect **Walter Willcox**. Renaissance/Flemish Revival — **brick and brownstone**, prominent **wall dormers**, a **corner tower with a conical roof**, and a **recessed corner entrance framed by free-standing Ionic columns under a brownstone segmental arch**. Now **Citizens Bank**. Called the most architecturally distinguished building around the park. [verified: Wikipedia, City Hall Park Historic District; Buildings of New England]

### 3.10 The Flynn, 153 Main St
One block **east** of Church & Main, on the **north side of Main Street**, facade pushed right up to the sidewalk. [verified: Btown Out Loud `the-flynn`]
- Opened **26 November 1930** — into the first winter of the Great Depression — as a $500,000 vaudeville-and-movie palace. Architects **William Luther Mowll and Roger Glade Rand**. **Art Deco.** 1,400+ seats. Recognized by the Art Deco Societies of America as one of the ten most important Art Deco restoration projects in the country. [verified: Btown Out Loud, fact-checked; Flynn history page]
- **Facade: asymmetric BRICK with MARBLE trim.** **Shallowly fluted Art Deco pilasters with stylized floral capitals**, a **belt course** between the two floors, and a **stepped parapet with an inset panel carrying the name "FLYNN."** [verified: SAH Archipedia VT-01-CH29]
- **The marquee is the thing.** Original **sheet-metal marquee** projecting over the sidewalk, with **rear-lit attraction boards** on its faces, surmounted by **"FLYNN" in framed neon channel letters**, and edged with **multicolor incandescent chaser lights**. [verified: SAH Archipedia]
- Brick color not documented — [unsure] whether red, buff or tan.

### 3.11 Burlington Square (the former mall block) — Cherry / Bank / Church / St Paul
**This is the biggest thing a builder will get wrong, because the internet is full of stale information.** Current state as of 2026:

- History in one line: **Burlington Square Mall (1976) → Burlington Town Center → CityPlace Burlington → "Burlington Square" again (renamed June 2025).** Anchored originally by Porteous; Filene's/Macy's from 1999; L.L.Bean from 2014. [verified: Btown Out Loud `cityplace-burlington-town-center`, fact-checked; Wikipedia CityPlace Burlington]
- **Demolition began December 2017 and then stopped. For roughly four years the middle of downtown Burlington was an open excavation. Locals called it "the pit."** Not affectionately. The last surviving mall businesses closed in early 2022. [verified: Btown Out Loud]
- **SOUTH BUILDING: BUILT AND OPEN.** Opened **September 2025**. **11 storeys, 140 ft — now the tallest building in Vermont.** It **fronts Bank Street**. Program: ~12,000 sq ft ground-floor retail (a restaurant plus **Jitters Cafe & Lounge**, 130 Bank St), an **AC Hotel by Marriott, 161 rooms** (lobby/bar on floor 2, rooms floors 3–7), and **53 apartments on floors 8–11, each with a balcony or terrace**. LEED Gold. [verified: Vermont Public 2025-09-25; `openings.json` 2026-08-02; `small-bites.json`]
- **NORTH BUILDING: STILL A CONSTRUCTION SITE.** ~364 units (73 of them meant to be affordable), a second hotel, 25,000+ sq ft retail, structured parking; touches **Church, Cherry and St Paul**. Steel frame stage in early 2026, new delays announced April 2026, completion now aimed at **late 2027 / early 2028**. In May 2026 the city council unanimously pushed the affordable-unit deadline to end of 2027; **as of August 2026 none had been built.** [verified: Btown Out Loud, updated Aug 2026; WCAX 2026-03-06 and 2026-04-28]
- **Pine and St Paul Streets have NOT been reconnected through the block.** The grid is still broken there. [verified: Vermont Public; City of Burlington press release]
- **For the game:** the west side of Church Street between **Cherry and Bank** is the back of this block. Model **an active construction site** — hoarding/fence, crane, tower crane base, steel frame, concrete trucks, jersey barriers, a covered pedestrian walkway — plus, at the **Bank Street end, one finished modern 11-storey tower** that towers over everything else downtown. That contrast (Vermont's tallest building next to a hole in the ground) is *exactly* what downtown Burlington looks like right now, and no other city looks like that.
- **[unsure]:** the tower's facade material and color are not documented in any text source I could reach. A contemporary light-panel-and-glass tower over a masonry-toned podium is a defensible guess but unverified.

### 3.12 Hotels on Cherry Street
- **The Harborvale, 25 Cherry St.** *Formerly the Courtyard by Marriott Burlington Harbor* — **reopened 7 July 2026** as a **161-room Autograph Collection hotel** run by the Hotel Vermont team, with a Lake Champlain–focused restaurant from chef Doug Paine. **Do not label this building "Courtyard by Marriott."** Physically: **9 storeys, brick and traditional materials** chosen to sit next to historic neighbors, paired with a 9-storey 32-unit condo and a 221-car garage as one mixed-use mass. Architect TruexCullins. [verified: `openings.json` 2026-08-02; Vermont Business Magazine; TruexCullins]
- **Hotel Vermont, 41 Cherry St.** Independent, ~124 rooms, opened 2013, LEED-certified. **Contemporary facade mixing brick and glass**, irregular massing squeezed onto a tight infill lot only ~45 ft deep over most of its frontage, wrapped around a parking garage. Restaurant: **Juniper**. [verified: `small-bites.json`; Smith Buckley Architects] Storey count [unsure], likely 6–7.
- Note both hotels are on Cherry Street, one block apart, on the same side of downtown.

### 3.13 Parking garages
- **Marketplace Garage** — entrances at **147 Cherry St** and on **Bank St** (also addressed 47 S. Winooski Ave). Sits **directly behind the east-side Church Street storefronts**. Gateless, ParkMobile-only, first two hours free. [verified: churchstmarketplace.com/parking; burlingtonvt.gov parking rates]
- **Downtown Garage** (formerly College Street Garage) — entrances at **41 Cherry St, 60 College St, and Battery St**. This is the garage Hotel Vermont wraps. [verified: same]
- Levels and cladding not documented — [unsure]. A typical precast-concrete municipal deck is [likely].

### 3.14 Public art
- **"Big Joe" Burrell statue.** **Bronze, life-size, by Chris Sharp**, unveiled 4 June 2010 on the opening night of the 27th Discover Jazz Festival. **It stands on the top block (Pearl–Cherry), on the EAST side, directly in front of 16 Church Street — Halvorson's Upstreet Café.** [verified: photo 15, which shows the statue with the Halvorson's storefront behind it; Burlington City Arts; Seven Days]
  - **Pose:** a large man in a **suit**, standing, **saxophone held in his left hand with the mouthpiece at his lips**, and his **right arm thrown out straight toward the viewer, index finger pointing**. Warm **brown bronze**, not verdigris. **"BIG JOE BURRELL" is engraved on the bell of the sax.** [verified: photo 16]
  - **Base:** a **low, rough-hewn light-grey granite slab**, roughly square, ~10 in thick, sitting flush on the brick — **not a tall plinth**. Two **bronze plaques set flush into the top surface**. [verified: photo 15]
- **"The Leapfroggers."** **Copper, 1986**, by **Dennis and Sansea Sparling**, commissioned by the Church Street Marketplace Business Association. **Two children playing leapfrog** — one bent double with hands on knees, head down; the other **vaulting over the top, arms braced on the crouched child's back, legs kicked wide, mouth open**. **Green-verdigris patina with brown and orange highlights.** Mounted on a **thin flat metal plate set directly on the brick paving** — no plinth. [verified: photos 13 and 17]
  - History: **vandals stole most of the sculpture in June 2002, leaving only two feet behind**; it was restored with money raised locally. There has since been public debate about its placement. **Its current block is [unsure]** — model it, but don't stake recognition on which block.
- **[unsure]:** no complete Marketplace sculpture inventory is published. Painted fiberglass cows appear in older photos (a temporary public-art series) — **do not model those as permanent.** [verified: photo 06 shows two painted cows; they are a 2000s-era temporary installation]

### 3.15 The Leahy Way mural — **a trap**
- The famous **"Everyone Loves a Parade!"** mural — 120 ft × 14 ft, painted by **Pierre Hardy**, installed 2012 on **Leahy Way** (the alley off Church Street near Bank) — **was removed on 27–28 August 2020** after criticism that its 400-year cast of Vermont figures was almost entirely white. **It is gone. Do not put it in the game.** [verified: VTDigger 2020-08-28; WCAX 2020-08-27]
- **What's on that wall now:** **"Hands of Hope: One Community,"** unveiled **May 2025** — a **honeycomb of hexagonal panels**, each an individual artwork by a Burlington High School student in the Burlington City & Lake Semester program, together forming a unified Burlington landscape. It is **temporary** and moves to the new high school when that building is finished. [verified: WCAX 2025-05-14]
- Practical call: **paint an original hexagon-tiled mural** of your own design on that alley wall. It is correct in form, correct in date, and involves copying nothing.

### 3.16 Skyline / background only (do not build in detail)
Everything below is west of Battery Street, roughly 0.4–0.6 mi from Church Street, and should read as background silhouette:
- **Union Station**, 1 Main St, foot of Main — 1916, stone, a **clock set into the stone above the entrance**, carved scrolls and swags, **a winged hourglass on top of the composition**. Architect Alfred Fellheimer, who worked on Grand Central. [verified: Btown Out Loud `union-station-waterfront`]
- **The FRAME (Moran Plant)** — a **red steel skeleton with the sky showing through it**, at the north end of Waterfront Park. The brick was peeled off in Aug 2020 and the steel kept. Very recognizable silhouette. [verified: Btown Out Loud `moran-plant-frame`]
- **ECHO Leahy Center**, 1 College St, foot of College. [verified: `things.json`]
- **The Burlington Breakwater** — a long low line of stone offshore, **2,517 ft**, begun 1836. Reads as a horizontal dash on the water. [verified: Btown Out Loud `breakwater`]
- **Memorial Auditorium**, 250 Main St at South Union — big, and **locked since 2016**. If you extend the map east on Main, it's a dark closed building, not an active venue. [verified: Btown Out Loud `memorial-auditorium`]

---

## 4. Street furniture & surfaces — the actual skatepark

This is the section to read twice. Everything here is what the player's board will actually roll over, grind, and hit.

### 4.1 The paving — Church Street

**The single most important correction in this document: the mall is not one uniform brick field.** It is a deliberate three-zone composition, and getting it right is the cheapest possible way to make the level read as the real place. [verified: **D&K 2017** plan sheets C-1 / C-2 / C-3 and the Appendix C existing-conditions survey]

| Zone | Pattern |
|---|---|
| **Along the storefronts (both sides)** | an **existing dual-tone brick pattern**, running bond — labeled "EXISTING DUAL-TONE BRICK PATTERN (TYP.)" on every survey sheet |
| **Center of the street** | a **tri-tone, repeating linear pattern** — bands running the *length* of Church Street |
| **At the Cherry and College intersections** | a **tri-tone diamond pattern** — nested chevrons mitered into a giant concentric diamond centered on the intersection |
| **At the Bank intersection** | the tri-tone *linear* pattern instead of the diamond (and it was badly damaged in 2016) |

- **The three tones, from the rendered color plan: rust red, slate blue-grey, and buff/cream.** [verified: D&K 2017 Appendix D sheets C-1A / C-2B]
- **The granite meridian line.** A continuous **granite inlay strip runs down the exact centerline of Church Street for the whole length of the mall**, set flush in the brick. The Marketplace's own vending regulations call it "the center granite line" and measure everything from it. It is a known trip hazard, which tells you it is not perfectly flush. **This is the spine of the level.** [verified: D&K 2017 "Typical Granite Line Inlay Detail," Sheet C-3]
- **The globe pavers in front of City Hall.** **Two large circular stone-paver world maps** — the two hemispheres, land masses picked out in contrasting stone — are inlaid in the bricks on the City Hall block. Roughly ~15 ft diameter each [likely, scaled off the plan]. Many were loose or fragmented by 2016; the repair estimate was $65,000. **Almost nobody knows these exist and they are a perfect skate-spot centerpiece.** [verified: D&K 2017, "Globe Pavers in front of City Hall" + Appendix C Sheet 3]
- **Sister-city granite pavers**, individually named — **Irkutsk** and **Barranquilla** are both in the maintenance table. [verified: D&K 2017 Appendix B]
- **Engraved memorial pavers.** Anyone can buy an engraved **5.5-inch granite square** set into the bricks; they carry names and dates of the dead, scattered through the field. [verified: Seven Days 24-Hours]
- **Brick stickers.** The Marketplace sells adhesive brand decals applied directly to the bricks as an advertising product — so there are occasional printed logos underfoot. [verified: churchstmarketplace.com/programs-and-licensing]
- **Flush granite curbs** at the cross-street bump-outs; **granite curb bump-outs** at Bank and College; **full-width granite truncated-dome (detectable-warning) strips** at Church/Cherry; **granite speed rumble strips** on both Bank Street vehicular approaches. [verified: D&K 2017]
- **"EXISTING 3.5' TALL GRANITE POST (TYP.)"** — squat granite bollards, mapped separately from the removable steel ones. [verified: D&K 2017 Appendix C Sheets 2–3]
- **Color and wear:** warm red-orange to salmon clay brick, visibly varied paver to paver, **worn uneven and smooth from 45 years of foot traffic**. Not a uniform tone. [verified: photos 02, 21, 24; planning.org]
- **Tree pits come in three surveyed types:** **cobble-stone tree pit** (a ring of granite setts laid in concentric arcs — this is the one that reads best and appears clearly in photos), **square tree pit**, and **circular tree pit** with a radiating cast-iron grate. Some have **black iron tree guards** — a hooped cage around the trunk. [verified: D&K 2017 legend; photos 05, 12, 17, 21]
- **Construction section, if the ride feel matters:** brick pavers of varying thickness → ⅛" max hand-tight sand-swept joints → ¾" bituminous setting bed → neoprene tack coat → 4" bituminous base → up to 24" compacted crushed gravel. **The mall is brick-over-asphalt, not brick-on-sand.** So: fast, hard, and chattery, with occasional settled or loose pavers. Crosswalks sit on 4,000 psi concrete. [verified: D&K 2017 Sheet C-3]
- **There was no 2015–16 reconstruction.** The real capital history: original build 1980–81 (Carr, Lynch Associates, $6M); top block bricked 1994; City Hall block bricked 2005; a **$7.9M capital overhaul c. 2003–2016** (FHWA TCSP grants) that put in new brick surfacing, redesigned cross-street intersections, and an entirely new street-level electrical and pedestrian lighting system. The 2017 assessment then found ~$700k of deferred work. [verified: D&K 2017 Project Background]

### 4.1b The cross-section — the legal zoning that defines the street
This is the cleanest layout rule you have, and it is written into city ordinance. Measuring from the building face outward:

| Band | Width | Rule |
|---|---|---|
| **Pedestrian way** | **0 → 9 ft from the building** | *"An area of nine (9) feet on each side of the Church Street Marketplace is hereby established as a pedestrian way… used exclusively for pedestrian passage… shall extend nine (9) feet out from the building."* No sandwich boards, tents, cafés, or encumbrances. [verified: Burlington Code §27-20] |
| **Active zone** | **9 ft → 6 ft off centerline** | Café patios, vendor carts, tents, sandwich boards, buskers, benches, trees, light poles, boulders. Everything lives here. |
| **Emergency egress lane** | **the center 12 ft — 6 ft either side of the granite line** | Must stay clear. No buskers, no boards, no tents, no café furniture. [verified: Sandwich Board Rules & Regs 2024 §1; Regulating Outdoor Vending on Church Street; Street Entertainer Rules & Regs 2024 §9] |

**Build to this and the street will feel right automatically:** clear walking lanes hugging the shopfronts, a dense cluttered band of furniture and commerce, and a clean fast center lane down the middle marked by a granite stripe. That center lane is the natural skate line, and it is also the one place nothing is allowed to stand.

### 4.2 Benches
- **Classic park bench: black cast-iron ends with scrolled arms and curled feet, natural/honey-brown wood slats on both seat and back** (5–6 slats each). Roughly 5–6 ft long. **Small brass donor plaques are screwed to the backrest.** [verified: photos 06, 13, 21 — photo 21 shows one in sharp detail]
- Benches sit **out in the middle of the street**, in the planted strip line, not against the buildings — *"benches down the middle."* [verified: Btown Out Loud; photos 06, 21]
- Bench backs face both directions along the street; they often sit in pairs or in a row alongside a tree.
- **The wood tops get refinished on a cycle** by the maintenance crew, so bench wood is in better shape than you'd expect. [verified: Seven Days 24-Hours]
- **Two repurposed ski-lift chairs serve as a bench at the top of Church Street** (the Pearl end). This is a wonderful, specific, cheap detail — a Vermont chairlift chair bolted down as street furniture. **Put it in.** [verified: Seven Days 24-Hours]
- **A drinking fountain shaped like a fish** also stands at the top of Church Street. [verified: Seven Days 24-Hours]
- Street entertainers are explicitly forbidden from standing on the benches — which tells you people try. [verified: Street Entertainer Rules & Regs 2024 §9]
- **Grindable:** the iron arms and the seat edge. Realistic and satisfying.

### 4.3 The boulders — an underrated signature
- **Large natural glacial boulders — brown-grey, rounded, 2–4 ft high, in clusters of two or three — sit directly on the brick** as informal seating. Kids climb them, people sit on them, buskers lean their cases against them. [verified: photos 20, 21, 24 — photo 21 shows a boulder pair right beside a bench]
- **These are locally quarried and they are a signature Carr Lynch design element, mapped on the survey as "EXISTING BOULDERS (TYP.)."** There is a well-known cluster **in front of Insomnia Cookies (84 Church, Block 3 east)** that kids climb. [verified: American Planning Association; D&K 2017; Seven Days 24-Hours]
- These are one of the most Burlington things on the street and almost nobody models them. **Include them.** They are also natural transition obstacles for a skate game.

### 4.4 Planters
- **Large rectangular reclaimed-wood planter boxes on casters**, planks painted in mismatched **white, sage green, teal and bare weathered wood**, filled with **ornamental grasses and flowering annuals**. Roughly 3 ft tall, 4–8 ft long, ganged into runs. These sit right in front of storefronts (Ben & Jerry's has three). [verified: photo 23]
- **Dark rusted-steel round urns/bowl planters**, ~3 ft diameter, with seasonal flowers. [verified: photo 18]
- Restaurant patios are edged with **planter runs and low railings** — see 4.9.

### 4.5 Lamp posts
- **Black-painted metal, roughly 14–16 ft tall**, on a **stepped square/octagonal base**. [verified: photos 02, 05, 06, 08, 14, 20]
- Two head types appear:
  - a **tall curved gooseneck arm** carrying a **hooded/bell-shaped downlight** (most common along the street) [verified: photos 02, 14]
  - a **shorter curved arm with a round white globe / acorn** in a shade [verified: photo 06]
- Many poles carry a **short horizontal bracket arm at ~10 ft** for a **flag or a vertical banner**.
- Poles are placed **out in the street in the same line as the trees and benches**, on both sides.
- **There are exactly 30 light poles across the four blocks.** The Marketplace rents **light-pole banners and intersection banners in two-week intervals** as an advertising product — past clients include JetBlue and the Boston Celtics, so the banners are sometimes commercial rather than civic. [verified: churchstmarketplace.com/programs-and-licensing]
- **At least one pole carries an accessible power outlet** — a busker was observed plugging an amp into a streetlight. [verified: Seven Days 24-Hours]
- The Church Street poles are the older 2003-era Marketplace standard, **not** the Great Streets citywide fixture used elsewhere downtown. [verified: Great Streets Ch.6; D&K 2017]
- **Grindable:** the pole bases.

### 4.5b Storefront canopies — a forgotten signature
**Steel-and-glass canopies over the shopfronts are a prevalent feature of the Marketplace**, part of the original Carr Lynch scheme. They were designed to be convertible into **second-storey walkways** — a plan that was never realized. They stand on **steel canopy posts set on 18"×18" reinforced concrete piers**, and the "canopy line" is a legally meaningful edge: it is the outer boundary of the busking zone. **Merchants have been removing them over time**, so the run is patchy rather than continuous. [verified: D&K 2017 §"Storefront Canopy Post Removal" + Sheet C-3]

Halvorson's glass-and-white-metal canopy in photo 15 is one of these. Model them as an intermittent glass-and-steel shelf at ~10–12 ft over the shopfronts, with visible posts out at the 9-ft line — **and the posts are grindable/collidable.**

### 4.6 Banners, flags, bunting, string lights
- **Vertical fabric banners** hang from lamp-post brackets, in solid saturated colors — **purple, orange, red, magenta, green, yellow**. Some carry event artwork (Festival of Fools banners are red). [verified: photos 02, 06, 07]
- **American flags** on angled brackets. [verified: photos 05, 24]
- **Rainbow Pride flags** on the lamp-post brackets, both sides of the street, in summer — this is a normal, recurring Burlington look, not a one-off. [verified: photos 08, 20]
- **Triangular pennant bunting strung across the street** between lamp posts and building faces, in a rotating multicolor mix. [verified: photos 07, 14, 19]
- **Warm white string lights wrapped through the tree canopies** — the whole street glows at night. Plus café string lights over the patios and over City Hall Park. [verified: photos 14, 22]
- **Seasonal fabric art installations**: photo 02 shows a **canopy of red / teal / purple / blue fabric panels strung high across the whole street** in autumn. Treat as an occasional, swappable overhead layer. [verified: photo 02]

### 4.7 Trees
- **Species is genuinely [unsure].** The engineering plans label every tree only "EXISTING DECIDUOUS TREE (TYP.)" and no documented species list for Church Street exists. Burlington's Trees Team manages 8,500 street trees citywide and runs its own nursery; honey locust is in their palette but not confirmed for Church Street. [verified: D&K 2017; City of Burlington Trees Team]
- **Visually, honey locust is the best match and the safest bet** — small compound leaflets, open airy canopy, **bright clear yellow in fall**, exactly what photos 02 and 21 show. Build honey locust; just don't state it as fact. [likely]
- Two dying trees and three abandoned tree pits were flagged for removal in 2017 — **a few gaps in the tree line are correct.** [verified: D&K 2017]
- Some **red maples** mix in (deep red autumn color). [verified: photo 02]
- Canopies are **high-branched and broad** — mature trees arch over the street and in summer nearly close overhead, throwing dappled shade on the brick. Sight lines down the street are partly leaf-filtered. [verified: photos 05, 14, 20, 24]
- In winter the bare branches change the whole read of the street. [verified: photo 18]

### 4.8 Bollards, kiosks, and other objects
- **Bollards** line each cross-street mouth where the mall meets traffic. Two distinct kinds, both surveyed: **removable steel bollards** (pulled at 7 a.m. daily for deliveries, back in by mid-morning) and **fixed 3.5-ft granite posts**. [verified: D&K 2017 Appendix C; Seven Days 24-Hours; photos 07, 14, 17]
- **Four subsurface vaults** sit under the bricks with **hatchways at 2 Church St, 71 Church (Ken's Pizza & Pub), 131 Church (Von Bargen's) and 148 Church**. Metal hatch plates flush in the paving — free texture detail, and a nice place to hide something. [verified: D&K 2017]
- **Marketplace directional pylons**: **tapered obelisk-like posts painted deep maroon/oxblood, ~5–6 ft tall, with a small pyramidal cap**, carrying directory/map panels. Very distinctive, appears in multiple photos. [verified: photos 05, 17]
- **Vendor carts.** Small wheeled carts and stands with **green-and-white or striped canopies** selling jewelry, food, crafts. Food carts at night are **strung with lights** and have **chalkboard menu boards** hung inside the serving window and an **A-frame chalkboard on the ground beside them**. [verified: photos 22, 24]
- **A-frame sandwich boards** everywhere — chalkboard or printed, leaning on the brick outside every other storefront. [verified: photos 05, 20, 24]
- **Trash and recycling receptacles**: black metal, paired trash/recycling. The maintenance crew works with **"butlers" — freestanding dustpans on poles.** [verified: photos 06, 24; Seven Days 24-Hours]
- **Bike racks**: black inverted-U hoops and curled/loop racks, some painted **red**. There is a **bike rack with public repair tools at Outdoor Gear Exchange, 37 Church St.** [verified: photos 06, 08, 13; churchstmarketplace.com/getting-around]
- **Yellow fire hydrants**, catch basins, electrical and telecom manholes, pull boxes, a **flagpole**, and a **Burlington City plaque** are all mapped on the survey. [verified: photo 20; D&K 2017]
- **A bus stop with a roof stands on Church Street itself**, on the north side at College. [verified: D&K 2017]
- **The Marketplace Department's office is at 149 Church St — inside City Hall**, not at 2 Church St (2 Church is a private office building). There is **no documented permanent information kiosk**. [verified: churchstmarketplace.com/about-us; D&K 2017] The **city-owned food kiosk at the Church & College corner** (addressed 180 College) is a vending kiosk, not an info booth. [verified: Seven Days]
- **The maintenance crew is three people**, one of them 18 years on the job, working every day but Christmas, with a **golf cart parked in front of City Hall**. They reset bricks, refinish benches, string the tree lights and the cross-street pennants. **A perfect ambient NPC.** [verified: Seven Days 24-Hours]
- **[verified — no gateway arch]:** nothing documented supports a permanent gateway arch or a large "Church Street Marketplace" monument sign. The 2019 Festival of Fools photo shows a **temporary fabric arch** at the Pearl Street entrance. **The visual terminus is the church steeple, not signage.** Do not build a permanent arch.

### 4.8b Cafés, tents and sandwich boards — the exact dimensional rules
Useful because they tell you precisely how far things stick out. [verified: *Regulating Outdoor Vending on Church Street*; *Sandwich Board Rules & Regulations 2024*]
- **Cafés:** must clear the 9-ft building walkway *and* stay 6 ft off the granite center line. May expand no more than **30% or 8 feet** across an adjoining retailer's frontage, and the neighbor can veto. Fees per square foot (2022): **$9.09 alcohol / $5.91 food / $4.54 coffee.** Season runs **May 1 – Apr 30**. **Furniture is cabled together overnight** — a good early-morning visual.
- **Retail tents:** up to two **10'×10'** (or one 10'×20'), **solid white or black only**, all sides open, 50 lb weights on two legs, 30 mph wind rating, **set up and taken in daily**, **May 15 – Oct 15**, $500 per tent per season.
- **Sandwich boards:** max **8 sq ft, 3 ft wide, 4 ft tall**, within 15 ft of the business, clear of both the 9-ft walkway and the 12-ft egress lane.
- **Vendor carts:** roughly **20 food and retail carts, each parked in an assigned spot.** A peddler certificate is required.

### 4.9 Outdoor café seating
- Restaurants push seating **well out into the street** — typically 12–20 ft — in defined patios. [verified: photos 05, 14, 20, 24]
- Patios are edged by:
  - **red- or black-painted metal railings** [verified: photo 05 — a bright red railing around a patio]
  - **black posts with chain or rope between them** [verified: photo 02]
  - **planter runs**
- **Furniture:** black metal bistro chairs and small round black metal tables; some patios use **teal/turquoise metal chairs** (also the City Hall Park chair color). [verified: photos 05, 07, 14, 19]
- **Umbrella colors seen:** dark green, red-orange, blue, white, and green-and-white striped. Green and red predominate. [verified: photos 20, 24]
- **Glass-and-white-metal canopy awnings** shelter some patios (Halvorson's has one). [verified: photo 15]

### 4.10 Awnings and storefront signage character
- **Awning colors observed on Church Street:** deep green, dark red/burgundy, black, navy, cream. Mostly **traditional straight-slope canvas awnings** with a scalloped or plain valance; a few flat metal canopies. [verified: photos 05, 08, 17, 21]
- **Projecting blade signs** hanging perpendicular to the facade on decorative black iron brackets are extremely common. [verified: photos 05, 17]
- **Facade materials, in rough order of frequency:** red brick (dominant), painted brick (white, cream, grey, green), light grey/white marble or limestone on the bank buildings, occasional stucco and clapboard on upper storeys.
- **Typical building height on Church Street: 3–4 storeys**, "almost uniformly three stories in height and built of brick, and most were built between about 1880 and 1930" for the buildings around the park. [verified: Wikipedia, City Hall Park Historic District] Expect **2 to 5 storeys** on the mall with 3–4 as the mode.
- **Roofs are mostly flat behind parapets and corbelled brick cornices.** Exceptions with real silhouette value: the Masonic Temple's slate pyramid, the Richardson Building's conical turrets and dormers, a couple of **slate mansards with dormers** on the top block, and the Firehouse tower. [verified: photos 06, 08, 20, 24]

### 4.11 Steps, ledges, rails — the skate inventory
Confirmed grindable/ollie-able geometry, in rough order of value:

| Feature | Where | Confidence |
|---|---|---|
| **Split double granite staircase + landing + black iron handrails** | City Hall front | [verified: photo 03] |
| **Low curved granite retaining walls flanking those stairs** | City Hall front | [verified: photo 03] |
| **Rough granite blocks under the deer and bear bronzes** | City Hall stairs | [verified: photos 03, 10, 11] |
| **Low granite ellipse sitting wall** | City Hall Park center | [verified: Great Streets BTV] |
| **The Main Street sitting wall** — *"a skateboarder's dream"* | City Hall Park, south edge, along the linear rain garden. **Precast concrete stepping stones lead through breaks in it.** | [verified: Seven Days, Nov 2020 — see §6] |
| **Granite meridian line inlay** | dead center of Church St, full length | [verified: D&K 2017] |
| **The two circular globe pavers** | Church St in front of City Hall | [verified: D&K 2017] |
| **Fixed 3.5-ft granite posts** | cross-street mouths | [verified: D&K 2017] |
| **Steel canopy posts on 18"×18" concrete piers** | out at the 9-ft line, in front of many shops | [verified: D&K 2017] |
| **Granite curb bump-outs** | Bank St and College St crossings | [verified: D&K 2017] |
| **The flush fountain / splash pad plane** | City Hall Park | [verified: Seven Days] |
| **Long thermally-modified ash benches** | City Hall Park paths | [verified: Great Streets BTV] |
| **Cast-iron bench arms and seat edges** | all four blocks | [verified: photo 21] |
| **Granite slab under the Big Joe Burrell statue** | Block 1 east, 16 Church | [verified: photo 15] |
| **Boulders** | scattered, all blocks | [verified: photos 20, 21, 24] |
| **Bollards** | every cross-street mouth | [verified: photos 07, 14] |
| **Granite tree-pit rings (flat, flush)** | all blocks | [verified: photo 21] |
| **Church terrace steps** | head of Church St | [verified: photos 08, 20] |
| **Brownstone piers and base course** | BCA Firehouse, 135 Church | [verified: photos 09, 18] |
| **Patio railings, chain-and-post runs** | in front of restaurants | [verified: photos 02, 05] |
| **Marketplace pylons, lamp bases, bike racks, trash cans** | everywhere | [verified: photos 05, 17] |

**Note the absence of the usual skate-game furniture.** There are **essentially no steps, ledges or low walls on the Marketplace itself** — it is a flat, curbless brick plain, and that was the entire design intent. There are **no curbs**, **no long handrails down a stair set** other than at City Hall, and **no open plaza** — the street is busy with objects instead. [verified: D&K 2017; photo survey]

**So the level splits cleanly in two:**
- **The Marketplace = a fast, flat, cluttered technical space.** Manuals down the granite line, flatground between the bollards, grinds on benches and boulders and canopy posts, weaving through carts and sandwich boards and buskers and strollers. Downhill north to south.
- **City Hall Park and the City Hall steps = where the real architecture is.** The split granite staircase, the iron rails, the two long granite sitting walls, the flush fountain plane, the multi-material paving.

### 4.12 Top block vs. bottom block
- **Block 1 (Pearl–Cherry, "the top block")** — bricked last, in 1994. Framed at the head by the Masonic Temple (west) and Richardson Place (east). Fewer restaurant patios, more retail, the Big Joe Burrell statue, the strongest view of the church. [verified: Btown Out Loud; photos 08, 20]
- **Block 4 (College–Main)** — pedestrianized last, in **2005**. City Hall closes it. The Firehouse is on it. It reads slightly newer. [verified: Btown Out Loud]
- **Blocks 2 and 3 (Cherry–College)** — the original 1981 mall, densest with trees, benches, boulders and cafés. This is the picture-postcard stretch and where most reference photos are taken from. [verified: photo survey]

### 4.13 Transit
- **GMT Downtown Transit Center, 101 St Paul St** — opened 20 Jan 2017. A **10,250 sq ft glass-and-structural-steel building** with an indoor climate-controlled waiting area, ticket booth and restrooms, plus a **covered exterior boarding platform for 10 buses** with real-time displays, benches, windscreens and exterior heaters. **$7.7M**, designed by TruexCullins, built by PC Construction. It occupies the **whole St Paul Street block between Cherry and Pearl**; through vehicle and bike traffic is prohibited. Greyhound stops on Pearl at its northeast corner. [verified: bbavt.org; pcconstruction.com]
- **Cherry Street is the transit-framing street** — classified a "Commercial Slow Street with Transit." Whether physical shelters stand on Cherry today is [unsure]. [verified: Great Streets Ch.2]
- **There is a bus stop with a roof on Church Street itself**, north side at College. [verified: D&K 2017]

---

## 5. Atmosphere

### Color palette
Dominant: **warm red-orange brick underfoot and on the walls**, **green tree canopy**, **black iron** for every piece of street furniture, **white trim** on the church and City Hall, **pale grey granite** accents. Accent colors come from **awnings (green, burgundy, black)**, **banners (purple, orange, magenta, green)**, **umbrellas (green, red)**, and **rainbow flags**. In autumn the canopy goes **yellow** (honey locust) with patches of red. In winter, bare branches, grey sky, and the brick reads darker and colder. [verified: photo survey]

### Light
- Burlington is at **latitude 44.5° N** — high enough that summer evenings are long and winter afternoons are short. Sun sets over the lake to the **west**, so **evening light comes straight up the cross streets** and rakes across the north–south mall.
- The lake produces a particular quality of light locals talk about; sunset over the Adirondacks "never gets old, and it's free every single night." [verified: `guides.json`]

### Sound
- **Church bells on the hour** from the Unitarian tower. [verified: Btown Out Loud]
- **City Hall's cupola bell also rings the hours.** [verified: UVM HP206]
- **Buskers** — core to the street's identity, not decoration. Photo 12 shows a **six-piece band playing mid-street on the brick**: trumpet, upright bass, acoustic guitar, drum kit, violin, clarinet, with an **open suitcase and an open violin case for tips** on the ground. Solo guitarists, drummers, jugglers and chalk artists all appear. [verified: photo 12]

**The busking system is formal and specific**, and it shapes exactly what you hear and where. [verified: *Street Entertainer Rules & Regulations 2024*, read in full]
- **A video audition is required annually**, or in person at the Marketplace office. Scored on **Tone, Accuracy, Balance, Presentation, Repertoire — minimum 15 to pass.**
- **Fees: $50/yr annual license.** Young Performers Permit (under 18) free. Travelling Performers Permit $20. **Circle Acts $100/yr**, case-by-case, safety plan required.
- **No amplified sound. No percussion** without a separate on-street audition and written approval. **Brass and saxophones must be muted.** Everything under **80 dB**. Battery electric pianos allowed with volume limits.
- **Pitches are not numbered or assigned — the rule is geometric.** Perform between 6 ft off the centerline and the canopy line. **Never** in the 9-ft pedestrian way or the 12-ft center egress lane. **100 ft minimum between performers.** May not stand on benches.
- **Hours 10 a.m.–9 p.m. daily, to 10 p.m. Fri/Sat. Must move to a different block every hour, and an hour must elapse before returning.** Nothing 10 p.m.–7 a.m.
- If the crowd blocks the 9-ft walkway, the performer must ask it to clear **every 10 minutes** or relocate.
- License must be visibly displayed. May sell **only their own CDs, only while performing.**
- **~200+ street performer permits issued annually.** [verified: American Planning Association]

For the game: **buskers spaced ~100 ft apart, never in the center lane, never amplified, and they relocate on the hour.** That's a free ambient-audio system.

### The crowd
A specific mix, and getting it wrong is noticeable:
- **UVM and Champlain College students** — the city's population swings with the academic year.
- **Tourists**, heaviest in summer and foliage season.
- **Families with strollers.** Strollers are everywhere in the photos. [verified: photos 05, 12]
- **Dogs, constantly** — Burlington has an off-leash dog beach and a park drinking fountain with a **dog-height spout**. [verified: `things.json`; Great Streets BTV; photo 20 shows a dog mid-street]
- **Shoppers with paper bags**, people with coffee, people just sitting on boulders and benches.
- Dress is casual and outdoorsy — fleece, flannel, running shoes, backpacks, hiking-brand jackets.

### The daily cycle — build the day/night from this
Straight from a reporter who spent 24 hours on the street, 12 June 2026 [verified: Seven Days 24-Hours]:

| Time | What the street looks like |
|---|---|
| **6:00 a.m.** | City Hall bell tolls. Gulls. **Café furniture still cabled together.** Headless mannequins in windows. Can collectors working the bins. |
| **7:00 a.m.** | **Bollards come out.** Delivery trucks drive onto the bricks and line up. |
| **mid-morning** | Bollards back in, street closed to vehicles again. Shops open. |
| **midday** | Buskers, carts, **chalk drawings on the bricks**, shoppers, panhandlers. |
| **twilight** | **The tree lights come on.** Banners shake overhead. |
| **late night** | Bar crowds surge **south toward Main**. Food carts run past 2 a.m. A busker plugs an amp into a streetlight at the top of the street. **Motorcycles doing burnouts in the Church/Bank intersection.** |
| **dawn** | Broken glass on the bricks. People sleeping on benches near City Hall. Bell tolls six again. |

That last cell matters: **the crowd flows downhill toward Main Street at night** because that is where the bars are. Density should not be uniform.

### Seasons and events
- **Summer**: patios at full extension, umbrellas up, string lights, rainbow flags, buskers, vendor carts, packed.
- **Burlington Discover Jazz Festival** — **2026 was the 43rd, June 3–7.** Main stages are at the **Flynn and Waterfront Park**; **the Marketplace hosts dozens of school bands** rather than a built stage. This is when the Big Joe Burrell statue makes sense. **2026 also included a Jazz Fest Skate Jam at A-Dog Skate Park.** [verified]
- **Festival of Fools** — **2026 was the 18th annual, Fri 31 July – Sat 1 Aug**, on the Marketplace *and* City Hall Park, presented by Burlington City Arts. Free. **Shows run on four outdoor performance "pitches"** on the bricks — noon–9 p.m. Friday, 11 a.m.–9 p.m. Saturday, 70+ free performances. **The festival was paused in 2025.** Regular busker permits are **void during Festival of Fools**, out of respect for the festival performers' tips. Exact pitch locations unpublished. [unsure on pitch placement] Visually [verified: photo 07, 2019]: **triangular bunting strung across the street, a temporary yellow fabric gateway arch at the Pearl entrance, red vertical FESTIVAL OF FOOLS banners on every lamp post, temporary blue metal tables and chairs, crowd-control barricades at the cross streets.**
- **Holiday lights.** *"More than 200,000 white lights"* go up after Thanksgiving as a **mesh of lights suspended in the trees** that "glitters to life" at twilight. **A 30+ ft Christmas tree stands on Church Street itself, not in City Hall Park.** The **Tree Lighting & Santa Parade** is the Friday after Thanksgiving (2026: 27 Nov — parade at noon, lights at 6:00 p.m. sharp), followed by four **Festive Fridays**, plus a menorah lighting. [verified: American Planning Association; churchstmarketplace.com/annual-events; WCAX 2025-11-21]
- **S.D. Ireland St. Patrick's Day Truck Parade** — **17 March, ~3 p.m., 15+ cement mixers covered in thousands of lights driven down the bricks.** Absurd, beloved, and a genuinely great set piece. [verified: churchstmarketplace.com/annual-events; `things.json`]
- Other recurring Church Street events [verified: churchstmarketplace.com/annual-events]: **Maple Madness** (21 Mar) · **Ben & Jerry's Free Cone Day** (April) · **Vermont City Marathon runs through the Marketplace** (late May, since 1989) · **Party on the Bricks** (weekly, summer) · **Sidewalk Sale** (second Thu–Sun of August — **racks of clothes out on the bricks**) · **Pride Parade** (September — **starts at Church Street's south end and ends at Battery Park**) · **Howl'ween Dog Costume Contest** (31 Oct) · Halloween Bike Ride.
- **Not on Church Street** — common mistakes:
  - **Burlington Farmers Market** was founded in City Hall Park in 1980, displaced by the 2019 park reconstruction, and **the board voted in 2021 to stay in the South End.** It is now at **345 Pine St, Saturdays 9 a.m.–2 p.m., 9 May – 31 Oct 2026**, 80+ vendors. The city runs a separate smaller "BTV Market" in City Hall Park. [verified]
  - **South End Art Hop** — 11–13 Sept 2026, **along Pine Street**, 125+ locations. [verified: SEABA]
  - **Vermont Brewers Festival** (July) and **Grand Point North** (September) — **Waterfront Park.** [verified: `things.json`]
  - **First Night Burlington is dead.** It shut down in April 2018 after 35 New Year's Eves (the first in 1983). The successor is **Highlight**, run by Burlington City Arts — NYE across downtown and the waterfront with music, circus, fireworks and bonfires, still running into 2026. **Do not put "First Night" on a banner.** [verified]
- **Autumn**: foliage tourism, yellow canopy, seasonal fabric installations overhead.
- **Winter**: bare trees, 200,000 lights, snowbanks pushed against the planters, far fewer people, patios stowed. Photos 18 and 22 show the winter/night read.

---

## 6. Skating downtown

### 6.1 The ordinance — verbatim, and it is better than fiction
**Burlington Code of Ordinances §27-18, "Operation of non-motorized vehicles"** [verified: codepublishing.com/VT/Burlington/html/Burlington27/Burlington2701.html]:

> **(a) Definition.** …non-motorized vehicles shall be defined as any device not powered by a motor, used for propelling or transporting one (1) or more persons, **including, but not limited to, skateboards, in line skates, scooters, and roller skates. This definition shall not include bicycles.**
>
> **(b) Prohibited.** It shall be unlawful and shall be **a trespass** for any person to operate any non-motorized vehicle upon any sidewalk or within any public parking facility in the **City Center (bounded by the centerlines of Pearl Street, South Winooski Avenue, Main Street, and St. Paul Street)**, **within City Hall Park**, or **upon the streets and sidewalks within the Church Street Marketplace District**… **excepting the traveled portions where vehicular traffic is regularly permitted of College, Bank and Cherry streets**…

Three things fall straight out of this and all three are gameplay:

1. **Skating the bricks is not a citation, it is legally a trespass.** Marketplace plain language: *"Biking and skateboarding are not permitted while on the bricks."* [verified: churchstmarketplace.com/getting-around]
2. **The three cross-street roadways — College, Bank and Cherry, where they cut across the mall — are explicitly carved out and legal to skate.** Three narrow legal strips running east–west through an illegal brick field. That is a mechanic, sourced, free.
3. **Bicycles are exempt.** A bike messenger NPC can do what the player cannot.

**Penalties:** first offense is a civil ordinance violation, **$50–$500** (§27-21). **A second offense within 12 months lets police impound the board.** Impounded boards are released on payment of the fine; **unclaimed after 60 days they are disposed of as unclaimed property.** Ordinance dates from 6-14-82, amended 1990, 1996, 1998, 2004, 2010.

**Signage:** [unsure] whether physical no-skating signs are posted — the ordinance only *requires* signs for areas where skating is specially **permitted**. Photo 24 shows a **yellow A-frame prohibition sign standing mid-street** listing barred activities, which is consistent.

### 6.2 Who chases you
- **Burlington Police** and **Church Street Marketplace staff** both have named authority to order compliance. [verified: Marketplace regulations]
- **Downtown Ambassadors** — an **unarmed** team created by the Burlington Business Association with the Marketplace, trained in **city-ordinance education and de-escalation**, doing safety escorts and coordinating with Howard Center Street Outreach and BPD. **They are hospitality, not enforcement.** [verified: bbavt.org/news/streetambassadorsdebut/]
- **Design note:** the honest antagonist is an **unarmed ambassador in a branded windbreaker who talks at you**, or a **Marketplace maintenance worker on a golf cart**, not a cop. That is both more accurate and a better character.

### 6.3 City Hall Park — the spot the city is actively defending
Directly on point, and dated [verified: Seven Days, *"Controversy Aside, Burlington's City Hall Park Is Well Designed and Welcoming,"* Nov 2020]:

> "**The Main Street sitting wall, a skateboarder's dream, already bears the streaks and pocks of multiple attempts.** … Hodgson said **the city will soon install metal skate stops on the walls to discourage skateboarding.**"

That is your escalation beat, sourced: a brand-new $5.8M park with a wall so good that skaters wrecked it within weeks, and the landscape architect saying skate stops are coming. **Model the skate stops** — small metal knobs bolted along the wall top — and let the player deal with them.

Park build facts for reference: redesigned by **Wagner Hodgson**, closed July 2019, reopened **16 Oct 2020, $5.8M**. Also there: a **granite-cobble stormwater runnel with 120 Champlain marble discs** ("Watersheds to the Lake"), **four wired event spaces**, and the **Antonia & Rita Pomerleau Fountain**, the state's first fully accessible outdoor fountain. [verified: Wagner Hodgson; Seven Days]

### 6.4 Andy A_Dog Williams Skatepark — the real one
- **1 Lake St, Burlington** — in Waterfront Park on the Greenway, next to the Moran Frame. Open 7 a.m.–8 p.m. It is Lake Street's north terminus. [verified: Great Streets Ch.2]
- **Opened 24 Nov 2015; formally dedicated 4 June 2016 with a surprise Tony Hawk appearance** — it was the **Tony Hawk Foundation's 500th assisted skatepark.**
- **~21,000 sq ft of concrete. Designed by Grindline Skateparks, built by Artisan Skateparks.**
- **Features:** a flowing streetscape wrapping an amorphous **flow bowl that descends to 10 ft deep** at one end, plus a **4-ft mini bowl**; the street side has a **hubba ledge, flat and curved ledges, manual pads, camel humps, handrails, a flat bar, stairs, landscape rocks, a euro gap, quarter pipes, banks, and a large vert bank**; a mini snake run runs to a vert wall.
- **How it got built:** ten-plus years of grassroots advocacy led by **Brendan Foster and Trina Zine of Maven skate shop — which is at 128 Church St, on the Marketplace itself.** Funded by a $10,000 Tony Hawk Foundation grant (2010), $3,720 CDBG, a $7,000 "buy a brick" campaign, and city money. Total cost was never published. [unsure]
- **Named for DJ Andy "A_Dog" Williams**, Burlington's preeminent turntablist and a skater and snowboarder. Diagnosed with AML in Dec 2012; **died 26 December 2013, aged 38.** **A_Dog Day** runs every August — live music, DJs, a skate jam at the park, art. A mural honoring him was added later.
- **Distance from Church & Main: ~0.5 mi, a 10–12 minute walk, with ~100 ft of elevation drop**, all of it on the Main/College/Battery descent. [likely — computed]
- **Treat A_Dog as a memorial, not a brand.** If the game references it, reference it respectfully. Don't put a fake logo on it.

### 6.5 The local scene, for texture
- **Maven, 128 Church St** — open, **on the Marketplace**, Block 4 east side. Skate, sneakers, apparel. **The shop that got the skatepark built.** A skate shop on the pedestrian mall where skating is illegal is a genuinely great irony and it is real.
- **Talent Skatepark & Shop** — opened 2001 on Williston Rd, South Burlington; an **8,000–12,000 sq ft indoor park** (plaza, street course, bowl, micro mini-ramp). Closed Aug 2018; revived as a **501(c)(3) nonprofit and reopened 20 Jan 2020** in Burton Snowboards' "Area 13" building at **266 Queen City Park Rd, Burlington**. **Current 2026 status is ambiguous** — a 2025 Seven Days zoning piece says Talent closed the indoor park and Burton intends to lease it space at a new Industrial Parkway location alongside a relocated Higher Ground. [unsure]
- **Ridin' High** — Battery & Pearl for ~25 years; **closed 31 Oct 2025** after a landlord dispute and relocated to Montgomery Center.
- **B-Side** — a former downtown skate shop, closed. It appears in archival fisheye footage in Vermont Public's 2023 *Made Here* documentary on Talent, which shows skating **inside the former B-Side shop, on sidewalks, in parks, and inside the old Burlington Square Mall.** **That documentary is the best documented record of downtown Burlington street spots** — no Thrasher or Transworld feature on Burlington surfaced. If you want more real spots, that is the source to watch.
- **Bern** is a Burlington-founded helmet brand, not a shop. **Old Spokes Home** is bicycles.
- **Music/skate crossover is real here:** the 2026 Discover Jazz Festival included a **Jazz Fest Skate Jam at A-Dog Skate Park.** [verified]

### 6.6 The design read
A pedestrian mall where skating is **legally a trespass**, patrolled by **unarmed ambassadors**, with **three legal cross-street strips** cut through it, a **skate shop sitting on the bricks**, a **brand-new park wall down the hill that the city is about to bolt skate stops onto**, and **a memorial skatepark half a mile downhill at the bottom of a 4.4% grade**. The real place already wrote the game. **Skate the bricks, build heat, get moved along, bomb College Street to the lake.**

---

## 7. The recognition checklist

Ranked. If polygon budget runs out, cut from the bottom. Items 1–5 are non-negotiable: without them, a Burlingtonian will not recognize the place no matter how much else is right.

| # | Thing | Why it matters | Confidence |
|---|---|---|---|
| **1** | **The Unitarian Church closing the north end of the axis** — red brick body, white trim, **round clock on the brick tower**, white belfry and lantern, **dark green spire**, ~170 ft. Visible down the whole street. | This is *the* Burlington image. Locals literally give directions by it. Everything else can be approximate; this cannot. | [verified] |
| **2** | **Brick, curb to curb, no cars, benches down the middle** — with the **three-zone paving** (dual-tone along the shops, tri-tone linear down the center, tri-tone diamonds at the Cherry and College intersections) and the **granite meridian line** down the exact centerline. | The floor is 40% of what you see. Uniform brick reads as "a generic pedestrian mall." The banded, multi-tone, granite-striped floor reads as Church Street. | [verified: D&K 2017] |
| **3** | **City Hall closing the south end** — red brick with **white marble Corinthian pilasters**, rusticated granite base, **white cupola with a clock**, and the **split double granite staircase with black iron rails**, flanked by the **bronze deer and bronze bear-with-cub on granite blocks**. | The other terminus. The deer and bear are the detail locals will check for. | [verified: photo 03] |
| **4** | **The mature tree canopy with warm string lights in it**, arching over the street from both sides, plus **triangular pennant bunting strung across between the buildings**. | Church Street feels like a room with a ceiling. Bare street = wrong city. At night the lights in the trees *are* the street. | [verified: photos 14, 20, 24] |
| **5** | **The BCA Firehouse at 135 Church** — red brick, **three tall round-arched windows with dark teal-green mullions**, rough brownstone piers, the carved **"ETHAN ALLEN ENGINE CO. NO. 4"** band, and the **85-ft slate-capped hose-drying tower**. | The most distinctive single facade on the street, and cheap to model memorably. | [verified: photos 09, 18] |
| **6** | **Black cast-iron benches with honey-wood slats, and the glacial boulders sitting on the brick beside them.** | The bench is generic; the boulders are not. Almost nobody who builds Church Street includes the boulders, and every local knows them. | [verified: photo 21] |
| **7** | **Black lamp posts with gooseneck arms — 30 of them — carrying vertical color banners, American flags, and rainbow Pride flags.** | The vertical color accents against red brick are the street's signature palette move. | [verified: photos 08, 20] |
| **8** | **The Masonic Temple (grey stone, five storeys, steep slate pyramid roof) on the west and Richardson Place / "Abernethy's" (red brick, conical green turrets, dormers, iron "R" balconies) on the east — framing the church at the head of the street.** | The framing composition is the reason the axis reads so strongly. | [verified] |
| **9** | **Café patios pushed 12–20 ft into the street** with black or teal metal bistro furniture, green and red umbrellas, railings and planters — clustered, not continuous, and legally clear of both the 9-ft shopfront lane and the 12-ft center lane. | The occupation of the street by seating is what makes it a *marketplace* rather than a plaza. | [verified: photos 05, 14, 20] |
| **10** | **The Burlington Square contrast: an 11-storey, 140-ft tower (Vermont's tallest) newly finished at the Bank Street end, with an active fenced construction site behind it filling the block up to Cherry.** | This is what downtown Burlington looks like *right now* and nowhere else looks like it. A builder working from old photos will put a shopping mall or a hole here. Both are wrong. | [verified] |
| **11** | **Ben & Jerry's at 36 Church** — tan-buff brick, black window frames, white awning band, **turquoise band reading "PEACE, LOVE & ICE CREAM"**, and the **mismatched painted reclaimed-wood planter boxes on casters** out front. *(Homage, not reproduction — invent the name and wordmark.)* | The single most-photographed storefront on the street. | [verified: photo 23] |
| **12** | **The Big Joe Burrell bronze on its low granite slab, on the top block in front of 16 Church** — suit, sax at his lips, **right arm flung out pointing at you.** | A beloved, specific, cheap-to-model object that says "this person has actually been here." | [verified: photos 15, 16] |
| **13** | **The view west down College and Main: lake, then the Adirondacks, then sunset.** Plus the visible **downhill grade** of both streets. | The lake is why the city exists. Framing it at the end of two cross streets is a five-minute job with an enormous payoff. | [verified] |
| **14** | **Two or three papered-over empty storefronts.** | Church Street had ~12 vacancies in April 2026. A fully leased street is a lie, and locals will feel it before they can name it. | [verified] |
| **15** | **Buskers spaced along the street** — an unamplified acoustic band mid-block with an open case, a solo guitarist, chalk drawings on the bricks. Plus **vendor carts, A-frame sandwich boards, strollers and dogs.** | The street's whole character is that it is occupied by people doing things. Empty geometry reads as a model, not a place. | [verified: photos 12, 22] |

**Bonus cheap wins, in descending order of delight:** the **two ski-lift chairs used as a bench at the top of the street**; the **fish-shaped drinking fountain** beside them; the **two circular globe pavers inlaid in the brick in front of City Hall**; the **concentric granite cobble rings around each tree**; the **maroon tapered directory pylons**; the **206-ft four-seasons mural on Outdoor Gear Exchange's Cherry Street wall**; the **teal movable bistro chairs in City Hall Park**; the **maintenance crew's golf cart parked outside City Hall**.

---

## 8. Sources and licensing

### Licensing note
**Everything in this document is reference only.** No photograph, texture, logo, wordmark, sign artwork, mural, or sculpture from any source listed here is copied into the game. All art is original low-poly work built from written description and measurement. Where a real business is named, it is for **placement and homage** — invent the name and the sign art. Where a real artwork is described (the Burrell statue, the Leapfroggers, the Leahy Way mural, "Lakebone"), **do not reproduce it**; build something of your own that occupies the same role in the same place, or leave it out. Living artists hold copyright in their sculptures and murals.

### Local sources (on this machine)
| Source | What it gave |
|---|---|
| `~/btownbrief/btown-brief/out-loud/stories.json` | **The best single source in this document.** Fact-checked, human-reviewed GPS audio-tour scripts for the Unitarian Church, the Marketplace, City Hall Park, the Firehouse, the Masonic Temple, Richardson Place, the Howard Opera House, the Flynn, the mall block, Nectar's, Union Station, the Moran Frame, the Breakwater, Memorial Auditorium. Each pin carries its own `sources` array. |
| `~/btownbrief/btown-brief/data/openings.json` (updated 2026-08-02) | Openings and closings 2025–2026 with a news URL for every entry. The reason this document knows Nectar's is dead and Burlington Square is open. |
| `~/btownbrief/btown-brief/data/small-bites.json` (2026-08-02) | 116 downtown food businesses with addresses and coordinates — the basis for the odd/even side derivation. |
| `~/btownbrief/btown-brief/data/restaurants.json` (2026-07-10) | Downtown restaurants with closure flags and blurbs. |
| `~/btownbrief/btown-brief/data/things.json`, `guides.json`, `hobbies.json`, `walking-tour.json`, `history-facts.json` | Landmarks, the A_Dog skatepark, festivals, the lake view, atmosphere. |
| `~/btownbrief/church-street-runner/` (repo root) | **12+ reference photographs.** Numbered in this doc as photos 02–24 after downscaling; originals keep their filenames. Also `src/landmarks.js`, which shows what a previous Burlington game treated as iconic (Burrell, Leapfrog, deer, bear, Firehouse, City Hall, ice cream shop). |

### Primary documents (the most valuable web sources)
- **Dubois & King / CCRPC, *Church Street Marketplace Pedestrian & Streetscape Assessment*, 2 June 2017** — 26 pp with survey plans, paving patterns, construction sections, furniture inventory. `https://studiesandreports.ccrpcvt.org/wp-content/uploads/2018/01/Church-St-Streetscape-Assessment-Report-06-2-17.pdf` **This is the single best physical-design document that exists for the Marketplace.**
- **Burlington Code of Ordinances Ch. 27** (skateboarding §27-18, pedestrian way §27-20, penalties §27-21) — `https://www.codepublishing.com/VT/Burlington/html/Burlington27/Burlington2701.html`
- **Great Streets BTV Design & Construction Standards** — Ch.2 per-street sheets `https://www.burlingtonvt.gov/DocumentCenter/View/3023` · Ch.6 lighting `https://www.burlingtonvt.gov/DocumentCenter/View/3019` · Ch.7 materials `https://www.burlingtonvt.gov/DocumentCenter/View/3020`
- **Great Streets BTV, City Hall Park project page** — `http://greatstreetsbtv.com/city-hall-park`
- **Wagner Hodgson, City Hall Park** — `https://wagnerhodgson.com/projects/burlington-city-hall-park/`
- **City of Burlington, street numbering ordinance** — `https://www.burlingtonvt.gov/1013/Authority-Duties`
- **Church Street Marketplace** — directory, historic tours, parking, getting around, programs & licensing, annual events, and the *Street Entertainer Rules & Regulations 2024*, *Sandwich Board Rules & Regulations 2024*, and *Regulating Outdoor Vending on Church Street* PDFs — `https://churchstmarketplace.com/`
- **Vermont Historical Society, George B. Bryan, "The Howard Opera House in Burlington," *Proceedings*, Fall 1977** — `https://vermonthistory.org/journal/misc/HowardOperaHouse.pdf`
- **Vermont Division for Historic Preservation, Head of Church Street Historic District survey form** — `https://outside.vermont.gov/agency/ACCD/ACCD_Web_Docs/_Drupal%207%20ACCD%20Website%20Document%20Library/images/CD/PlanningAtlas/HistoricDistricts/HeadOfChurchStHD.pdf`
- **UVM HP206 student building surveys** — block-by-block architectural descriptions of Church Street, by far the most detailed facade documentation available: `https://www.uvm.edu/~hp206/2018/pages/Socinski/` (Bank–College west, Howard Opera House, Leunig's) · `.../Telesca/` (Bank–College east, the marble bank) · `.../Rizer/` (Cherry–Bank east, Montgomery Ward Building) · `.../Johnson/` (College–Main east) · `.../King/` (City Hall) · `https://www.uvm.edu/~hp206/2017/pages/Henderson/index.html` (top blocks, Masonic Temple) · `https://www.uvm.edu/~hp206/2016/pages/dickerson/default.html` (City Hall, 1920s landmarks)

### Wikipedia
Church Street Marketplace · City Hall Park Historic District · Unitarian Church (Burlington, Vermont) · Ethan Allen Engine Company No. 4 · The BCA Center · Masonic Temple (Burlington, Vermont) · CityPlace Burlington

### News and reporting
- **Seven Days** — *We Spent 24 Hours on Church Street* (June 2026); *Controversy Aside, Burlington's City Hall Park Is Well Designed and Welcoming* (Nov 2020); business openings/closings coverage throughout `https://www.sevendaysvt.com/`
- **VTDigger** — vacancy rate reporting (2026-07-07); Leahy Way mural removal (2020-08-28) `https://vtdigger.org/`
- **WCAX** — Burlington Square construction status (2026-03-06, 2026-04-28); "Hands of Hope" mural (2025-05-14); Sweetwaters reopening (2026-04-23); tree lighting (2025-11-21) `https://www.wcax.com/`
- **Vermont Public** — mall redevelopment opening (2025-09-25) `https://www.vermontpublic.org/`
- **Vermont Business Magazine** — Church Street vacancy quote (2026-04-19); Main Street completion (2026-07-12)
- **Burlington City Arts** — Big Joe Burrell, Art in Public Places, the OGE four-seasons mural `https://www.burlingtoncityarts.org/`
- **American Planning Association, Great Places in America: Church Street Marketplace** — `https://www.planning.org/`
- **Burlington Business Association** — Downtown Ambassadors `https://bbavt.org/news/streetambassadorsdebut/`

### Sources that would not load
`sah-archipedia.org`, `buildingsofnewengland.com`, `sevendaysvt.com`, `hmdb.org` and `waymarking.com` all return **HTTP 403** to automated fetching. Claims sourced from them came through search-result summaries and are marked accordingly. If a human opens them in a browser, they will resolve several of the open questions below.

---

## 9. Open questions — check these before spending real time

1. **Howard Opera House corner tower.** The 1877 description gives a 28×30 ft tower at the northwest corner. **No source confirms it still stands.** Check a photo of Church & Bank before modeling a tall corner tower. Sources do *not* support a mansard roof there.
2. **Burlington Square south tower facade** — material and color are undocumented in every text source reached. Needs a photo.
3. **Leunig's awning color.** The widely repeated "red awning" could not be verified. The *facade* is verified: cream enameled steel, brown line detailing, glass block window frames.
4. **Church Street tree species.** Plans say only "existing deciduous tree." Honey locust is the visual match but is not documented for this street. The city arborist or the street-tree inventory would settle it.
5. **Brick manufacturer and exact tone spec.** Great Streets calls the product "Church Street Brick" without a spec. Field brick renders rust-red; the tri-tone palette reads rust red / slate blue-grey / buff.
6. **Café umbrella colors** — observed green, red-orange, blue, white and green-and-white striped in photos, but no spec or convention.
7. **The Leapfroggers' current location** — it was vandalized in 2002 and restored, and its placement has been publicly debated since. Which block it stands on now is unknown.
8. **Unitarian Church front detail** — portico vs. simple pedimented pavilion, number of clock faces, step count, whether there is an iron fence, and whether any traffic island exists at Pearl/Church.
9. **City Hall's "front."** Sources say it presents proper facades to *both* Church Street (east) and the park (west), with the 48-ft grand steps on the west. Photo 03 shows one of them; which one is [unsure].
10. **Whether physical no-skating signs are posted** on the mall. The ordinance only requires signage for areas where skating is specially permitted.
11. **Talent Skatepark's 2026 operating status** — conflicting sources.
12. **Manhattan Pizza's successor at Church & Main** — local data says *What Ales You*, web research says *Rincon Pizzeria and Tapas Bar*. Something is there; the name is unresolved.
13. **Cosmic Grind vs. Artemus Café at 104 Church** — local data (2026-08-02) and web research disagree. It is a café either way.
14. **A_Dog skatepark total project cost** — never published.
15. **Festival of Fools pitch locations** — the four performance pitches are real but their cross-street positions are unpublished.

### One last note on method
Where this document and the OpenStreetMap geometry disagree about a footprint or a street width, **trust OSM for shape and this document for appearance**. Where this document and a photograph disagree, **trust the photograph** — and update this file.
