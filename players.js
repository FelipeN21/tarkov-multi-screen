// Busca de perfis de jogadores do Escape from Tarkov. Não há API pública: a do tarkov.dev exige
// um captcha (Cloudflare Turnstile) que só funciona no domínio deles, então o perfil abre lá.
// Só o tarkov.dev consegue trocar o nome pelo ID da conta, e abrir o perfil pelo nome no endereço
// falha ("Turnstile token expired": o captcha só vale uma vez). Por isso:
//  - com um nome, o painel copia o nome e abre a busca do tarkov.dev (ela abre o perfil pelo ID);
//  - com um ID ou o link do perfil, abre o perfil direto, e guarda nome + ID nos recentes.

import { MODES, openDrawer, closeDrawer } from './tarkov-data.js';

const MAX_RECENT = 8;

const $ = (s) => document.querySelector(s);
let mode = 'pvp-season';
let recent = []; // [{ name, id }] (um dos dois pode faltar)
let pendingName = ''; // último nome mandado para a busca: o próximo link colado é dele

// Declaradas como funções (e não const) porque a lista de recentes é lida logo no começo.
function isAccountId(s) {
  return /^\d{1,12}$/.test(s);
}
function isName(s) {
  return /^[a-zA-Z0-9_-]{3,15}$|^TarkovCitizen\d{1,10}$/i.test(s);
}

try {
  const saved = localStorage.getItem('tela:playerGameMode');
  if (MODES[saved]) mode = saved;
  const list = JSON.parse(localStorage.getItem('tela:recentPlayers'));
  if (Array.isArray(list)) {
    recent = list
      .map((e) => (typeof e === 'string' ? (isAccountId(e) ? { id: e } : { name: e }) : e)) // versão antiga: só texto
      .filter((e) => e && (isName(e.name || '') || isAccountId(e.id || '')))
      .slice(0, MAX_RECENT);
  }
} catch {}

// ---------- abrir / fechar o painel ----------
function openPanel() {
  openDrawer($('#playersPanel'), $('#playersBtn'));
  $('#playerName').focus();
}
const closePanel = () => closeDrawer($('#playersPanel'), $('#playersBtn'));

$('#playersBtn').addEventListener('click', () => ($('#playersPanel').hidden ? openPanel() : closePanel()));
$('#playersClose').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#playersPanel').hidden && closePanel());

// ---------- Season / PvP / PvE ----------
const searchUrl = (m) => `https://tarkov.dev/players?gameMode=${m}`;

function renderMode() {
  for (const b of document.querySelectorAll('#playerMode button')) b.classList.toggle('on', b.dataset.mode === mode);
  $('#playerSearchLink').href = searchUrl(mode);
}
for (const b of document.querySelectorAll('#playerMode button')) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    try { localStorage.setItem('tela:playerGameMode', mode); } catch {}
    renderMode();
  });
}
renderMode();

function status(text, kind = '') {
  const s = $('#playerStatus');
  s.textContent = text;
  s.className = 'item-status ' + kind;
}

