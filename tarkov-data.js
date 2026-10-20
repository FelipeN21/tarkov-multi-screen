// Partes comuns dos painéis do Escape from Tarkov (Itens, Players, Tasks): os arquivos JSON da
// tarkov.dev e o abrir/fechar dos painéis laterais.

const BASE = 'https://json.tarkov.dev';

// Modos de jogo da tarkov.dev (cada um com dados próprios). O Season é o padrão.
export const MODES = { 'pvp-season': 'Season', regular: 'PvP', pve: 'PvE' };

export const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : null);
// Texto de busca: começa com espaço para dar para procurar pelo começo das palavras (" gpu").
export const searchText = (...parts) => ' ' + fold(parts.join(' ')).replace(/[^a-z0-9.]+/g, ' ');

export async function getJSON(path) {
  // no-cache: o servidor manda guardar por 8 dias; assim o navegador sempre confere se mudou.
  const res = await fetch(`${BASE}/${path}`, { cache: 'no-cache', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data;
}

// Arquivos que não mudam durante a sessão (nomes de itens, comerciantes): baixa uma vez só,
// mesmo que mais de um painel peça.
const once = new Map();
export function getOnce(path) {
  if (!once.has(path)) {
    once.set(path, getJSON(path).catch((err) => {
      once.delete(path);
      throw err;
    }));
  }
  return once.get(path);
}

// Só um painel lateral aberto por vez.
export function openDrawer(panel, button) {
  for (const d of document.querySelectorAll('.drawer')) d.hidden = true;
  for (const b of document.querySelectorAll('.drawer-btn')) b.classList.remove('on');
  panel.hidden = false;
  button.classList.add('on');
}
export function closeDrawer(panel, button) {
  panel.hidden = true;
  button.classList.remove('on');
}
