// Busca de tarefas (quests) do Escape from Tarkov com os dados públicos da tarkov.dev. Mostra só
// o essencial de cada tarefa: o que fazer e os itens necessários, com link para a wiki. Os cartões
// ficam em inglês, como no jogo e na wiki; a busca também aceita o nome em português.
// Como na busca de itens, a lista é baixada uma vez ao abrir o painel e a busca roda no navegador.

import { MODES, fold, safeUrl, searchText, getJSON, getOnce, openDrawer, closeDrawer, showSkeleton, clearSkeleton } from './tarkov-data.js';
import { addToWishlist } from './wishlist.js';

const MAX_RESULTS = 15;
const MAX_OPTIONS = 3; // "any of": quantas opções mostrar pelo nome

// Requisitos das tarefas Gunsmith (montar uma arma).
const BUILD_ATTRS = {
  ergonomics: 'Ergonomics',
  recoil: 'Recoil',
  weight: ['Weight', ' kg'],
  durability: ['Durability', '%'],
  magazineCapacity: 'Magazine capacity',
  effectiveDistance: ['Effective distance', ' m'],
  accuracy: 'Accuracy',
  muzzleVelocity: ['Muzzle velocity', ' m/s'],
  width: 'Width (slots)',
  height: 'Height (slots)',
};
const num = (n) => new Intl.NumberFormat('en-US').format(n);

function buildDetails(o, itemName) {
  const out = [];
  for (const [key, label] of Object.entries(BUILD_ATTRS)) {
    const a = o.buildAttributes?.[key];
    if (!a || (a.value === 0 && a.compareMethod === '>=')) continue;
    const [name, unit = ''] = Array.isArray(label) ? label : [label];
    out.push(`${name} ${a.compareMethod.replace('>=', '≥').replace('<=', '≤')} ${num(a.value)}${unit}`);
  }
  const parts = [...(o.containsAll || [])].map(itemName);
  return [out.join(' · '), parts.length ? `With: ${parts.join(', ')}` : ''].filter(Boolean);
}

const $ = (s) => document.querySelector(s);
const lists = {}; // modo -> lista de tarefas (ou uma Promise enquanto carrega)
let mode = 'pvp-season';

try {
  const saved = localStorage.getItem('tela:taskGameMode');
  if (MODES[saved]) mode = saved;
} catch {}

// ---------- abrir / fechar o painel ----------
function openPanel() {
  openDrawer($('#tasksPanel'), $('#tasksBtn'));
  $('#taskQuery').focus();
  ensureList().catch(() => {});
}
const closePanel = () => closeDrawer($('#tasksPanel'), $('#tasksBtn'));

$('#tasksBtn').addEventListener('click', () => ($('#tasksPanel').hidden ? openPanel() : closePanel()));
$('#tasksClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#tasksPanel').hidden && closePanel());

// ---------- Season / PvP / PvE ----------
function renderMode() {
  for (const b of document.querySelectorAll('#taskMode button')) b.classList.toggle('on', b.dataset.mode === mode);
}
for (const b of document.querySelectorAll('#taskMode button')) {
  b.addEventListener('click', () => {
    if (mode === b.dataset.mode) return;
    mode = b.dataset.mode;
    try { localStorage.setItem('tela:taskGameMode', mode); } catch {}
    renderMode();
    if ($('#taskQuery').value.trim()) search();
    else ensureList().catch(() => {});
  });
}
renderMode();

function status(text, kind = '') {
  const s = $('#taskStatus');
  s.textContent = text;
  s.className = 'item-status ' + kind;
}

