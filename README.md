# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ryanp1632-netizen/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ryanp1632-netizen/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**HALCYON KEYS** is an original 3D open-world crime game set in a sun-soaked island city of causeways, marinas, pastel hotels and neon towers. Dez Calloway is back from three years upstate, and the Undertow crew owns everything his mentor Pearl built. Steal cars, drift up Strand Boulevard behind a low chase camera with the HKPD on your bumper and the helicopter's searchlight on the road, shoot it out with the Undertow among the Old Mercado's market stalls at golden hour, race named rivals through checkpoint gates down rain-slick Neon Mile at dusk, and take the Keys back across seven story jobs. This pass made the side game as deep as the story: street races with lit gates, live standings, lap and gap timing and prizes; a tabbed pause screen (MAP / STATS / STORY / SETTINGS) with a % COMPLETE headline and lifetime stats kept in the save; on-foot target markers that flash on a hit; and wet streets that mirror the neon. Everything (the seeded city, every building, vehicle and character, the sky, the music and the sound) is built and synthesized by code at runtime with a WebGL2 renderer written from scratch, a Canvas 2D HUD and WebAudio: no assets, libraries or build step. The classic top-down view is one key (V) away.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Checks: `node tools/simCheck.mjs` and `node tools/missionCheck.mjs` play the simulation headless (the whole story, a side race won and one lost, the save), `node tools/perf3d.mjs` times the 3D renderer's per-frame JavaScript during a night police chase, `bash tools/check3d.sh` drives headless Chrome through the renderer check and the real app flow in both cameras (including a street race and every pause tab), and `bash tools/shots.sh` re-renders the screenshots.

## Features

