// The story of HALCYON KEYS: Dez Calloway comes home from three years upstate to find the Undertow
// crew squeezing everything Pearl Okafor built. Seven jobs, each a list of stages the mission
// runner plays in order: travel, talk, steal, deliver, fight, hold, chase, race and escape.

export const STORY_HOOK = 'Three years upstate for a job that went sideways. Dez is back in Halcyon Keys - and the Undertow owns the tide.';

export const CAST = {
  dez: { name: 'Dez Calloway', role: 'You', color: '#ff6b5a' },
  pearl: { name: 'Pearl Okafor', role: 'Mentor', color: '#5ad8ff' },
  juno: { name: 'Juno Reyes', role: 'Wheelwoman', color: '#ff4fa3' },
  mags: { name: 'Mags Delgado', role: 'Mercado fixer', color: '#ffb347' },
  benning: { name: 'Sgt. Royce Benning', role: 'HKPD, on the take', color: '#5aa0ff' },
  silas: { name: 'Silas Grieve', role: 'Undertow boss', color: '#e05050' },
};

export const MISSIONS = [
  {
    id: 'lowtide', chapter: 1, title: 'Low Tide', giver: 'pearl', start: 'safehouse', payout: 1500, respect: 300,
    blurb: 'Pearl needs a driver. Fetch Mags from the Mercado.',
    stages: [
      { type: 'talk', lines: [['pearl', 'Look what the tide dragged in. Three years, Dez, and not one postcard.'], ['dez', 'Upstate mail is slow. You said you had work?'], ['pearl', 'Mags Delgado is waiting at the Mercado fountain. Bring her here. Quietly.']] },
      { type: 'enter', text: 'Get a ride: walk up to any car and press F' },
      { type: 'goto', at: 'market', r: 70, text: 'Drive to the Old Mercado fountain', timer: 150 },
      { type: 'talk', lines: [['mags', "Calloway! Pearl said you'd come. Move it, the Undertow has eyes on this plaza."], ['dez', 'Then let them watch us leave.']] },
      { type: 'goto', at: 'safehouse', r: 70, text: "Bring Mags back to Pearl's Bait & Tackle", timer: 150, needVehicle: true },
      { type: 'talk', lines: [['pearl', 'Still drives like the devil owes him money. Good. We have a lot of debts to collect.']] },
    ],
  },
  {
    id: 'coldcargo', chapter: 2, title: 'Cold Cargo', giver: 'pearl', start: 'safehouse', payout: 3200, respect: 450,
    blurb: 'Steal an Undertow van from Bayline Docks and bring it home in one piece.',
    stages: [
      { type: 'talk', lines: [['pearl', 'The Undertow run their product through Pier 9 in refrigerated vans.'], ['juno', "Bring me one of those vans and I'll find out where it's been. Don't scratch it."]] },
      { type: 'goto', at: 'warehouse', r: 90, text: 'Get to Pier 9 Storage in Bayline Docks', timer: 180 },
      { type: 'spawnVehicle', key: 'van', model: 'van', paint: '#e8e8e2', at: 'warehouse', offset: 40 },
      { type: 'spawnGang', key: 'yard', at: 'warehouse', count: 3, weapons: ['pistol'], spread: 140 },
      { type: 'enter', vehicle: 'van', text: 'Steal the Undertow van' },
      { type: 'wanted', level: 2 },
      { type: 'goto', at: 'safehouse', r: 70, text: "Deliver the van to Juno at the marina - keep it in one piece", timer: 170, needVehicle: 'van', keep: 'van' },
      { type: 'talk', lines: [['juno', "Cold storage, my foot. There's a ledger compartment under the floor. Somebody's paying cops."]] },
    ],
  },
  {
    id: 'undertow', chapter: 3, title: 'Undertow', giver: 'mags', start: 'market', payout: 4200, respect: 650, night: true,
    blurb: "The Undertow shook down Mags' stalls. Answer them at Club Voltage.",
    stages: [
      { type: 'talk', lines: [['mags', 'They torched three stalls last night. They drink at Club Voltage, like they own the Mile.'], ['dez', "They don't."]] },
      { type: 'goto', at: 'club', r: 80, text: 'Get to Club Voltage on Neon Mile', timer: 200 },
      { type: 'lawless', on: true },
      { type: 'spawnGang', key: 'crew', at: 'club', count: 6, weapons: ['pistol', 'smg', 'pistol'], spread: 170 },
      { type: 'talk', lines: [['silas', 'Calloway. You should have stayed in your cell. Boys - wash him out.']] },
      { type: 'kill', group: 'crew', text: 'Take out the Undertow crew' },
      { type: 'lawless', on: false },
      { type: 'escape', text: 'Lose any heat' },
      { type: 'goto', at: 'market', r: 70, text: 'Report back to Mags at the Mercado', timer: 220 },
      { type: 'talk', lines: [['mags', "The whole Mile heard that. Good. Let Grieve hear it on his island."]] },
    ],
  },
  {
    id: 'bluelights', chapter: 4, title: 'Blue Lights', giver: 'benning', start: 'police', payout: 5000, respect: 750,
    blurb: 'A crooked sergeant wants a courier stopped before he reaches the causeway.',
    stages: [
      { type: 'talk', lines: [['benning', "You're the ex-con with the ledger. Relax, I'm not here to cuff you."], ['benning', 'A courier is driving my name to Grieve right now. Wreck his car and the ledger burns with it. Go!']] },
      { type: 'enter', text: 'Get a car - fast' },
      { type: 'spawnChase', key: 'courier', model: 'coupe', paint: '#1d1f24', distance: 420 },
      { type: 'chase', key: 'courier', text: "Wreck the courier's Vespera GT", timer: 95, escape: 1700 },
      { type: 'talk', lines: [['benning', "That's the sound of my pension surviving. We're square, Calloway... for now."]] },
    ],
  },
  {
    id: 'papermoon', chapter: 5, title: 'Paper Moon', giver: 'pearl', start: 'safehouse', payout: 12000, respect: 1100,
    blurb: "Rob Halcyon Trust's night vault, where the Undertow keep their money.",
    stages: [
      { type: 'talk', lines: [['pearl', "Grieve banks at Halcyon Trust. Night vault. Juno's cut the alarms for twelve seconds - after that, the whole HKPD."], ['juno', "Twelve seconds, Dez. I'll be counting."]] },
      { type: 'goto', at: 'bank', r: 70, text: 'Get to Halcyon Trust on Neon Mile', timer: 220 },
      { type: 'lawless', on: true },
      { type: 'spawnGang', key: 'guards', at: 'bank', count: 3, weapons: ['pistol', 'shotgun'], spread: 120, team: 'guard' },
      { type: 'hold', at: 'bank', r: 55, duration: 12, text: 'Crack the vault - stay in the zone' },
      { type: 'lawless', on: false },
      { type: 'wanted', level: 3 },
      { type: 'talk', lines: [['juno', "Alarms are back! You've got the whole department coming - lose them!"]] },
      { type: 'escape', text: "Lose the cops before Juno's scanner window closes", timer: 180 },
      { type: 'goto', at: 'safehouse', r: 70, text: 'Bring the money home', timer: 240 },
      { type: 'talk', lines: [['pearl', "Twelve grand of Grieve's money, and every cent of it stolen first. Feels like justice."]] },
    ],
  },
  {
    id: 'causewayrun', chapter: 6, title: 'Causeway Run', giver: 'juno', start: 'hotel', payout: 8000, respect: 1000,
    blurb: "Beat the Undertow's racers across both causeways.",
    stages: [
      { type: 'talk', lines: [['juno', "Grieve's racers run the causeways every night. Win, and his crew stops believing in him."], ['dez', 'Then I need something fast.']] },
      { type: 'enter', text: 'Get a car for the race' },
      { type: 'race', route: 'causeway', rivals: 3, text: 'Win the Causeway Run' },
      { type: 'talk', lines: [['juno', 'You actually did it. His own crew is laughing at him. He will come for us now.']] },
    ],
  },
  {
    id: 'lastlight', chapter: 7, title: 'Last Light', giver: 'pearl', start: 'safehouse', payout: 25000, respect: 2500,
    blurb: 'Take the fight to Grieve Isle, then make the airstrip.',
    stages: [
      { type: 'talk', lines: [['pearl', "He's on his island tonight. Every guard he has. You end this, Dez, and Juno flies you out before the sirens find you."], ['dez', 'Keep the engine warm, Juno.']] },
      { type: 'goto', at: 'mansion', r: 90, text: 'Cross the Grieve Causeway to the estate', timer: 260 },
      { type: 'lawless', on: true },
      { type: 'spawnGang', key: 'estate', at: 'mansion', count: 7, weapons: ['smg', 'pistol', 'shotgun', 'rifle'], spread: 160, team: 'guard', boss: 'silas' },
      { type: 'talk', lines: [['silas', "My island, my tide. You're going under, Calloway."]] },
      { type: 'kill', group: 'estate', text: 'Take down Silas Grieve and his guards' },
      { type: 'lawless', on: false },
      { type: 'wanted', level: 4 },
      { type: 'talk', lines: [['juno', 'Half the department is on the causeway! Get to Keystone Field, hangar one!']] },
      { type: 'goto', at: 'hangar', r: 90, text: 'Reach Juno at Keystone Field hangar 1', timer: 240 },
      { type: 'talk', lines: [['pearl', 'The Keys are ours again. Go on - the sun will still be here when you come back.']] },
    ],
  },
];

/** Street race routes as grid references: [column, row] of road intersections. */
export const RACE_ROUTES = {
  causeway: { name: 'Causeway Run', points: [['b2', 'y:1'], ['b2', 'y:2592'], ['b0', 'y:2592'], ['x:last', 'y:2592'], ['x:3', 'y:2592'], ['x:3', 'y:1184'], ['x:last', 'y:1184'], ['b0', 'y:1184'], ['b2', 'y:1184']] },
  strand: { name: 'Strand Sprint', points: [['b2', 'y:2592'], ['b2', 'y:1'], ['b0', 'y:1'], ['b0', 'y:2592'], ['b1', 'y:2592'], ['b1', 'y:1']] },
  docks: { name: 'Docks Derby', points: [['x:1', 'y:last'], ['x:5', 'y:last'], ['x:5', 'y:6'], ['x:1', 'y:6'], ['x:1', 'y:last']] },
};