// ---------- baixar a lista ----------
async function loadList(m) {
  const [data, en, pt, traders, mapsEn, tradersEn, itemsEn] = await Promise.all([
    getJSON(`${m}/tasks`),
    getJSON(`${m}/tasks_en`),
    getJSON(`${m}/tasks_pt`).catch(() => ({})),
    getJSON(`${m}/traders`).catch(() => ({})),
    getJSON(`${m}/maps_en`).catch(() => ({})),
    getOnce('regular/traders_en').catch(() => ({})),
    getOnce('regular/items_en'),
  ]);
  const itemName = (id) => itemsEn[`${id} Name`] || 'Item';
  const mapName = (id) => mapsEn[`${id} Name`] || '';
  const icon = (id) => `https://assets.tarkov.dev/${id}-icon.webp`;

  return Object.values(data.tasks).map((t) => {
    const name = en[t.name] || t.normalizedName;
    const namePt = pt[t.name] && pt[t.name] !== name ? pt[t.name] : '';
    const trader = tradersEn[traders[t.trader]?.name] || '';
    const map = t.map ? mapName(t.map) : '';

    // O que fazer: o texto de cada objetivo.
    const steps = t.objectives.map((o) => {
      let text = en[o.description] || '';
      if (o.count > 1 && !/^give/.test(o.type)) text += ` (${o.count}×)`;
      const details = o.type === 'buildWeapon' ? buildDetails(o, itemName) : [];
      return { text, optional: o.optional, details };
    }).filter((s) => s.text);

    // Itens necessários: o que precisa ser entregue, plantado ou usado, mais as chaves.
    const items = new Map();
    const add = (key, entry) => {
      const cur = items.get(key);
      if (cur) cur.count += entry.count;
      else items.set(key, entry);
    };
    for (const o of t.objectives) {
      if ((o.type === 'giveItem' || o.type === 'plantItem') && o.items?.length) {
        const ids = o.items;
        const tag = o.type === 'plantItem' ? 'plant' : '';
        const label = ids.length === 1
          ? itemName(ids[0])
          : `Any of: ${ids.slice(0, MAX_OPTIONS).map(itemName).join(', ')}${ids.length > MAX_OPTIONS ? ` (+${ids.length - MAX_OPTIONS})` : ''}`;
        add(`${o.type}:${ids.join()}:${!!o.foundInRaid}`, { id: ids.length === 1 ? ids[0] : null, name: label, icon: icon(ids[0]), count: o.count || 1, fir: !!o.foundInRaid, tag });
      } else if (o.type === 'giveQuestItem' && o.questItem) {
        const q = data.questItems?.[o.questItem];
        add(`quest:${o.questItem}`, { name: en[`${o.questItem} Name`] || 'Quest item', icon: safeUrl(q?.iconLink) || icon(o.questItem), count: o.count || 1, tag: 'quest item' });
      }
    }
    for (const k of t.neededKeys || []) {
      const opts = k.keys || [];
      if (!opts.length) continue;
      const label = opts.length === 1 ? itemName(opts[0]) : `One of these keys: ${opts.slice(0, MAX_OPTIONS).map(itemName).join(', ')}`;
      add(`key:${opts.join()}`, { id: opts.length === 1 ? opts[0] : null, name: label, icon: icon(opts[0]), count: 1, tag: 'key' });
    }

    return {
      name,
      namePt,
      trader,
      map,
      level: t.minPlayerLevel || 0,
      kappa: !!t.kappaRequired,
      lightkeeper: !!t.lightkeeperRequired,
      wiki: safeUrl(t.wikiLink),
      steps,
      items: [...items.values()],
      search: searchText(name, namePt, trader, map),
    };
  });
}

async function ensureList() {
  const m = mode;
  if (lists[m]) return lists[m];
  status('Baixando a lista de tarefas…');
  showSkeleton($('#taskResults'));
  lists[m] = loadList(m)
    .then((list) => {
      lists[m] = list;
      clearSkeleton($('#taskResults'));
      if (m === mode && !$('#taskResults').children.length) status(`${list.length} tarefas · digite e aperte Enter`);
      return list;
    })
    .catch((err) => {
      delete lists[m];
      clearSkeleton($('#taskResults'));
      console.warn('tarkov.dev:', err);
      status('Não foi possível baixar as tarefas da tarkov.dev. Tente de novo em alguns minutos.', 'error');
      throw err;
    });
  return lists[m];
}

