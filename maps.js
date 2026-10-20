// Mapas do Escape from Tarkov com as extrações. As imagens são mapas 2D da comunidade (créditos
// abaixo), baixadas do tarkov.dev e guardadas na pasta maps/ do site. Para atualizar um mapa,
// troque o arquivo em maps/ (veja o README).

import { fold, openDrawer, closeDrawer } from './tarkov-data.js';

const MAPS = [
  { key: 'customs', name: 'Customs', author: 'monkimonkimonk', link: 'https://www.reddit.com/user/monkimonkimonk/' },
  { key: 'factory', name: 'Factory', author: 're3mr', link: 'https://reemr.se' },
  { key: 'ground-zero', name: 'Ground Zero', author: 'xTycho', link: 'https://www.reddit.com/user/Tychodelouw/' },
  { key: 'interchange', name: 'Interchange', author: 'Lorathor', link: 'https://www.reddit.com/user/Lorathor6/' },
  { key: 'labs', name: 'The Lab', author: 'monkimonkimonk', link: 'https://www.reddit.com/user/monkimonkimonk/' },
  { key: 'labyrinth', name: 'The Labyrinth', author: 're3mr', link: 'https://reemr.se' },
  { key: 'lighthouse', name: 'Lighthouse', author: 'Jindouz', link: 'https://www.reddit.com/user/Jindouz' },
  { key: 'reserve', name: 'Reserve', author: 'Jindouz', link: 'https://www.reddit.com/user/Jindouz' },
  { key: 'shoreline', name: 'Shoreline', author: 'Jindouz, a partir do mapa de monkimonkimonk', link: 'https://www.reddit.com/user/Jindouz' },
  { key: 'streets', name: 'Streets of Tarkov', author: 'Jindouz', link: 'https://www.reddit.com/user/Jindouz' },
  { key: 'terminal', name: 'Terminal', author: 're3mr', link: 'https://reemr.se' },
  { key: 'woods', name: 'Woods', author: 'Jindouz', link: 'https://www.reddit.com/user/Jindouz' },
  { key: 'icebreaker', name: 'Icebreaker', author: 're3mr', link: 'https://reemr.se' },
  { key: 'transits', name: 'Transições', author: 're3mr', link: 'https://reemr.se' },
];
const MAX_ZOOM = 2; // até 2× o tamanho real da imagem
const ZOOM_STEP = 1.25;

const $ = (s) => document.querySelector(s);
const viewer = $('#mapViewer');
const img = $('#mapImage');
let current = null;
let view = { scale: 1, x: 0, y: 0, fitted: true };

// ---------- abrir / fechar o painel ----------
function openPanel() {
  openDrawer($('#mapsPanel'), $('#mapsBtn'));
  if (!current) {
    let saved = null;
    try { saved = localStorage.getItem('tela:map'); } catch {}
    show(MAPS.find((m) => m.key === saved) || MAPS[0]);
  } else {
    fit();
  }
}
const closePanel = () => closeDrawer($('#mapsPanel'), $('#mapsBtn'));

$('#mapsBtn').addEventListener('click', () => ($('#mapsPanel').hidden ? openPanel() : closePanel()));
$('#mapsClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#mapsPanel').hidden && closePanel());

// ---------- escolher o mapa ----------
$('#mapList').replaceChildren(
  ...MAPS.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.name;
    b.dataset.key = m.key;
    b.addEventListener('click', () => show(m));
    return b;
  })
);

function show(map) {
  current = map;
  try { localStorage.setItem('tela:map', map.key); } catch {}
  for (const b of $('#mapList').children) b.classList.toggle('on', b.dataset.key === map.key);
  const credit = $('#mapCredit');
  const a = document.createElement('a');
  a.href = map.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = map.author;
  credit.replaceChildren(`Mapa ${map.name} por `, a, ' · via tarkov.dev · arraste para mover, use a roda do mouse ou os botões para o zoom');

  const src = `maps/${map.key}.webp`;
  // Mesma imagem já carregada: o navegador não avisa "carregou" de novo, então só reajusta.
  if (img.getAttribute('src') === src && img.complete && img.naturalWidth) {
    $('#mapLoading').hidden = true;
    img.hidden = false;
    fit();
    return;
  }
  $('#mapLoading').textContent = 'Carregando o mapa…';
  $('#mapLoading').hidden = false;
  img.hidden = true;
  img.src = src;
}