- **A 3D renderer of its own**: WebGL2 written from scratch (no engine). The generated city is extruded into window-grid towers with crowns and spires, pastel hotels with neon trims, terracotta hip roofs, villas, warehouses and container stacks, with rooftop AC units, tanks, pools and helipads, neon signs, lit billboards and shopfront neon; palms with swaying fronds, street lamps, beach umbrellas and sunbathers, moored boats, piers, bridge rails, dock cranes and parked planes. Static geometry is merged into per-district chunks and frustum-culled; cars and people are frustum-culled, drawn in three levels of detail and batched into one buffer every frame; sharp ground textures are repainted in small steps as you drive; and the render resolution adapts to keep the frame rate up.
- **Street life**: traffic signals on mast arms at every junction, bus shelters with lit adverts, benches, hydrants and bins, roadside billboards and beach-side boards facing the boulevard, snack kiosks, sun loungers and surfboards on Coral Strand, with invented brands throughout (Brisa Cola, Neonade, Flamingo FM, Taco Tide, Koi Koi Sushi...).
- **Cars and people**: every model has a swept body with real wheel arches, flared lips and dark wells, bumpers, grille, door lines and mirrors; five-spoke wheels that spin and steer; a greenhouse of painted pillars around see-through glass, so the seats, the steering wheel and the driver show through; headlights and tail lights that glow and brighten under braking. The Vespera GT has a wing and stripes, the Brisa SS a scoop and racing stripes, the KeyCab a lit roof sign and checker band, the HKPD Interceptor its livery, push bar, grille strobes and a red and blue light bar. People have knees and elbows that animate through walking and running, hair styles, caps and bandanas, island-print shirts, the Undertow crew in teal, officers in uniform with badges.
- **Golden-hour light**: a sky gradient with a big low sun, a warm halo and clouds, distance fog tinted by the sky, a sun shadow map with soft filtering, glass that reflects the sunset, an animated sea with a glitter path and shore foam, HDR bloom and tone mapping. The day/night cycle moves the sun; from dusk the asphalt turns rain-slick, with puddles that mirror the sky and streaks of tail lights, lamps, light bars and race gates on the road, while lamps, neon, headlight beams, lit windows and police strobes light the streets through up to 32 dynamic lights.
- **Cameras**: a low chase camera riding just above the roof that lags behind the car, swings out to show the flank in a drift and widens its field of view with speed; an over-the-shoulder camera on foot that turns with the mouse aim (cursor projected into the street, with a crosshair and aim assist); a cinematic orbit on the title screen; and the original top-down view on V. Anything that comes within a few metres of the lens dissolves instead of clipping.
- **A generated island city**: a seeded avenue grid on four islands joined by causeway bridges, across nine districts with their own palettes and building styles: Neon Mile towers, Deco Row hotels, Old Mercado terracotta lanes, Palmetto Heights villas, Pelican Marina, Bayline Docks, Coral Strand beach, Keystone Field airstrip and Grieve Isle.
- **Driving**: arcade physics with grip, handbrake drifts, tyre smoke, skid marks, collisions, damage, fire and explosions across eight low-poly models that roll and pitch with the physics and steer their wheels: a coupe with a wing, sedan, taxi, van, pickup, motorbike, muscle car and a police cruiser with a flashing light bar that lights the road.
- **A living street**: lane-following traffic that turns at junctions and brakes for obstacles; pedestrians who walk the sidewalks, cower and flee from gunfire.
- **Heat**: 1 to 5 wanted stars from witnessed crimes, pursuing and ramming cruisers, officers on foot, roadblocks at 3 stars, a searchlight helicopter at 4 whose beam slants onto the road even in daylight, and bystanders who scatter or duck from the sirens. The HUD lists every unit after you by call sign with its distance and what it is doing (RAMMING, PURSUIT, ROADBLOCK, SPOTLIGHT, SEARCHING). Lose them by leaving the search zone on the radar, or pay a Fresh Coat respray.
- **Combat**: fists, pistol, SMG, shotgun and rifle with ammo and reloads, health and armour, enemies who use cover and shoot in bursts, glowing tracers, and on foot a red target marker with a health bar over every armed enemy of the job that flashes white with a hit marker when a round lands.
- **Story**: seven jobs with a code-drawn cast and dialogue: escorts, a getaway, a van theft, a golden-hour shakedown in the Old Mercado market and a night gunfight at Club Voltage, a chase-down, a bank vault heist, a causeway street race and a finale on Grieve Isle. Each ends in a JOB COMPLETE screen with payout, stats and the chapter list.
- **Street races**: a side activity with three routes started at their flag (E): Neon Mile Nights (two laps through the towers at dusk), the Strand Sprint and the Docks Derby, against three named rivals (RAZOR, VANTA, MANTIS) who drive the route. Lit gates span the road at every checkpoint (neon pylons, a START / CHECKPOINT n / FINISH banner, a glowing line and road flares), a countdown starts the race, and the race board shows your place in big type with the lap, checkpoint and time, the gap in seconds to the rival ahead or behind, the full standings and name tags over the rival cars. Win for cash and respect; finishing second means a rival takes it.
- **Between jobs**: KeyCab taxi fares, street races, twenty hidden Sunset Tapes, respect levels with ranks (Fresh Out to Halcyon Royalty) that unlock weapons and cars, the Reef & Trigger gun shop, a safehouse garage and a penthouse to buy.
- **Progress you can see**: the pause screen (Esc, or M for the map) has four tabs. MAP: the city map with named districts, venues, every activity, the GPS route and the police, beside a progress grid (story jobs, cash, Sunset Tapes, races won, fares, properties, cops escaped, distance driven), the respect rank with its next unlock, the current job, the legend and the chapter list. STATS: a completion ring broken down by part and every lifetime stat (top speed, accuracy, top heat, takedowns, time played...). STORY: the chapters with contacts, blurbs and payouts, and the cast. SETTINGS: volumes, camera shake and the controls. A % COMPLETE headline sits on every tab; races won, fares, escapes and distance are kept in the save.
- **HUD and menus**: a story panel with the chapter, the objective in big type, a STAGE n/m bar, the next step and the timer; the HKPD response list during a chase and the race standings during a race; clock, cash, wanted stars with IN SIGHT / EVADING and a weapon slot bar with ammo; a rotating radar with the search zone and a GPS route, the district name, health, armour and respect bars; a big speed readout with vehicle condition; the dialogue box with the speaker's portrait; four original radio stations of procedurally composed synthwave, dembow, lo-fi dub and electro house, each with its own playlist of invented tracks. Plus a title screen, settings and save/load with autosave after every job.

## Controls

| On foot | | Driving | |
|---|---|---|---|
| WASD | move | W / S | throttle / brake, reverse |
| Mouse, left click | aim, shoot | A / D | steer |
| Shift | sprint | Space | handbrake drift |
| R, 0-4, wheel | reload, fists / weapons | F | get out |
| F | enter or steal a vehicle | Q / E | radio station |
| E | interact (shop, safehouse) | E at a marker | respray, race, taxi shift |
| M / Esc | pause on the map / pause | Enter | skip dialogue |
| V | 3D chase camera / classic top-down view | V | 3D chase camera / classic top-down view |
| Paused: Q / E, Tab, 1-4 | switch tab | Paused: C, J, X | controls, abandon job, quit to title |

On foot in the 3D view, WASD moves relative to the camera and the camera turns toward where the mouse aims; push the cursor toward the screen edge to turn further. The 3D view needs WebGL2 (any current desktop browser); without it the game starts in the classic view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z79n7aa6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