// ---------- buscar (só ao apertar Enter/Buscar) ----------
$('#taskSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

let searching = false;
// Nome da tarefa (inglês ou português), trader ou mapa; primeiro pelo começo das palavras.
function match(list, raw) {
  const words = fold(raw).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(Boolean);
  let found = list.filter((t) => words.every((w) => t.search.includes(' ' + w)));
  if (!found.length) found = list.filter((t) => words.every((w) => t.search.includes(w)));
  const q = fold(raw);
  const rank = (t) => (fold(t.name) === q || fold(t.namePt) === q ? 0 : fold(t.name).startsWith(q) || fold(t.namePt).startsWith(q) ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b) || a.level - b.level || a.name.localeCompare(b.name));
}

// Para a busca rápida (Ctrl+K).
export async function quickFind(raw, n = 4) {
  const list = await ensureList();
  return raw ? match(list, raw).slice(0, n) : [];
}
export function openTasks(raw) {
  openPanel();
  $('#taskQuery').value = raw;
  search();
}

async function search() {
  const raw = $('#taskQuery').value.trim().replace(/\s+/g, ' ');
  if (raw.length < 2) return status('Digite pelo menos 2 letras.', 'warn');
  if (searching) return;
  searching = true;
  $('#taskSearch button').disabled = true;
  let list;
  try {
    list = await ensureList();
  } catch {
    return;
  } finally {
    searching = false;
    $('#taskSearch button').disabled = false;
  }

  const found = match(list, raw);
  $('#taskResults').replaceChildren(...found.slice(0, MAX_RESULTS).map(renderTask));
  $('#taskResults').scrollTop = 0;
  const modeName = MODES[mode];
  if (!found.length) status(`Nenhuma tarefa encontrada para “${raw}” (${modeName}).`, 'warn');
  else if (found.length > MAX_RESULTS) status(`${found.length} tarefas · mostrando ${MAX_RESULTS} · ${modeName}. Digite mais para filtrar.`);
  else status(`${found.length} ${found.length === 1 ? 'tarefa' : 'tarefas'} · ${modeName}`);
}

// ---------- cartão da tarefa ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderTask(t) {
  const li = el('li', 'task');

  const head = el('div', 'task-head');
  head.append(el('div', 'task-name', t.name));
  const meta = [t.trader, t.map, t.level ? `Level ${t.level}` : ''].filter(Boolean).join(' · ');
  if (meta) head.append(el('div', 'item-sub', meta));
  if (t.kappa || t.lightkeeper) {
    const badges = el('div', 'task-badges');
    if (t.kappa) badges.append(el('span', 'badge', 'Kappa'));
    if (t.lightkeeper) badges.append(el('span', 'badge', 'Lightkeeper'));
    head.append(badges);
  }
  li.append(head);

  if (t.steps.length) {
    li.append(el('h4', '', 'Objectives'));
    const ol = el('ol', 'task-steps');
    for (const s of t.steps) {
      const step = el('li', '', s.text);
      if (s.optional) step.append(el('span', 'muted', ' (optional)'));
      for (const d of s.details) step.append(el('div', 'task-detail', d));
      ol.append(step);
    }
    li.append(ol);
  }

  if (t.items.length) {
    li.append(el('h4', '', 'Required items'));
    const ul = el('ul', 'task-items');
    for (const it of t.items) {
      const row = el('li');
      const img = el('img');
      img.src = it.icon;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => (img.style.visibility = 'hidden');
      row.append(img, el('span', 'task-item-count', `${it.count}×`), el('span', 'task-item-name', it.name));
      if (it.fir) {
        const fir = el('span', 'badge fir', 'FIR');
        fir.title = 'Found in Raid';
        row.append(fir);
      }
      if (it.tag) row.append(el('span', 'badge', it.tag));
      // Itens que dá para achar na raid (um item só, não "any of"): botão para a wishlist.
      if (it.id) {
        const wish = el('button', 'wish-add small', '+');
        wish.type = 'button';
        wish.title = 'Adicionar à sua wishlist';
        wish.setAttribute('aria-label', wish.title);
        wish.addEventListener('click', () => status(addToWishlist({ id: it.id, name: it.name, count: it.count, fir: it.fir }), 'ok'));
        row.append(wish);
      }
      ul.append(row);
    }
    li.append(ul);
  }

  if (t.wiki) {
    const a = el('a', 'task-wiki', 'Open wiki ↗');
    a.href = t.wiki;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.append(a);
  }
  return li;
}
