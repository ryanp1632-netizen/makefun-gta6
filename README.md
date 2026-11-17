# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ryanp1632-netizen/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ryanp1632-netizen/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**HALCYON KEYS** is an original 3D open-world crime game set in a sun-soaked island city of causeways, marinas, pastel hotels and neon towers. Dez Calloway is back from three years upstate, and the Undertow crew owns everything his mentor Pearl built. Steal cars, drift up Strand Boulevard behind a low chase camera, shake five-star pursuits while the HKPD radios its units in and the helicopter pins you in its searchlight, and take the Keys back across seven story jobs. This pass rebuilt the cars (wheel arches, spoked wheels, see-through glass with a driver at the wheel, wings, light bars and liveries) and the people, dressed the streets with signals, shelters, billboards and beach kiosks, and redesigned the HUD around the story, the chase and the car. Everything (the seeded city, every building, vehicle and character, the sky, the music and the sound) is built and synthesized by code at runtime with a WebGL2 renderer written from scratch, a Canvas 2D HUD and WebAudio: no assets, libraries or build step. The classic top-down view is one key (V) away.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Checks: `node tools/simCheck.mjs` and `node tools/missionCheck.mjs` play the simulation headless, `node tools/perf3d.mjs` times the 3D renderer's per-frame JavaScript during a night police chase, `bash tools/check3d.sh` drives headless Chrome through the renderer check and the real app flow in both cameras, and `bash tools/shots.sh` re-renders the screenshots.

## Features

- **A 3D renderer of its own**: WebGL2 written from scratch (no engine). The generated city is extruded into window-grid towers with crowns and spires, pastel hotels with neon trims, terracotta hip roofs, villas, warehouses and container stacks, with rooftop AC units, tanks, pools and helipads, neon signs, lit billboards and shopfront neon; palms with swaying fronds, street lamps, beach umbrellas and sunbathers, moored boats, piers, bridge rails, dock cranes and parked planes. Static geometry is merged into per-district chunks and frustum-culled; cars and people are frustum-culled, drawn in three levels of detail and batched into one buffer every frame; sharp ground textures are repainted in small steps as you drive; and the render resolution adapts to keep the frame rate up.
- **Street life**: traffic signals on mast arms at every junction, bus shelters with lit adverts, benches, hydrants and bins, roadside billboards and beach-side boards facing the boulevard, snack kiosks, sun loungers and surfboards on Coral Strand, with invented brands throughout (Brisa Cola, Neonade, Flamingo FM, Taco Tide, Koi Koi Sushi...).
- **Cars and people**: every model has a swept body with real wheel arches, flared lips and dark wells, bumpers, grille, door lines and mirrors; five-spoke wheels that spin and steer; a greenhouse of painted pillars around see-through glass, so the seats, the steering wheel and the driver show through; headlights and tail lights that glow and brighten under braking. The Vespera GT has a wing and stripes, the Brisa SS a scoop and racing stripes, the KeyCab a lit roof sign and checker band, the HKPD Interceptor its livery, push bar, grille strobes and a red and blue light bar. People have knees and elbows that animate through walking and running, hair styles, caps and bandanas, island-print shirts, the Undertow crew in teal, officers in uniform with badges.
- **Golden-hour light**: a sky gradient with a big low sun, a warm halo and clouds, distance fog tinted by the sky, a sun shadow map with soft filtering, glass that reflects the sunset, an animated sea with a glitter path and shore foam, HDR bloom and tone mapping. The day/night cycle moves the sun; at night lamps, neon, headlight beams, lit windows and police strobes light the wet streets through up to 32 dynamic lights.
- **Cameras**: a low chase camera riding just above the roof that lags behind the car, swings out to show the flank in a drift and widens its field of view with speed; an over-the-shoulder camera on foot that turns with the mouse aim (cursor projected into the street, with a crosshair and aim assist); a cinematic orbit on the title screen; and the original top-down view on V. Anything that comes within a few metres of the lens dissolves instead of clipping.
- **A generated island city**: a seeded avenue grid on four islands joined by causeway bridges, across nine districts with their own palettes and building styles: Neon Mile towers, Deco Row hotels, Old Mercado terracotta lanes, Palmetto Heights villas, Pelican Marina, Bayline Docks, Coral Strand beach, Keystone Field airstrip and Grieve Isle.
- **Driving**: arcade physics with grip, handbrake drifts, tyre smoke, skid marks, collisions, damage, fire and explosions across eight low-poly models that roll and pitch with the physics and steer their wheels: a coupe with a wing, sedan, taxi, van, pickup, motorbike, muscle car and a police cruiser with a flashing light bar that lights the road.
- **A living street**: lane-following traffic that turns at junctions and brakes for obstacles; pedestrians who walk the sidewalks, cower and flee from gunfire.
- **Heat**: 1 to 5 wanted stars from witnessed crimes, pursuing and ramming cruisers, officers on foot, roadblocks at 3 stars, a searchlight helicopter at 4. The HUD lists every unit after you by call sign with its distance and what it is doing (RAMMING, PURSUIT, ROADBLOCK, SPOTLIGHT, SEARCHING). Lose them by leaving the search zone on the radar, or pay a Fresh Coat respray.
- **Combat**: fists, pistol, SMG, shotgun and rifle with ammo and reloads, health and armour, and enemies who use cover and shoot in bursts.
- **Story**: seven jobs with a code-drawn cast and dialogue: escorts, a getaway, a van theft, a gang shootout, a chase-down, a bank vault heist, a causeway street race and a finale on Grieve Isle. Each ends in a JOB COMPLETE screen with payout, stats and the chapter list.
- **Between jobs**: KeyCab taxi fares, street races, twenty hidden Sunset Tapes, respect levels that unlock weapons and cars, the Reef & Trigger gun shop, a safehouse garage and a penthouse to buy.
- **HUD and menus**: a story panel with the chapter, the objective in big type, a STAGE n/m bar, the next step and the timer; the HKPD response list during a chase; clock, cash, wanted stars with IN SIGHT / EVADING and a weapon slot bar with ammo; a rotating radar with the search zone and a GPS route, the district name, health, armour and respect bars; a big speed readout with vehicle condition; the dialogue box with the speaker's portrait. A full city map (M) with legend, named story venues, the GPS route and the current job, and four original radio stations of procedurally composed synthwave, dembow, lo-fi dub and electro house, each with its own playlist of invented tracks. Plus a title screen, pause, settings, and save/load with autosave after every job.

## Controls

| On foot | | Driving | |
|---|---|---|---|
| WASD | move | W / S | throttle / brake, reverse |
| Mouse, left click | aim, shoot | A / D | steer |
| Shift | sprint | Space | handbrake drift |
| R, 0-4, wheel | reload, fists / weapons | F | get out |
| F | enter or steal a vehicle | Q / E | radio station |
| E | interact (shop, safehouse) | E at a marker | respray, race, taxi shift |
| M / Esc | city map / pause | Enter | skip dialogue |
| V | 3D chase camera / classic top-down view | V | 3D chase camera / classic top-down view |

On foot in the 3D view, WASD moves relative to the camera and the camera turns toward where the mouse aims; push the cursor toward the screen edge to turn further. The 3D view needs WebGL2 (any current desktop browser); without it the game starts in the classic view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=z79n7aa6&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
