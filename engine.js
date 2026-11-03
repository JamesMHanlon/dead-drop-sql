// Dead Drop SQL — game engine (world generation, clues, rooms, bots). Runs in the browser; also loadable from Node for simulations.
(function () {
const CLUE_INTERVAL_MS = 35000;
const WRONG_LOCKOUT_MS = 20000;

// ---------- seeded RNG ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const FIRST = ['Ada','Bram','Cora','Dmitri','Edie','Felix','Greta','Hugo','Iris','Jonah','Kit','Lena','Milo','Nadia','Otis','Pia','Quinn','Rosa','Silas','Tess','Ulric','Vera','Wes','Xena','Yuri','Zora','Arlo','Bea','Cal','Dora','Emil','Faye','Gus','Hazel','Ivo','June','Knox','Lux','Mae','Nico'];
const LAST = ['Ashdown','Blackwood','Crane','Dunmore','Ellery','Finch','Garrow','Holloway','Ingram','Jessop','Kettle','Lark','Marlowe','Northcott','Oakes','Pembry','Quill','Rook','Sable','Thorne','Underhill','Vance','Whitlock','Yarrow','Zell'];
const HAIR = ['black','brown','blonde','red','grey','white','auburn','bald'];
const EYES = ['brown','blue','green','hazel','grey','amber'];
const JOBS = ['locksmith','barista','accountant','taxi driver','nurse','librarian','mechanic','journalist','chef','dock worker','pharmacist','teacher','courier','florist','electrician','pawnbroker'];
const STREETS = ['Gaslight Row','Mercer Lane','Harrow Street','Vine Court','Coldwater Ave','Pike Street','Lantern Way','Quarry Road','Mill Lane','Ferris Square'];
const MAKES = ['Volvo','Ford','Fiat','Saab','Mini','Skoda','Peugeot','Honda'];
const COLORS = ['black','white','silver','red','blue','green','yellow','maroon'];
const SHOPS = ['Night Owl Diner','Rook & Pawn','Pike St Pharmacy','Corner Deli','Blue Lamp Bar','Harrow Hardware','Velvet Cinema','Fern Florists','Quarry Fuel','Lantern Books'];

function generateWorld(seed) {
  const r = rng(seed);
  const citizens = [], vehicles = [], calls = [], txns = [], checkins = [];
  const used = new Set();
  const N = 90;
  for (let id = 1; id <= N; id++) {
    let first, last;
    do { first = pick(r, FIRST); last = pick(r, LAST); } while (used.has(first + last));
    used.add(first + last);
    citizens.push({ id, first_name: first, last_name: last, age: int(r, 19, 78), height_cm: int(r, 152, 198),
      hair_colour: pick(r, HAIR), eye_colour: pick(r, EYES), occupation: pick(r, JOBS),
      street: pick(r, STREETS), house_no: int(r, 1, 140) });
  }
  const plates = new Set();
  for (const c of citizens) {
    const n = r() < 0.8 ? 1 : (r() < 0.5 ? 0 : 2);
    for (let k = 0; k < n; k++) {
      let p; do { p = String.fromCharCode(65 + int(r, 0, 25), 65 + int(r, 0, 25), 65 + int(r, 0, 25)) + '-' + int(r, 100, 999); } while (plates.has(p));
      plates.add(p);
      vehicles.push({ plate: p, owner_id: c.id, make: pick(r, MAKES), colour: pick(r, COLORS), year: int(r, 1988, 2024) });
    }
  }
  let cid = 1;
  for (let i = 0; i < 260; i++) {
    const a = int(r, 1, N); let b; do { b = int(r, 1, N); } while (b === a);
    calls.push({ id: cid++, caller_id: a, receiver_id: b, day: int(r, 1, 14), hour: int(r, 0, 23), duration_sec: int(r, 5, 1800) });
  }
  let tid = 1;
  for (let i = 0; i < 420; i++) {
    txns.push({ id: tid++, citizen_id: int(r, 1, N), shop: pick(r, SHOPS), day: int(r, 1, 14), hour: int(r, 7, 23), amount: Math.round((2 + r() * 180) * 100) / 100 });
  }
  let kid = 1;
  for (let i = 0; i < 200; i++) {
    checkins.push({ id: kid++, citizen_id: int(r, 1, N), location: pick(r, ['Central Station','Harbour Gate','City Library','Iron Gym','Riverside Park','Old Market']), day: int(r, 1, 14), hour: int(r, 0, 23) });
  }
  return { citizens, vehicles, calls, txns, checkins };
}

function buildClues(world, target, r) {
  const own = (list, key) => id => list.filter(x => x[key] === id);
  const carsOf = own(world.vehicles, 'owner_id'), txOf = own(world.txns, 'citizen_id'), camOf = own(world.checkins, 'citizen_id');
  const callsOf = id => world.calls.filter(x => x.caller_id === id || x.receiver_id === id);
  const partners = id => callsOf(id).map(x => x.caller_id === id ? x.receiver_id : x.caller_id);
  const byId = id => world.citizens.find(x => x.id === id);
  const spend = id => txOf(id).reduce((s, x) => s + x.amount, 0);
  const T = target, id = T.id, v = carsOf(id), t = txOf(id), k = camOf(id), c = callsOf(id);
  const clue = (text, test) => ({ text, test });

  // HARD — need JOINs, GROUP BY or cross-referencing tables, and each only narrows the field a bit
  const hard = [];
  if (c.length) {
    const job = byId(pick(r, partners(id))).occupation;
    hard.push(clue(`Phone records: at some point the subject was on the phone with a ${job}.`,
      x => partners(x.id).some(p => byId(p).occupation === job)));
    const cols = partners(id).flatMap(p => carsOf(p).map(cv => cv.colour));
    if (cols.length) { const col = pick(r, cols);
      hard.push(clue(`The subject has spoken on the phone with someone who owns a ${col} vehicle.`,
        x => partners(x.id).some(p => carsOf(p).some(cv => cv.colour === col)))); }
    const n = c.length, lo = n <= 2 ? 1 : n <= 4 ? 3 : n <= 7 ? 5 : 8, hi = lo === 1 ? 2 : lo === 3 ? 4 : lo === 5 ? 7 : 99;
    hard.push(clue(hi === 99 ? `The subject appears in 8 or more phone calls (made or received).` : `The subject appears in between ${lo} and ${hi} phone calls (made or received).`,
      x => { const m = callsOf(x.id).length; return m >= lo && m <= hi; }));
  }
  if (t.length) {
    const s = spend(id), lo = Math.floor(s / 250) * 250;
    hard.push(clue(`Bank records: the subject's total card spending is between £${lo} and £${lo + 250}.`,
      x => { const m = spend(x.id); return m >= lo && m < lo + 250; }));
    const shop = pick(r, t).shop, big = Math.max(...t.map(x => x.amount)) >= 100;
    hard.push(clue(`The subject is a customer of ${shop}, and their biggest single card payment anywhere was ${big ? "£100 or more" : "under £100"}.`,
      x => { const tx = txOf(x.id); return tx.some(y => y.shop === shop) && (Math.max(...tx.map(y => y.amount)) >= 100) === big; }));
  }
  if (k.length) {
    const loc = pick(r, k).location, many = t.length >= 5;
    hard.push(clue(`The subject has been caught on CCTV at ${loc} and has made ${many ? '5 or more' : 'fewer than 5'} card payments.`,
      x => camOf(x.id).some(cm => cm.location === loc) && (txOf(x.id).length >= 5) === many));
  }
  if (v.length) {
    const old = v[0].year < 2006;
    hard.push(clue(`The subject owns a vehicle built ${old ? 'before 2006' : 'in 2006 or later'}.`,
      x => carsOf(x.id).some(cv => old ? cv.year < 2006 : cv.year >= 2006)));
  }

  // MEDIUM — simpler lookups that still need linking back to a citizen
  const mid = [];
  if (v.length) { const x = pick(r, v); mid.push(clue(`The subject was spotted getting into a ${x.colour} ${x.make}.`, y => carsOf(y.id).some(cv => cv.colour === x.colour && cv.make === x.make))); }
  if (t.length) { const x = pick(r, t); mid.push(clue(`Card activity: the subject paid at ${x.shop} on day ${x.day}.`, y => txOf(y.id).some(tx => tx.shop === x.shop && tx.day === x.day))); }
  if (k.length) { const x = pick(r, k); mid.push(clue(`CCTV places the subject at ${x.location} on day ${x.day}.`, y => camOf(y.id).some(cm => cm.location === x.location && cm.day === x.day))); }
  const dec = Math.floor(T.age / 10) * 10;
  mid.push(clue(`The subject is in their ${dec}s.`, y => Math.floor(y.age / 10) * 10 === dec));
  mid.push(clue(`Employment record: the subject works as a ${T.occupation}.`, y => y.occupation === T.occupation));

  // EASY — straight off the citizens table, getting sharper
  const tall = T.height_cm >= 175;
  const easy = [
    clue(`A witness says the subject has ${T.hair_colour === 'bald' ? 'no hair (bald)' : T.hair_colour + ' hair'}.`, y => y.hair_colour === T.hair_colour),
    clue(`The subject's eye colour is logged as ${T.eye_colour}.`, y => y.eye_colour === T.eye_colour),
    clue(`The subject is ${tall ? 'at least 175 cm' : 'under 175 cm'} tall.`, y => (y.height_cm >= 175) === tall),
    clue(`The subject lives somewhere on ${T.street}.`, y => y.street === T.street),
    v.length ? clue(`Partial number plate recovered: ${v[0].plate.slice(0, 2)}?-${v[0].plate.slice(4, 5)}??`, y => carsOf(y.id).some(cv => cv.plate.slice(0, 2) === v[0].plate.slice(0, 2) && cv.plate[4] === v[0].plate[4]))
             : clue(`The subject has no registered vehicle.`, y => !carsOf(y.id).length),
    clue(`The subject's surname begins with "${T.last_name[0]}".`, y => y.last_name[0] === T.last_name[0]),
    clue(`The subject's first name begins with "${T.first_name[0]}".`, y => y.first_name[0] === T.first_name[0]),
  ];
  const tag = (tier, list) => list.map(c => ({ tier, ...c }));
  return [...tag('hard', shuffle(r, hard).slice(0, HARD_COUNT)), ...tag('medium', shuffle(r, mid)), ...tag('easy', easy)];
}

const HARD_COUNT = 4;

// ---------- room engine ----------
// Runs in the host's browser (or locally for bot games).
// players: [{ agent, bot? }]; emit(playerIndex, event, data) delivers an event to that player.
const AGENTS = ['KESTREL','MAGPIE','HERON','JACKDAW','OSPREY','WREN','SHRIKE','CORVID','NIGHTJAR','PLOVER'];
const pub = c => ({ tier: c.tier, text: c.text });   // strip the test function before sending

function createRoom(players, emit) {
  const room = { players, state: 'lobby' };
  const send = (p, ev, data) => emit(players.indexOf(p), ev, data);
  const other = p => players.find(x => x !== p);

  function start() {
    const seed = Math.floor(Math.random() * 1e9), r = rng(seed ^ 0xBEEF);
    room.world = generateWorld(seed);
    const eligible = room.world.citizens.filter(c => room.world.txns.some(t => t.citizen_id === c.id));
    const [a, b] = shuffle(r, eligible);
    players[0].identity = a; players[1].identity = b;
    players.forEach((p, i) => {
      p.clues = buildClues(room.world, players[1 - i].identity, r);
      p.clueIdx = 2; p.lockedUntil = 0; p.wrong = 0; p.tried = new Set();
    });
    room.state = 'playing'; room.startedAt = Date.now();
    players.forEach((p, i) => send(p, 'start', { world: room.world, you: p.identity, agent: p.agent, rival: players[1 - i].agent,
      clues: p.clues.slice(0, p.clueIdx).map(pub), totalClues: p.clues.length, interval: CLUE_INTERVAL_MS }));
    players.filter(p => p.bot).forEach(botConsider);
    room.timer = setInterval(() => players.forEach(p => releaseClue(p, 'scheduled')), CLUE_INTERVAL_MS);
  }

  function releaseClue(p, why) {
    if (room.state !== 'playing' || p.clueIdx >= p.clues.length) return;
    const clue = p.clues[p.clueIdx++];
    send(p, 'clue', { clue: pub(clue), why, n: p.clueIdx });
    send(other(p), 'rival', { clues: p.clueIdx, total: p.clues.length });
    if (p.bot) botConsider(p);
  }

  function end(winner, reason) {
    if (room.state === 'over') return;
    room.state = 'over'; clearInterval(room.timer); players.forEach(p => clearTimeout(p.botTimer));
    players.forEach((p, i) => send(p, 'over', {
      youWon: p === winner, reason, yourIdentity: p.identity, rivalIdentity: players[1 - i].identity,
      secs: Math.round((Date.now() - room.startedAt) / 1000) }));
  }

  function accuse(i, name) {
    const p = players[i];
    if (room.state !== 'playing') return { error: 'Not in an active case.' };
    if (Date.now() < p.lockedUntil) return { error: 'Warrant desk locked.', lockMs: p.lockedUntil - Date.now() };
    const target = other(p).identity;
    const guess = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (guess === `${target.first_name} ${target.last_name}`.toLowerCase() || guess === String(target.id)) {
      end(p, `Agent ${p.agent} unmasked their rival.`); return { ok: true };
    }
    p.lockedUntil = Date.now() + WRONG_LOCKOUT_MS; p.wrong++;
    send(other(p), 'rivalwrong', { guess: String(name).slice(0, 60) });
    releaseClue(other(p), 'rival filed a bad warrant');
    return { ok: false, lockMs: WRONG_LOCKOUT_MS };
  }

  function botConsider(bot) {
    if (bot.botTimer || room.state !== 'playing') return;
    const cfg = BOTS[bot.bot], ms = 1000 * (cfg.think[0] + Math.random() * (cfg.think[1] - cfg.think[0]));
    bot.botTimer = setTimeout(() => {
      bot.botTimer = null;
      if (room.state !== 'playing') return;
      if (Date.now() < bot.lockedUntil) { bot.botTimer = setTimeout(() => { bot.botTimer = null; botConsider(bot); }, bot.lockedUntil - Date.now()); return; }
      const known = bot.clues.slice(0, Math.max(1, bot.clueIdx - (bot.clueIdx >= bot.clues.length ? 0 : cfg.lag)));
      const cand = room.world.citizens.filter(c => c.id !== bot.identity.id && !bot.tried.has(c.id) && known.every(k => k.test(c)));
      if (cand.length && cand.length <= cfg.guessAt) {
        const g = pick(Math.random, cand); bot.tried.add(g.id);
        if (!accuse(players.indexOf(bot), `${g.first_name} ${g.last_name}`).ok) botConsider(bot);
      }
    }, ms);
  }

  return { start, accuse, end, players, get state() { return room.state; } };
}

// ---------- bot ----------
// think: seconds it spends "running queries" after new intel; guessAt: how many suspects it will gamble between;
// lag: how many of its newest clues it hasn't worked through yet
const BOTS = {
  rookie:    { label: 'Rookie',    think: [20, 35], guessAt: 1, lag: 2 },
  detective: { label: 'Detective', think: [20, 30], guessAt: 1, lag: 1 },
  inspector: { label: 'Inspector', think: [10, 20], guessAt: 2, lag: 0 },
};

function twoAgents() { const a = pick(Math.random, AGENTS); let b; do { b = pick(Math.random, AGENTS); } while (b === a); return [a, b]; }

const DeadDrop = { createRoom, generateWorld, buildClues, rng, shuffle, BOTS, twoAgents };
if (typeof module !== 'undefined') module.exports = DeadDrop; else window.DeadDrop = DeadDrop;
})();