// ---------- entender o que foi digitado ----------
// Aceita: nome · ID da conta · link do perfil · nome seguido de ID ou link ("Pestily 1234567").
function parse(raw) {
  const link = /tarkov\.dev\/players?\/(?:(regular|pve|pvp-season)\/)?(\d{1,12})(?:[/?#]|$)/i;
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { error: 'Digite um nome, um ID ou o link do perfil.' };
  const idOf = (s) => {
    const m = link.exec(s);
    if (m) return { id: m[2], mode: m[1]?.toLowerCase() };
    return isAccountId(s) ? { id: s } : null;
  };
  if (parts.length === 1) {
    const id = idOf(parts[0]);
    if (id) return { ...id, fromLink: !isAccountId(parts[0]) };
    if (!/^[a-zA-Z0-9_-]*$/.test(parts[0])) return { error: 'O nome só pode ter letras, números, - e _.' };
    if (!isName(parts[0])) return { error: 'O nome tem de 3 a 15 caracteres.' };
    return { name: parts[0] };
  }
  const id = parts.length === 2 && isName(parts[0]) && idOf(parts[1]);
  if (id) return { name: parts[0], ...id };
  return { error: 'Use só o nome, só o ID/link, ou “nome ID”.' };
}

// ---------- abrir ----------
function remember(entry) {
  const same = (e) => (entry.id && e.id === entry.id) || (entry.name && e.name?.toLowerCase() === entry.name.toLowerCase());
  const old = recent.find(same);
  const merged = { name: entry.name || old?.name, id: entry.id || old?.id };
  recent = [merged, ...recent.filter((e) => !same(e) && !(merged.id && e.id === merged.id))].slice(0, MAX_RECENT);
  try { localStorage.setItem('tela:recentPlayers', JSON.stringify(recent)); } catch {}
  renderRecent();
}

function openById(id, name, m = mode) {
  window.open(`https://tarkov.dev/players/${m}/${id}`, '_blank', 'noopener');
  status(`Abrindo o perfil ${name ? `de ${name} ` : ''}(conta ${id}, ${MODES[m]}) no tarkov.dev…`);
}

// Pelo nome: o tarkov.dev só consegue achar o jogador na busca dele. Copia o nome e abre a busca.
async function searchByName(name) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(name);
    copied = true;
  } catch {}
  window.open(searchUrl(mode), '_blank', 'noopener');
  pendingName = name;
  status(
    `${copied ? `Nome “${name}” copiado.` : `Copie o nome “${name}”.`} Na busca do tarkov.dev, aperte Ctrl+V, clique em Search e no jogador. ` +
      'Depois copie o endereço do perfil e cole aqui para salvar o ID: da próxima vez abre direto.'
  );
  remember({ name });
}

$('#playerSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = parse($('#playerName').value);
  if (input.error) return status(input.error, 'warn');

  if (input.id) {
    // Link colado logo depois de buscar um nome: é o perfil desse nome.
    const name = input.name || (input.fromLink ? pendingName : '') || recent.find((r) => r.id === input.id)?.name || '';
    if (input.fromLink) pendingName = '';
    openById(input.id, name, input.mode || mode);
    remember({ name, id: input.id });
    if (name && (input.fromLink || input.name)) status(`Salvo: ${name} = conta ${input.id}. Da próxima vez, é só clicar no nome abaixo.`);
    $('#playerName').value = '';
    return;
  }
  const known = recent.find((r) => r.id && r.name?.toLowerCase() === input.name.toLowerCase());
  if (known) {
    openById(known.id, known.name);
    remember(known);
  } else {
    searchByName(input.name);
  }
});

// ---------- buscados recentemente ----------
function renderRecent() {
  $('#playerRecentBox').hidden = !recent.length;
  $('#playerRecent').replaceChildren(
    ...recent.map((entry) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'recent-name';
      open.textContent = entry.name || entry.id;
      if (entry.name && entry.id) {
        const tag = document.createElement('span');
        tag.className = 'recent-id';
        tag.textContent = 'ID';
        open.append(tag);
      }
      open.title = entry.id ? `Abrir o perfil (conta ${entry.id})` : 'Buscar no tarkov.dev (ainda sem o ID salvo)';
      open.addEventListener('click', () => {
        if (entry.id) {
          openById(entry.id, entry.name);
          remember(entry);
        } else {
          searchByName(entry.name);
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-remove';
      remove.textContent = '✕';
      remove.title = 'Tirar da lista';
      remove.addEventListener('click', () => {
        recent = recent.filter((e) => e !== entry);
        try { localStorage.setItem('tela:recentPlayers', JSON.stringify(recent)); } catch {}
        renderRecent();
      });
      li.append(open, remove);
      return li;
    })
  );
}
renderRecent();
