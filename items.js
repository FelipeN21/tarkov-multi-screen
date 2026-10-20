// Busca de preços de itens do Escape from Tarkov com os dados públicos da tarkov.dev.
// A API GraphQL deles está fora do ar; o próprio site tarkov.dev usa estes arquivos JSON
// (sem documentação oficial, então podem mudar). A lista é baixada uma vez ao abrir o painel
// (~2 MB) e a busca roda no navegador: digitar não faz nenhuma requisição, e a lista só é
// baixada de novo depois de alguns minutos.

import { MODES, fold, safeUrl, searchText, getJSON, getOnce, openDrawer, closeDrawer } from './tarkov-data.js';

const MAX_RESULTS = 30;
const REFRESH_MS = 10 * 60 * 1000;

const $ = (s) => document.querySelector(s);
const lists = {}; // modo -> { time, items, updated } (ou uma Promise enquanto carrega)
let mode = 'pvp-season';

const rub = (n) => new Intl.NumberFormat('pt-BR').format(n) + ' ₽';

try {
  const saved = localStorage.getItem('tela:itemGameMode');
  if (MODES[saved]) mode = saved;
} catch {}

// ---------- abrir / fechar o painel ----------
function openPanel() {
  openDrawer($('#itemsPanel'), $('#itemsBtn'));
  $('#itemQuery').focus();
  ensureList().catch(() => {}); // já vai baixando enquanto a pessoa digita
}
const closePanel = () => closeDrawer($('#itemsPanel'), $('#itemsBtn'));

$('#itemsBtn').addEventListener('click', () => ($('#itemsPanel').hidden ? openPanel() : closePanel()));
$('#itemsClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#itemsPanel').hidden && closePanel());

// ---------- Season / PvP / PvE ----------
function renderMode() {
  for (const b of document.querySelectorAll('#itemMode button')) b.classList.toggle('on', b.dataset.mode === mode);
}
for (const b of document.querySelectorAll('#itemMode button')) {
  b.addEventListener('click', () => {
    if (mode === b.dataset.mode) return;
    mode = b.dataset.mode;
    try { localStorage.setItem('tela:itemGameMode', mode); } catch {}
    renderMode();
    if ($('#itemQuery').value.trim()) search();
    else ensureList().catch(() => {});
  });
}
renderMode();

function status(text, kind = '') {
  const s = $('#itemStatus');
  s.textContent = text;
  s.className = 'item-status ' + kind;
}

// ---------- baixar a lista ----------
async function loadList(m) {
  const [data, traders, [en, pt, tradersEn]] = await Promise.all([
    getJSON(`${m}/items`),
    getJSON(`${m}/traders`).catch(() => ({})),
    Promise.all([getOnce('regular/items_en'), getOnce('regular/items_pt').catch(() => ({})), getOnce('regular/traders_en').catch(() => ({}))]),
  ]);
  const traderName = (id) => tradersEn[traders[id]?.name] || 'Comerciante';
  let updated = '';
  // Guarda só o necessário: o arquivo original tem ~17 MB depois de aberto.
  const items = Object.values(data.items).map((i) => {
    let best = null;
    for (const s of i.sellToTrader || []) if (s.priceRUB && (!best || s.priceRUB > best.price)) best = { trader: s.trader, price: s.priceRUB };
    if (i.updated > updated) updated = i.updated;
    const name = en[i.name] || i.normalizedName;
    const short = en[i.shortName] || '';
    const namePt = pt[i.name] || '';
    return {
      name,
      short,
      namePt: namePt !== name ? namePt : '',
      search: searchText(name, short, namePt, pt[i.shortName]),
      w: i.width || 1,
      h: i.height || 1,
      icon: safeUrl(i.iconLink),
      wiki: safeUrl(i.wikiLink),
      low: i.lastLowPrice || 0,
      avg: i.avg24hPrice || 0,
      change: i.changeLast48hPercent || 0,
      trader: best && { name: traderName(best.trader), price: best.price },
    };
  });
  return { time: Date.now(), items, updated };
}

async function ensureList() {
  const cur = lists[mode];
  if (cur instanceof Promise) return cur;
  if (cur && Date.now() - cur.time < REFRESH_MS) return cur;
  const m = mode;
  status(cur ? 'Atualizando preços…' : 'Baixando a lista de itens (~2 MB, só na primeira vez)…');
  lists[m] = loadList(m)
    .then((list) => {
      lists[m] = list;
      if (m === mode && !$('#itemResults').children.length) status(readyText(list));
      return list;
    })
    .catch((err) => {
      lists[m] = cur; // mantém a lista antiga, se houver
      console.warn('tarkov.dev:', err);
      status('Não foi possível baixar os preços da tarkov.dev. Tente de novo em alguns minutos.', 'error');
      throw err;
    });
  return lists[m];
}

