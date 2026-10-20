// Tabela de munição: escolhe o calibre e vê dano, penetração, dano na blindagem e preço de cada
// munição, com as classes de blindagem que ela fura. Usa a mesma lista do painel de Itens (e o
// mesmo modo Season/PvP/PvE dele), então não baixa nada a mais.

import { MODES, openDrawer, closeDrawer } from './tarkov-data.js';
import { getAmmo, getItemMode, formatPrice } from './items.js';
import { addToWishlist } from './wishlist.js';

const $ = (s) => document.querySelector(s);

// Nomes de calibre como os jogadores conhecem (o resto aparece como vem dos dados).
const CALIBERS = {
  '556x45NATO': '5.56x45 NATO', '545x39': '5.45x39', '762x39': '7.62x39', '762x51': '7.62x51 NATO', '762x54R': '7.62x54R',
  '9x19PARA': '9x19 Parabellum', '9x18PM': '9x18 PM', '9x18PMM': '9x18 PMM', '9x21': '9x21', '9x39': '9x39', '366TKM': '.366 TKM',
  '12g': '12/70', '20g': '20/70', '23x75': '23x75 (KS-23)', '46x30': '4.6x30', '57x28': '5.7x28', '1143x23ACP': '.45 ACP',
  '762x25TT': '7.62x25 TT', '127x55': '12.7x55', '86x70': '.338 Lapua Magnum', '762x35': '.300 Blackout', '40x46': '40x46 (granada)',
  '40mmRU': '40mm VOG (granada)', '9x33R': '.357 Magnum', '26x75': '26x75 (sinalizador)', '68x51': '6.8x51', '127x33': '.50 AE',
  '127x99': '12.7x99 (.50 BMG)', '93x64': '9.3x64 Brenneke', '58x42': '5.8x42',
};
const caliberName = (c) => CALIBERS[c.replace(/^Caliber/, '')] || c.replace(/^Caliber/, '');

// Aproximação simples da penetração: fura bem a classe se a penetração passa de classe × 10.
function classCell(pen, cls) {
  if (pen >= cls * 10) return 'good';
  if (pen >= cls * 10 - 10) return 'some';
  return 'none';
}

let ammo = null;
let caliber = null;
try { caliber = localStorage.getItem('tela:ammoCaliber'); } catch {}

function openPanel() {
  openDrawer($('#ammoPanel'), $('#ammoBtn'));
  load();
}
const closePanel = () => closeDrawer($('#ammoPanel'), $('#ammoBtn'));
$('#ammoBtn').addEventListener('click', () => ($('#ammoPanel').hidden ? openPanel() : closePanel()));
$('#ammoClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#ammoPanel').hidden && closePanel());

function status(text, kind = '') {
  const s = $('#ammoStatus');
  s.textContent = text;
  s.className = 'item-status ' + kind;
}

async function load() {
  status('Carregando as munições…');
  try {
    ammo = await getAmmo();
  } catch {
    return status('Não foi possível baixar os dados da tarkov.dev.', 'error');
  }
  // Calibres com mais munições primeiro (os mais usados), depois por nome.
  const counts = new Map();
  for (const a of ammo) counts.set(a.ammo.caliber, (counts.get(a.ammo.caliber) || 0) + 1);
  const calibers = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || caliberName(a).localeCompare(caliberName(b)));
  if (!counts.has(caliber)) caliber = counts.has('Caliber556x45NATO') ? 'Caliber556x45NATO' : calibers[0];
  $('#ammoCaliber').replaceChildren(...calibers.map((c) => new Option(`${caliberName(c)} (${counts.get(c)})`, c)));
  $('#ammoCaliber').value = caliber;
  render();
}

$('#ammoCaliber').addEventListener('change', () => {
  caliber = $('#ammoCaliber').value;
  try { localStorage.setItem('tela:ammoCaliber', caliber); } catch {}
  render();
});

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  if (!ammo) return;
  const rows = ammo.filter((a) => a.ammo.caliber === caliber).sort((a, b) => b.ammo.pen - a.ammo.pen || b.ammo.damage - a.ammo.damage);
  status(`${rows.length} munições · preços ${MODES[getItemMode()]} · mais penetração primeiro`);
  $('#ammoRows').replaceChildren(
    ...rows.map((a) => {
      const li = el('li', 'ammo-row');
      const name = el('span', 'ammo-name');
      name.append(el('strong', '', a.short || a.name), el('span', 'ammo-sub', a.ammo.tracer ? 'traçante' : ''));
      name.title = a.name;
      const dmg = a.ammo.projectiles > 1 ? `${a.ammo.damage}×${a.ammo.projectiles}` : String(a.ammo.damage);
      const classes = el('span', 'ammo-classes');
      for (let c = 1; c <= 6; c++) {
        const cell = el('span', 'ammo-class ' + classCell(a.ammo.pen, c), String(c));
        cell.title = { good: `Fura bem classe ${c}`, some: `Às vezes fura classe ${c}`, none: `Não fura classe ${c}` }[classCell(a.ammo.pen, c)];
        classes.append(cell);
      }
      const add = el('button', 'ammo-add', '+');
      add.type = 'button';
      add.title = 'Adicionar à wishlist';
      add.setAttribute('aria-label', add.title);
      add.addEventListener('click', () => status(addToWishlist({ id: a.id, name: a.name, count: 1 }), 'ok'));
      li.append(
        name,
        el('span', 'ammo-num', dmg),
        el('span', 'ammo-num strong', String(a.ammo.pen)),
        el('span', 'ammo-num', `${a.ammo.armorDmg}%`),
        classes,
        // Sem oferta agora: usa a média de 24 h; sem as duas, provavelmente não vende no mercado.
        el('span', 'ammo-num price', a.low || a.avg ? formatPrice(a.low || a.avg) : '—'),
        add
      );
      return li;
    })
  );
}
