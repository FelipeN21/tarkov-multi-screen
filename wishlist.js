// Wishlist do squad: cada pessoa lista os itens que precisa (quests, hideout) e todos da sala veem,
// para pegar para o amigo na raid. A sua lista fica salva neste navegador e vai para a sala pela
// conexão direta (sem servidor). O que chega dos outros é validado antes de aparecer.

import { openDrawer, closeDrawer } from './tarkov-data.js';
import { icon } from './icons.js';
import { quickFind } from './items.js';
import { cleanText } from './sanitize.js';

const MAX_ITEMS = 60;
const ID_RE = /^[0-9a-f]{24}$/;

const $ = (s) => document.querySelector(s);
const peers = new Map(); // peerId -> lista recebida
let net = { send: () => {}, people: () => new Map(), myId: null };
let mine = [];

// ---------- validação (vale para a sua lista e para a dos outros) ----------
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const name = typeof e.name === 'string' ? cleanText(e.name, 80) : '';
  if (!name) return null;
  return {
    id: typeof e.id === 'string' && ID_RE.test(e.id) ? e.id : null,
    name,
    count: Math.min(999, Math.max(1, Math.floor(Number(e.count)) || 1)),
    fir: !!e.fir,
  };
}
const cleanList = (list) => (Array.isArray(list) ? list.slice(0, MAX_ITEMS).map(cleanEntry).filter(Boolean) : []);
const iconUrl = (id) => (id ? `https://assets.tarkov.dev/${id}-icon.webp` : null);
const keyOf = (e) => `${e.id || e.name.toLowerCase()}:${e.fir}`;

try {
  mine = cleanList(JSON.parse(localStorage.getItem('tela:wishlist')));
} catch {}

function save() {
  try { localStorage.setItem('tela:wishlist', JSON.stringify(mine)); } catch {}
  net.send(mine);
  renderWishlist();
}

// ---------- ligação com a sala (app.js) ----------
export function connectWishlist(n) {
  net = n;
  net.send(mine);
  renderWishlist();
}
export const sendMyWishlist = (target) => net.send(mine, target);
export function receiveWishlist(peerId, data) {
  peers.set(peerId, cleanList(data));
  renderWishlist();
}
export function dropWishlist(peerId) {
  peers.delete(peerId);
  renderWishlist();
}

// Usado pelos painéis de Itens e Tasks ("+ Wishlist"). Devolve uma mensagem curta para mostrar.
export function addToWishlist(entry) {
  const e = cleanEntry(entry);
  if (!e) return 'Não foi possível adicionar.';
  const cur = mine.find((x) => keyOf(x) === keyOf(e));
  if (cur) {
    cur.count = Math.min(999, cur.count + e.count);
  } else {
    if (mine.length >= MAX_ITEMS) return `A wishlist tem no máximo ${MAX_ITEMS} itens.`;
    mine.push(e);
  }
  save();
  return `${e.count}× ${e.name} na sua wishlist.`;
}

// ---------- painel ----------
function openPanel() {
  openDrawer($('#wishPanel'), $('#wishBtn'));
  $('#wishQuery').focus();
}
const closePanel = () => closeDrawer($('#wishPanel'), $('#wishBtn'));
$('#wishBtn').addEventListener('click', () => ($('#wishPanel').hidden ? openPanel() : closePanel()));
$('#wishClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#wishPanel').hidden && closePanel());

function status(text, kind = '') {
  const s = $('#wishStatus');
  s.textContent = text;
  s.className = 'item-status ' + kind;
}

// Procurar um item para adicionar (mesma lista e mesma busca do painel de Itens; só no Enter).
$('#wishSearch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#wishQuery').value.trim();
  if (q.length < 2) return status('Digite pelo menos 2 letras.', 'warn');
  status('Buscando…');
  let found;
  try {
    found = await quickFind(q, 6);
  } catch {
    return status('Não foi possível baixar a lista de itens da tarkov.dev.', 'error');
  }
  status(found.length ? 'Escolha o item:' : `Nenhum item encontrado para “${q}”.`, found.length ? '' : 'warn');
  $('#wishFound').replaceChildren(
    ...found.map((it) => {
      const li = el('li', 'wish-found');
      li.append(thumb(it.id), el('span', 'wish-name', it.name));
      const add = el('button', 'primary', 'Adicionar');
      add.type = 'button';
      add.addEventListener('click', () => {
        status(addToWishlist({ id: it.id, name: it.name, count: 1, fir: $('#wishFir').checked }), 'ok');
        $('#wishFound').replaceChildren();
        $('#wishQuery').value = '';
      });
      li.append(add);
      return li;
    })
  );
});

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function thumb(id) {
  const box = el('span', 'wish-thumb');
  const src = iconUrl(id);
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    box.append(img);
  }
  return box;
}
function firBadge() {
  const b = el('span', 'badge fir', 'FIR');
  b.title = 'Precisa ser encontrado em incursão (Found in Raid)';
  return b;
}

export function renderWishlist() {
  const people = net.people();
  const total = mine.length + [...peers.values()].reduce((n, l) => n + l.length, 0);
  $('#wishCount').textContent = total || '';

  // Sua lista: dá para mudar a quantidade e tirar.
  const own = mine.map((e) => {
    const li = el('li', 'wish');
    const minus = el('button', 'wish-step', '−');
    minus.type = 'button';
    minus.title = 'Menos um';
    minus.addEventListener('click', () => {
      if (e.count > 1) e.count--;
      else mine = mine.filter((x) => x !== e);
      save();
    });
    const plus = el('button', 'wish-step', '+');
    plus.type = 'button';
    plus.title = 'Mais um';
    plus.addEventListener('click', () => {
      e.count = Math.min(999, e.count + 1);
      save();
    });
    const remove = el('button', 'wish-step');
    remove.type = 'button';
    remove.title = 'Tirar da lista';
    remove.setAttribute('aria-label', remove.title);
    remove.append(icon('close'));
    remove.addEventListener('click', () => {
      mine = mine.filter((x) => x !== e);
      save();
    });
    const name = el('span', 'wish-name', e.name);
    li.append(thumb(e.id), name);
    if (e.fir) li.append(firBadge());
    li.append(el('span', 'wish-controls'));
    li.lastChild.append(minus, el('span', 'wish-qty', String(e.count)), plus, remove);
    return li;
  });
  $('#wishMine').replaceChildren(...(own.length ? own : [el('li', 'wish-empty', 'Sua lista está vazia. Busque um item acima ou use “+ Wishlist” nos painéis de Itens e Tasks.')]));
  $('#wishMineCount').textContent = mine.length || '';

  // Listas dos outros: só leitura, agrupadas por pessoa.
  const groups = [...peers]
    .filter(([id, list]) => list.length && people.has(id))
    .map(([id, list]) => {
      const box = el('section', 'wish-group');
      box.append(el('h3', '', `${people.get(id).name} precisa`));
      const ul = el('ul', 'wish-list');
      for (const e of list) {
        const li = el('li', 'wish');
        li.append(thumb(e.id), el('span', 'wish-qty', `${e.count}×`), el('span', 'wish-name', e.name));
        if (e.fir) li.append(firBadge());
        ul.append(li);
      }
      box.append(ul);
      return box;
    });
  $('#wishOthers').replaceChildren(...(groups.length ? groups : [el('p', 'wish-empty', 'Ninguém mais da sala tem itens na wishlist.')]));
}
renderWishlist();