function readyText(list) {
  const at = list.updated ? new Date(list.updated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '?';
  return `${new Intl.NumberFormat('pt-BR').format(list.items.length)} itens · preços de ${at} · digite e aperte Enter`;
}

// ---------- buscar (só ao apertar Enter/Buscar) ----------
$('#itemSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

let searching = false;
async function search() {
  const raw = $('#itemQuery').value.trim().replace(/\s+/g, ' ');
  const words = fold(raw).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(Boolean);
  if (raw.length < 2) return status('Digite pelo menos 2 letras.', 'warn');
  if (searching) return;
  searching = true;
  $('#itemSearch button').disabled = true;
  let list;
  try {
    list = await ensureList();
  } catch {
    return;
  } finally {
    searching = false;
    $('#itemSearch button').disabled = false;
  }

  // Todas as palavras precisam aparecer (em inglês ou português, nome ou abreviação). Primeiro
  // procura no começo das palavras ("gpu" acha GPU, não "Magpul"); se não achar nada, no meio.
  let found = list.items.filter((i) => words.every((w) => i.search.includes(' ' + w)));
  if (!found.length) found = list.items.filter((i) => words.every((w) => i.search.includes(w)));
  const q = fold(raw);
  const rank = (i) => {
    if (fold(i.short) === q || fold(i.name) === q) return 0;
    if (fold(i.short).startsWith(q) || fold(i.name).startsWith(q) || fold(i.namePt).startsWith(q)) return 1;
    return 2;
  };
  found.sort((a, b) => rank(a) - rank(b) || Math.max(b.low, b.trader?.price || 0) - Math.max(a.low, a.trader?.price || 0));

  $('#itemResults').replaceChildren(...found.slice(0, MAX_RESULTS).map(renderItem));
  $('#itemResults').scrollTop = 0;
  const modeName = MODES[mode];
  if (!found.length) status(`Nenhum item encontrado para “${raw}” (${modeName}).`, 'warn');
  else if (found.length > MAX_RESULTS) status(`${found.length} itens · mostrando os ${MAX_RESULTS} primeiros · ${modeName}. Digite mais para filtrar.`);
  else status(`${found.length} ${found.length === 1 ? 'item' : 'itens'} · ${modeName}`);
}

// ---------- resultados ----------
function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'item';

  const icon = document.createElement('div');
  icon.className = 'item-icon';
  if (item.icon) {
    const img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    icon.append(img);
  }

  const info = document.createElement('div');
  info.className = 'item-info';
  const title = document.createElement(item.wiki ? 'a' : 'span');
  title.className = 'item-name';
  title.textContent = item.name;
  title.title = item.namePt || item.name;
  if (item.wiki) {
    title.href = item.wiki;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
  }
  const sub = document.createElement('div');
  sub.className = 'item-sub';
  sub.textContent = [item.short, `${item.w}×${item.h}`].filter(Boolean).join(' · ');
  info.append(title, sub);

  const prices = document.createElement('dl');
  prices.className = 'item-prices';
  const row = (label, value, cls = '') => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (cls) dd.className = cls;
    prices.append(dt, dd);
    return dd;
  };

  if (item.low) {
    const dd = row('Mercado agora', rub(item.low), 'strong');
    if (item.change) {
      const tag = document.createElement('span');
      tag.className = 'change ' + (item.change > 0 ? 'up' : 'down');
      tag.textContent = `${item.change > 0 ? '▲' : '▼'} ${Math.abs(item.change).toFixed(1)}%`;
      tag.title = 'Variação em 48 h';
      dd.append(tag);
    }
  } else {
    row('Mercado', 'sem ofertas', 'muted');
  }
  if (item.avg) row('Média 24 h', rub(item.avg));
  if (item.trader) row(`Vender p/ ${item.trader.name}`, rub(item.trader.price));
  const best = Math.max(item.low, item.trader?.price || 0);
  const slots = item.w * item.h;
  if (best && slots > 1) row('Por slot', rub(Math.round(best / slots)));

  li.append(icon, info, prices);
  return li;
}
