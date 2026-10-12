// Genera src/icon-data.ts con los símbolos que usa la app (sin cargar los paquetes enteros en el navegador).
// Dos familias: «g:» emblemas de game-icons.net (CC BY 3.0) para logros, bosses, premios, avatares y reinos;
// «l:» Lucide (ISC) para la interfaz (botones, navegación, calendario).
// Uso: node scripts-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const game = JSON.parse(readFileSync('node_modules/@iconify-json/game-icons/icons.json', 'utf8'));
const lucide = JSON.parse(readFileSync('node_modules/@iconify-json/lucide/icons.json', 'utf8'));

/** nombre en la app → origen. */
const MAP = {
  // ---------- Interfaz (Lucide) ----------
  'nav-hoy': 'l:sun', 'nav-misiones': 'l:scroll-text', 'nav-habitos': 'l:calendar-check', 'nav-deepwork': 'l:hourglass',
  'nav-reinos': 'l:castle', 'nav-arena': 'l:swords', 'nav-amigos': 'l:users', 'nav-gremios': 'l:shield', 'nav-personaje': 'l:user-round',
  lock: 'l:lock', unlock: 'l:lock-open', bell: 'l:bell', 'bell-ring': 'l:bell-ring', settings: 'l:settings',
  volume: 'l:volume-2', 'volume-low': 'l:volume-1', mute: 'l:volume-x', cloud: 'l:cloud', 'cloud-off': 'l:cloud-off', laptop: 'l:laptop',
  alert: 'l:triangle-alert', wrench: 'l:wrench', calendar: 'l:calendar-days', 'calendar-plus': 'l:calendar-plus', clock: 'l:clock',
  play: 'l:play', stop: 'l:square', pause: 'l:pause', check: 'l:check', pencil: 'l:pencil', repeat: 'l:repeat', list: 'l:list',
  download: 'l:download', upload: 'l:upload', timer: 'l:timer', coffee: 'l:coffee', zap: 'l:zap', camera: 'l:camera', scale: 'l:scale',
  link: 'l:link', trend: 'l:trending-up', music: 'l:music', sparkles: 'l:sparkles', 'arrow-left': 'l:arrow-left', 'arrow-right': 'l:arrow-right',
  x: 'l:x', plus: 'l:plus', trash: 'l:trash-2', 'user-plus': 'l:user-plus', 'user-check': 'l:user-check', users: 'l:users', user: 'l:user-round',
  search: 'l:search', eye: 'l:eye', 'eye-off': 'l:eye-off', 'log-out': 'l:log-out', 'log-in': 'l:log-in', send: 'l:send', mail: 'l:mail',
  'rotate-ccw': 'l:rotate-ccw', 'chevron-left': 'l:chevron-left', 'chevron-right': 'l:chevron-right', 'chevron-down': 'l:chevron-down',
  heart: 'l:heart', star: 'l:star', flag: 'l:flag', target: 'l:target', copy: 'l:copy', palette: 'l:palette', save: 'l:save',
  sliders: 'l:sliders-horizontal', info: 'l:info', moon: 'l:moon', sunrise: 'l:sunrise', 'grip': 'l:grip-vertical',
  // Tipos de evento
  'ev-bloque': 'l:clock', 'ev-examen': 'l:notebook-pen', 'ev-lanzamiento': 'l:rocket', 'ev-llamada': 'l:phone', 'ev-reunion': 'l:users', 'ev-otro': 'l:pin',
  // Sonido de fondo
  'amb-lluvia': 'l:cloud-rain', 'amb-oceano': 'l:waves', 'amb-fuego': 'l:flame', 'amb-marron': 'l:audio-waveform', 'amb-calma': 'l:moon-star', 'amb-bosque': 'l:trees',
  // Estado del día
  'energy-1': 'l:battery-warning', 'energy-2': 'l:battery-low', 'energy-3': 'l:battery-medium', 'energy-4': 'l:battery-full', 'energy-5': 'l:zap',
  'mood-1': 'l:frown', 'mood-2': 'l:annoyed', 'mood-3': 'l:meh', 'mood-4': 'l:smile', 'mood-5': 'l:laugh',

  // ---------- Emblemas (game-icons) ----------
  coin: 'g:two-coins', hourglass: 'g:hourglass', 'crossed-swords': 'g:crossed-swords', hp: 'g:hearts', trophy: 'g:trophy-cup', crown: 'g:crown',
  present: 'g:present', chest: 'g:open-treasure-chest', candle: 'g:candle-flame', 'candle-light': 'g:candle-light', shield: 'g:checked-shield',
  'round-shield': 'g:round-shield', 'laurel-crown': 'g:laurel-crown', 'medal': 'g:medal', 'ribbon-medal': 'g:ribbon-medal', 'star-medal': 'g:star-medal',
  'fleur': 'g:fleur-de-lys', 'compass-rose': 'g:compass',
  // Atributos
  'attr-voluntad': 'g:fist', 'attr-sabiduria': 'g:brain', 'attr-maestria': 'g:gear-hammer', 'attr-conexion': 'g:shaking-hands', 'attr-creacion': 'g:world',
  // Logros
  'anvil-impact': 'g:anvil-impact', 'greek-temple': 'g:greek-temple', 'breaking-chain': 'g:breaking-chain', 'sands-of-time': 'g:sands-of-time',
  infinity: 'g:infinity', 'wave-crest': 'g:wave-crest', whale: 'g:sperm-whale', atlas: 'g:atlas', vortex: 'g:vortex', lyre: 'g:lyre',
  diamond: 'g:cut-diamond', 'stone-block': 'g:stone-block', drum: 'g:drum', gears: 'g:gears', sunrise2: 'g:sunrise', owl: 'g:owl', sun: 'g:sun',
  'lightning-trio': 'g:lightning-trio', 'lightning-storm': 'g:lightning-storm', mountaintop: 'g:mountaintop', 'all-seeing-eye': 'g:all-seeing-eye',
  'ionic-column': 'g:ionic-column', trident: 'g:trident', broadsword: 'g:broadsword', anvil: 'g:anvil', 'rising-star': 'g:star-formation',
  'yin-yang': 'g:yin-yang', scroll: 'g:scroll-unfurled', 'treasure-map': 'g:treasure-map', compass: 'g:compass', 'dragon-head': 'g:dragon-head',
  'archery-target': 'g:archery-target', 'metal-bar': 'g:metal-bar', 'spartan-helmet': 'g:spartan-helmet', mountains: 'g:mountains',
  watchtower: 'g:watchtower', 'heraldic-sun': 'g:heraldic-sun', 'calendar-emblem': 'g:calendar', 'calendar-half': 'g:calendar-half-year',
  laurels: 'g:laurels', quill: 'g:quill-ink', 'open-book': 'g:open-book', 'bloody-sword': 'g:bloody-sword', 'bow-arrow': 'g:bow-arrow',
  'battle-axe': 'g:battle-axe', castle: 'g:castle',
  // Avatares
  'wood-axe': 'g:wood-axe', 'drafting': 'g:sextant', bowman: 'g:bowman', 'lightning-helix': 'g:lightning-helix',
  // Bosses
  hydra: 'g:hydra', medusa: 'g:medusa-head', minotaur: 'g:minotaur', wolf: 'g:wolf-head', boat: 'g:fishing-boat', skull: 'g:crowned-skull',
  sphinx: 'g:greek-sphinx', 'fire-breath': 'g:fire-breath', golem: 'g:metal-golem-head', cyclops: 'g:cyclops', mermaid: 'g:mermaid',
  whirlpool: 'g:whirlwind', tornado: 'g:tornado', lion: 'g:lion', scorpion: 'g:scorpion', eagle: 'g:eagle-emblem', spider: 'g:spider-alt',
  'death-skull': 'g:death-skull', ogre: 'g:ogre', zombie: 'g:shambling-zombie', shark: 'g:shark-jaws', octopus: 'g:octopus', snake: 'g:snake',
  bull: 'g:bull', 'evil-eye': 'g:beast-eye',
  // Premios
  tv: 'g:tv', gamepad: 'g:gamepad', burger: 'g:hamburger', pizza: 'g:pizza-slice', 'ice-cream': 'g:ice-cream-cone', beer: 'g:beer-stein',
  'coffee-cup': 'g:coffee-cup', sleep: 'g:night-sleep', bath: 'g:bathtub', meditation: 'g:meditation', palm: 'g:palm-tree', film: 'g:clapperboard',
  headphones: 'g:headphones', books: 'g:bookshelf', 'shopping-bag': 'g:shopping-bag', shoe: 'g:running-shoe', ball: 'g:soccer-ball',
  plane: 'g:airplane', ticket: 'g:ticket', spa: 'g:lotus', 'guitar': 'g:guitar', 'cake': 'g:cake-slice', 'mountain-climb': 'g:mountain-climbing',
  // Gremios
  'flame': 'g:flame', 'moon-emblem': 'g:moon', 'linked-rings': 'g:linked-rings', 'rock-golem': 'g:rock-golem', 'pointy-sword': 'g:pointy-sword',
  // Reinos
  cabin: 'g:wood-cabin', 'stone-tower': 'g:stone-tower', village: 'g:village', hut: 'g:hut', fort: 'g:hill-fort', tent: 'g:camping-tent',
  wheat: 'g:wheat', 'castle-flag': 'g:tower-flag',
};

const out = {};
for (const [name, src] of Object.entries(MAP)) {
  const [set, id] = src.split(':');
  const pack = set === 'g' ? game : lucide;
  const icon = pack.icons[id] ?? pack.icons[pack.aliases?.[id]?.parent];
  if (!icon) throw new Error(`No existe ${src} (${name})`);
  out[name] = [set === 'g' ? 512 : 24, icon.body.replace(/\s+/g, ' ')];
}

const body = `// Generado por scripts-icons.mjs: no editar a mano.
// Emblemas de game-icons.net (CC BY 3.0, Lorc, Delapouite y colaboradores) e iconos de Lucide (ISC).
export const ICONS = ${JSON.stringify(out, null, 0).replace(/\],"/g, '],\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')} as const;

export type IconName = keyof typeof ICONS;
`;
writeFileSync('src/icon-data.ts', body);
console.log(Object.keys(out).length, 'iconos,', body.length, 'bytes');
