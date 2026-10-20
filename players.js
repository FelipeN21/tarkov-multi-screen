// Busca de perfis de jogadores do Escape from Tarkov. Não há API pública: a do tarkov.dev exige
// um captcha (Cloudflare Turnstile) que só funciona no domínio deles. Por isso o painel abre o
// perfil no próprio tarkov.dev, numa aba nova; o endereço com o nome leva direto ao perfil.
// Pelo nome, o tarkov.dev gasta o token do captcha descobrindo o ID da conta e mostra "Turnstile
// token expired"; um F5 resolve. Pelo ID da conta (o número no fim do endereço) abre de primeira.

import { MODES, openDrawer, closeDrawer } from './tarkov-data.js';

const MAX_RECENT = 8;

const $ = (s) => document.querySelector(s);
let mode = 'pvp-season';
let recent = [];

try {
  const saved = localStorage.getItem('tela:playerGameMode');
  if (MODES[saved]) mode = saved;
  const list = JSON.parse(localStorage.getItem('tela:recentPlayers'));
  if (Array.isArray(list)) recent = list.filter((n) => typeof n === 'string' && validate(n) === '').slice(0, MAX_RECENT);
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
function renderMode() {
  for (const b of document.querySelectorAll('#playerMode button')) b.classList.toggle('on', b.dataset.mode === mode);
  $('#playerSearchLink').href = `https://tarkov.dev/players?gameMode=${mode}`;
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

// Declarada como função (e não const) porque a lista de recentes é validada logo no começo.
function isAccountId(s) {
  return /^\d{1,12}$/.test(s);
}

// Mesmas regras de nome do tarkov.dev; também aceita o ID da conta.
function validate(name) {
  if (isAccountId(name)) return '';
  if (!/^[a-zA-Z0-9_-]*$/.test(name)) return 'O nome só pode ter letras, números, - e _.';
  if (!/^[a-zA-Z0-9_-]{3,15}$|^TarkovCitizen\d{1,10}$/i.test(name)) return 'O nome tem de 3 a 15 caracteres.';
  return '';
}

// ---------- abrir o perfil ----------
function openProfile(name) {
  const url = `https://tarkov.dev/players/${mode}/${encodeURIComponent(name)}`;
  window.open(url, '_blank', 'noopener');
  status(isAccountId(name)
    ? `Abrindo o perfil da conta ${name} (${MODES[mode]}) no tarkov.dev…`
    : `Abrindo o perfil de ${name} (${MODES[mode]})… Se aparecer “Turnstile token expired”, aperte F5 na página do perfil.`);
  recent = [name, ...recent.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, MAX_RECENT);
  saveRecent();
}

$('#playerSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#playerName').value.trim();
  const error = validate(name);
  if (error) return status(error, 'warn');
  openProfile(name);
});

// ---------- buscados recentemente ----------
function saveRecent() {
  try { localStorage.setItem('tela:recentPlayers', JSON.stringify(recent)); } catch {}
  renderRecent();
}

function renderRecent() {
  $('#playerRecentBox').hidden = !recent.length;
  $('#playerRecent').replaceChildren(
    ...recent.map((name) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'recent-name';
      open.textContent = name;
      open.title = 'Abrir o perfil de novo';
      open.addEventListener('click', () => {
        $('#playerName').value = name;
        openProfile(name);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-remove';
      remove.textContent = '✕';
      remove.title = 'Tirar da lista';
      remove.addEventListener('click', () => {
        recent = recent.filter((n) => n !== name);
        saveRecent();
      });
      li.append(open, remove);
      return li;
    })
  );
}
renderRecent();