// Para a busca rápida (Ctrl+K).
export const findMaps = (raw) => MAPS.filter((m) => fold(m.name).includes(fold(raw)) || m.key.includes(fold(raw)));
export function openMap(key) {
  openDrawer($('#mapsPanel'), $('#mapsBtn'));
  show(MAPS.find((m) => m.key === key) || MAPS[0]);
}

img.addEventListener('load', () => {
  $('#mapLoading').hidden = true;
  img.hidden = false;
  fit();
});
img.addEventListener('error', () => {
  $('#mapLoading').textContent = 'Não foi possível carregar este mapa.';
});

// ---------- zoom e arrastar ----------
const fitScale = () => Math.min(viewer.clientWidth / img.naturalWidth, viewer.clientHeight / img.naturalHeight);

// Mantém a imagem dentro da área: centralizada se for menor, sem sobrar borda se for maior.
function clamp() {
  const w = img.naturalWidth * view.scale;
  const h = img.naturalHeight * view.scale;
  const vw = viewer.clientWidth;
  const vh = viewer.clientHeight;
  view.x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, view.x));
  view.y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, view.y));
}

function apply() {
  clamp();
  img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function fit() {
  if (!img.naturalWidth || !viewer.clientWidth) return;
  view = { scale: fitScale(), x: 0, y: 0, fitted: true };
  apply();
}

// Zoom mantendo parado o ponto (px, py) da tela, como num mapa de verdade.
function zoomAt(factor, px = viewer.clientWidth / 2, py = viewer.clientHeight / 2) {
  if (!img.naturalWidth) return;
  const scale = Math.min(MAX_ZOOM, Math.max(fitScale(), view.scale * factor));
  view.x = px - ((px - view.x) * scale) / view.scale;
  view.y = py - ((py - view.y) * scale) / view.scale;
  view.scale = scale;
  view.fitted = false;
  apply();
}

const local = (e) => {
  const r = viewer.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

viewer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = local(e);
  zoomAt(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, p.x, p.y);
}, { passive: false });

// Os botões de zoom ficam dentro da área do mapa: não contam como arrastar nem duplo clique.
const onButtons = (e) => e.target.closest('.map-zoom');

viewer.addEventListener('dblclick', (e) => {
  if (onButtons(e)) return;
  const p = local(e);
  zoomAt(2, p.x, p.y);
});

// Arrastar com o mouse ou um dedo; pinça com dois dedos.
const pointers = new Map();
let pinch = null;
viewer.addEventListener('pointerdown', (e) => {
  if (onButtons(e)) return;
  viewer.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  viewer.classList.add('dragging');
});
viewer.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt(dist / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.dist = dist;
  } else if (pointers.size === 1) {
    view.x += p.x - prev.x;
    view.y += p.y - prev.y;
    view.fitted = false;
    apply();
  }
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) viewer.classList.remove('dragging');
};
viewer.addEventListener('pointerup', release);
viewer.addEventListener('pointercancel', release);

$('#mapZoomIn').addEventListener('click', () => zoomAt(ZOOM_STEP * ZOOM_STEP));
$('#mapZoomOut').addEventListener('click', () => zoomAt(1 / (ZOOM_STEP * ZOOM_STEP)));
$('#mapFit').addEventListener('click', fit);

// Se a janela mudar de tamanho, reajusta (ou só reposiciona, se a pessoa já deu zoom).
new ResizeObserver(() => (view.fitted ? fit() : apply())).observe(viewer);
