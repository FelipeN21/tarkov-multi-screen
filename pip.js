// Janela Picture-in-Picture (Document PiP, Chrome/Edge 116+): fica por cima de todos os programas
// e mostra as telas dos amigos num layout configurável. Os vídeos da janela usam os mesmos
// MediaStreams dos quadros da página, então não há conexão nem decodificação extra.
// O som continua saindo dos quadros da página; o 🔊 daqui só liga/desliga o de lá.

export const pipSupported = 'documentPictureInPicture' in window;

const LAYOUTS = { grid: '▦ Grade', focus: '◧ Destaque', strip: '▬ Faixa' };
const NO_CROP = { x: 0, y: 0, w: 1, h: 1 };

let source = { screens: () => [], toggleSound: () => {} };
let onChange = () => {};
let win = null;
let els = null; // elementos fixos da janela: barra, palco, aviso
const cells = new Map(); // id -> quadro dentro do PiP
let prevLayout = null; // layout para voltar depois de destacar uma tela com um clique
let cropping = null;
let ignoreClickUntil = 0;

// ---------- preferências (por nome, para valer nas próximas sessões) ----------
const settings = loadSettings();

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('tela:pip')) || {}; } catch {}
  return {
    layout: LAYOUTS[s.layout] ? s.layout : 'grid',
    main: typeof s.main === 'string' ? s.main : null,
    hidden: Array.isArray(s.hidden) ? s.hidden : ['__me'], // a própria prévia começa oculta
    crops: s.crops && typeof s.crops === 'object' ? s.crops : {},
    width: s.width || 640,
    height: s.height || 360,
  };
}
function saveSettings() {
  try { localStorage.setItem('tela:pip', JSON.stringify(settings)); } catch {}
}

const keyOf = (s) => (s.self ? '__me' : s.name.trim().toLowerCase());
const nameOf = (s) => (s.self ? 'Você' : s.name);
const clamp = (v) => Math.min(1, Math.max(0, v));

