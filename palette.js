// Busca rápida (Ctrl+K): procura itens, tarefas, mapas e jogadores num lugar só e abre o painel
// certo já com a busca feita. Itens e tarefas são filtrados nas listas já baixadas pelos painéis,
// então digitar não faz nenhuma requisição (as listas baixam uma vez, ao abrir a busca).

import { quickFind as findItems, openItems, formatPrice } from './items.js';
import { quickFind as findTasks, openTasks } from './tasks.js';
import { findMaps, openMap } from './maps.js';
import { looksLikePlayer, openPlayer } from './players.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const dlg = $('#palette');
const input = $('#paletteQuery');
const list = $('#paletteResults');
const DEFAULT_HINT = $('#paletteHint').innerHTML;
let rows = [];
let selected = 0;
let seq = 0;
let timer;

const inRoom = () => !$('#app').hidden;

function hint(text) {
  if (text == null) $('#paletteHint').innerHTML = DEFAULT_HINT;
  else $('#paletteHint').textContent = text;
}

export function openPalette() {
  if (!inRoom() || dlg.open) return;
  input.value = '';
  rows = [];
  render();
  hint();
  dlg.showModal();
  input.focus();
  // Já vai baixando as listas (uma vez) enquanto a pessoa digita.
  findItems('').catch(() => {});
  findTasks('').catch(() => {});
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && inRoom()) {
    e.preventDefault();
    if (dlg.open) dlg.close();
    else openPalette();
  }
});
$('#paletteBtn').addEventListener('click', openPalette);

input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(update, 120);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!rows.length) return;
    highlight((selected + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(timer);
    if (rows[selected]) choose(selected);
  }
});

async function update() {
  const q = input.value.trim();
  const my = ++seq;
  if (q.length < 2) {
    rows = [];
    render();
    hint(q ? 'Digite pelo menos 2 letras.' : null);
    return;
  }
  // Mapas e jogador não dependem de download: aparecem na hora.
  const maps = findMaps(q).slice(0, 3).map((m) => ({ group: 'Mapas', icon: 'map', title: m.name, sub: 'Mapa com extrações', run: () => openMap(m.key) }));
  const player = looksLikePlayer(q) ? [{ group: 'Jogador', icon: 'user', title: `Perfil de ${q}`, sub: 'Abrir no tarkov.dev', run: () => openPlayer(q) }] : [];
  rows = [...maps, ...player];
  selected = 0;
  render();
  hint('Buscando itens e tarefas…');

  const [items, tasks] = await Promise.all([findItems(q, 5).catch(() => null), findTasks(q, 4).catch(() => null)]);
  if (my !== seq) return; // a pessoa já digitou outra coisa
  rows = [
    ...maps, // poucos e quase sempre o que se procura: primeiro
    ...(items || []).map((i) => ({
      group: 'Itens',
      icon: 'tag',
      title: i.name,
      sub: i.low ? `Mercado ${formatPrice(i.low)}` : i.trader ? `${i.trader.name} paga ${formatPrice(i.trader.price)}` : 'Sem ofertas',
      run: () => openItems(i.name),
    })),
    ...(tasks || []).map((t) => ({ group: 'Tarefas', icon: 'list', title: t.name, sub: [t.trader, t.map].filter(Boolean).join(' · '), run: () => openTasks(t.name) })),
    ...player,
  ];
  selected = 0;
  render();
  if (items === null || tasks === null) hint('Não foi possível baixar itens ou tarefas da tarkov.dev agora.');
  else hint(rows.length ? null : 'Nada encontrado.');
}

function render() {
  const out = [];
  let group = '';
  rows.forEach((r, i) => {
    if (r.group !== group) {
      group = r.group;
      const h = document.createElement('li');
      h.className = 'palette-group';
      h.textContent = group;
      out.push(h);
    }
    const li = document.createElement('li');
    li.className = 'palette-row';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === selected);
    const text = document.createElement('span');
    text.className = 'palette-text';
    const title = document.createElement('span');
    title.className = 'palette-title';
    title.textContent = r.title;
    const sub = document.createElement('span');
    sub.className = 'palette-sub';
    sub.textContent = r.sub;
    text.append(title, sub);
    li.append(icon(r.icon), text);
    li.dataset.index = i;
    li.addEventListener('mousemove', () => selected !== i && highlight(i));
    li.addEventListener('click', () => choose(i));
    out.push(li);
  });
  list.replaceChildren(...out);
  highlight(selected);
}

// Só troca a marcação (sem refazer a lista, para não perder um clique no meio do caminho).
function highlight(i) {
  selected = i;
  for (const li of list.querySelectorAll('.palette-row')) li.setAttribute('aria-selected', +li.dataset.index === i);
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  const r = rows[i];
  dlg.close();
  r.run();
}