function h(tag, cls, text) {
  const e = win.document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ---------- abrir / fechar ----------
// source.screens() devolve [{ id, name, stream, muted, self }]; muted é null quando não há som.
export function connectPip(src, changed) {
  source = src;
  onChange = changed;
}

export const isPipOpen = () => !!win;

export async function openPip() {
  if (!pipSupported || win) return;
  try {
    win = await documentPictureInPicture.requestWindow({ width: settings.width, height: settings.height });
  } catch (err) {
    console.warn('PiP:', err);
    return;
  }
  const doc = win.document;
  doc.title = 'Tela';
  for (const sheet of document.styleSheets) {
    const style = doc.createElement('style');
    try {
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
    } catch {
      continue;
    }
    doc.head.append(style);
  }
  doc.body.className = 'pip';
  build();

  win.addEventListener('resize', () => {
    settings.width = win.innerWidth;
    settings.height = win.innerHeight;
    saveSettings();
    refreshPip();
  });
  win.addEventListener('pagehide', () => {
    win = null;
    els = null;
    cropping = null;
    cells.clear();
    onChange();
  });
  doc.addEventListener('keydown', (e) => e.key === 'Escape' && cancelCrop());

  refreshPip();
  onChange();
}

export function closePip() {
  win?.close();
}

function build() {
  const bar = h('div', 'pip-bar');
  const layouts = {};
  for (const [k, text] of Object.entries(LAYOUTS)) {
    const b = h('button', '', text);
    b.onclick = () => {
      settings.layout = k;
      prevLayout = null;
      saveSettings();
      refreshPip();
    };
    layouts[k] = b;
    bar.append(b);
  }
  const chips = h('div', 'pip-chips');
  bar.append(h('span', 'sep'), chips);
  const stage = h('div', 'pip-stage');
  const empty = h('p', 'pip-empty');
  win.document.body.append(stage, empty, bar);
  els = { bar, layouts, chips, stage, empty };
}

// ---------- desenhar (chamado sempre que algo muda na sala) ----------
export function refreshPip() {
  if (!win) return;
  const screens = source.screens();

  for (const [k, b] of Object.entries(els.layouts)) b.classList.toggle('on', settings.layout === k);
  els.chips.replaceChildren(
    ...screens.map((s) => {
      const key = keyOf(s);
      const hidden = settings.hidden.includes(key);
      const b = h('button', hidden ? 'off' : '', nameOf(s));
      b.title = hidden ? 'Mostrar no PiP' : 'Ocultar do PiP';
      b.onclick = () => {
        settings.hidden = hidden ? settings.hidden.filter((k) => k !== key) : [...settings.hidden, key];
        saveSettings();
        refreshPip();
      };
      return b;
    })
  );

  const visible = screens.filter((s) => !settings.hidden.includes(keyOf(s)));
  const ids = new Set(visible.map((s) => s.id));
  for (const [id, c] of cells) {
    if (ids.has(id)) continue;
    if (cropping?.c === c) cancelCrop();
    c.video.srcObject = null;
    c.el.remove();
    cells.delete(id);
  }
  for (const s of visible) updateCell(s);
  arrange(visible);

  els.empty.hidden = visible.length > 0;
  els.empty.textContent = screens.length
    ? 'Todas as telas estão ocultas. Passe o mouse aqui para escolher quem aparece.'
    : 'Ninguém está compartilhando ainda.';
}

function updateCell(s) {
  let c = cells.get(s.id);
  if (!c) c = makeCell(s.id);
  c.key = keyOf(s);
  c.label.textContent = nameOf(s);
  if (c.video.srcObject !== s.stream) c.video.srcObject = s.stream;
  c.soundBtn.hidden = s.muted == null;
  c.soundBtn.textContent = s.muted ? '🔇' : '🔊';
  applyCrop(c);
}

function makeCell(id) {
  const el = h('div', 'pip-cell');
  const view = h('div', 'pip-view');
  const video = h('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  view.append(video);
  const label = h('div', 'pip-label');
  const tools = h('div', 'pip-tools');
  const soundBtn = h('button', '', '🔇');
  soundBtn.title = 'Ligar/desligar som';
  const cropBtn = h('button', '', '✂');
  cropBtn.title = 'Recortar: arraste sobre a área que quer ver (Esc cancela)';
  const resetBtn = h('button', '', '↺');
  resetBtn.title = 'Voltar a mostrar a tela inteira';
  tools.append(soundBtn, cropBtn, resetBtn);
  el.append(view, label, tools);

  const c = { id, el, view, video, label, soundBtn, resetBtn, key: '' };
  cells.set(id, c);

  video.addEventListener('resize', () => applyCrop(c)); // resolução do amigo mudou
  soundBtn.onclick = (e) => {
    e.stopPropagation();
    source.toggleSound(id);
  };
  cropBtn.onclick = (e) => {
    e.stopPropagation();
    startCrop(c);
  };
  resetBtn.onclick = (e) => {
    e.stopPropagation();
    delete settings.crops[c.key];
    saveSettings();
    applyCrop(c);
  };
  el.onclick = () => onCellClick(c);
  return c;
}

// Clicar numa tela destaca ela; clicar de novo na destacada volta ao layout anterior.
function onCellClick(c) {
  if (cropping || performance.now() < ignoreClickUntil) return;
  if (settings.layout === 'focus' && settings.main === c.key) {
    if (!prevLayout) return;
    settings.layout = prevLayout;
    prevLayout = null;
  } else {
    if (settings.layout !== 'focus') prevLayout = settings.layout;
    settings.layout = 'focus';
    settings.main = c.key;
  }
  saveSettings();
  refreshPip();
}

// Número de colunas que deixa cada tela 16:9 o maior possível na janela atual.
function bestCols(n) {
  let best = 1;
  let bestWidth = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min(win.innerWidth / cols, ((win.innerHeight / rows) * 16) / 9);
    if (w > bestWidth) {
      bestWidth = w;
      best = cols;
    }
  }
  return best;
}

function arrange(visible) {
  const st = els.stage.style;
  const n = visible.length;
  let mainId = null;
  if (settings.layout === 'focus' && n > 1) {
    mainId = (visible.find((s) => keyOf(s) === settings.main) || visible[0]).id;
    st.gridTemplateColumns = '3fr 1fr';
    st.gridTemplateRows = `repeat(${n - 1}, 1fr)`;
  } else if (settings.layout === 'strip') {
    st.gridTemplateColumns = `repeat(${n}, 1fr)`;
    st.gridTemplateRows = '1fr';
  } else {
    const cols = bestCols(n);
    st.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    st.gridTemplateRows = `repeat(${Math.ceil(n / cols)}, 1fr)`;
  }

  // A destacada vai primeiro; as outras seguem a ordem da sala.
  const ordered = mainId ? [...visible.filter((s) => s.id === mainId), ...visible.filter((s) => s.id !== mainId)] : visible;
  ordered.forEach((s, i) => {
    const c = cells.get(s.id);
    if (els.stage.children[i] !== c.el) els.stage.insertBefore(c.el, els.stage.children[i] || null);
    const isMain = s.id === mainId;
    c.el.style.gridRow = isMain ? `1 / span ${n - 1}` : '';
    c.el.style.gridColumn = isMain ? '1' : mainId ? '2' : '';
    c.video.play().catch(() => {});
  });
}

// ---------- recorte (ex.: só a bússola ou o mapa de um amigo) ----------
// O recorte fica em frações da tela (0 a 1), então vale para qualquer resolução.
function applyCrop(c) {
  const crop = settings.crops[c.key] || NO_CROP;
  const vw = c.video.videoWidth || 16;
  const vh = c.video.videoHeight || 9;
  const st = c.view.style;
  st.setProperty('--ar', (vw * crop.w) / (vh * crop.h));
  st.setProperty('--cx', crop.x);
  st.setProperty('--cy', crop.y);
  st.setProperty('--cw', crop.w);
  st.setProperty('--ch', crop.h);
  c.resetBtn.hidden = !settings.crops[c.key];
}

function startCrop(c) {
  cancelCrop();
  const layer = h('div', 'pip-crop');
  const box = h('div', 'pip-crop-box');
  box.hidden = true;
  layer.append(box, h('span', '', 'Arraste sobre a área que quer ver · Esc cancela'));
  c.view.append(layer);
  c.el.classList.add('cropping');
  cropping = { c, layer };

  let start = null;
  const rel = (e) => {
    const r = c.view.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const rect = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  layer.onclick = (e) => e.stopPropagation();
  layer.onpointerdown = (e) => {
    e.stopPropagation();
    layer.setPointerCapture(e.pointerId);
    start = rel(e);
  };
  layer.onpointermove = (e) => {
    if (!start) return;
    const r = rect(start, rel(e));
    box.hidden = false;
    Object.assign(box.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
  };
  layer.onpointerup = (e) => {
    if (!start) return;
    const r = rect(start, rel(e));
    start = null;
    ignoreClickUntil = performance.now() + 300; // o clique que termina o arraste não deve destacar a tela
    cancelCrop();
    if (r.w < 0.03 || r.h < 0.03) return;
    // O retângulo foi desenhado sobre o recorte atual: converte para frações da tela inteira.
    const cur = settings.crops[c.key] || NO_CROP;
    settings.crops[c.key] = { x: cur.x + r.x * cur.w, y: cur.y + r.y * cur.h, w: r.w * cur.w, h: r.h * cur.h };
    saveSettings();
    applyCrop(c);
  };
}

function cancelCrop() {
  if (!cropping) return;
  cropping.layer.remove();
  cropping.c.el.classList.remove('cropping');
  cropping = null;
}
