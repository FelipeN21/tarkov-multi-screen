// Spotify Jams da sala: cada pessoa cadastra o link da própria Jam, e todos veem a lista para
// entrar (abrir o link, que leva ao app do Spotify, ou copiar). Não há servidor: a Jam de cada um
// vai junto com o "estado" que a sala já troca (nome, se está transmitindo) e some quando a pessoa sai.
// Segurança: o link é validado ao cadastrar E ao receber dos outros (alguém pode mandar qualquer
// coisa mexendo no próprio navegador), e sempre remontado a partir das partes validadas.

import { icon } from './icons.js';

const MAX_LEN = 300;

// Só links https do Spotify: o de sessão em grupo (open.spotify.com/socialsession/…) e o curto
// que o botão Compartilhar gera (spotify.link/…). O domínio precisa ser exatamente esse.
export function canonicalJam(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_LEN) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (u.hostname === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?socialsession\/([A-Za-z0-9]{6,64})\/?$/.exec(u.pathname);
    return m ? `https://open.spotify.com/socialsession/${m[1]}` : null;
  }
  if (u.hostname === 'spotify.link' || u.hostname === 'spotify.app.link') {
    const m = /^\/([A-Za-z0-9]{4,32})\/?$/.exec(u.pathname);
    return m ? `https://${u.hostname}/${m[1]}` : null;
  }
  return null;
}

// O app costuma compartilhar com texto junto ("Entre na minha Jam: https://spotify.link/…").
export function extractJam(text) {
  const m = /https:\/\/[^\s<>"']+/i.exec(String(text || ''));
  return m ? canonicalJam(m[0].replace(/[).,;!?]+$/, '')) : null;
}

const $ = (s) => document.querySelector(s);
let source = { people: () => new Map(), myId: null, publish: () => {} };

export function connectJams(src) {
  source = src;
  renderJams();
}

function status(text, kind = '') {
  const s = $('#jamStatus');
  s.textContent = text;
  s.className = 'jam-status ' + kind;
}

$('#jamForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('#jamInput').value.trim();
  if (!raw) return status('Cole o link da sua Jam.', 'warn');
  const url = extractJam(raw);
  if (!url) {
    return status('Esse link não é de uma Jam do Spotify. Use o link do botão Compartilhar da Jam (spotify.link/… ou open.spotify.com/socialsession/…).', 'error');
  }
  source.publish(url);
  $('#jamInput').value = '';
  status('Sua Jam está na lista para todos da sala.', 'ok');
});

// Lembra se a seção estava aberta ou fechada.
try {
  if (localStorage.getItem('tela:jamsOpen') === '0') $('#jams').open = false;
} catch {}
$('#jams').addEventListener('toggle', () => {
  try { localStorage.setItem('tela:jamsOpen', $('#jams').open ? '1' : '0'); } catch {}
});

export function renderJams() {
  const people = source.people();
  const entries = [...people].filter(([, p]) => p.jam).sort(([a], [b]) => (a === source.myId ? -1 : b === source.myId ? 1 : 0));
  $('#jamCount').textContent = entries.length || '';
  const mine = people.get(source.myId)?.jam;
  $('#jamInput').placeholder = mine ? 'Trocar o link' : 'Link da sua Jam';

  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'jam-empty';
    empty.textContent = 'Nenhuma Jam na sala ainda.';
    $('#jamList').replaceChildren(empty);
    return;
  }
  $('#jamList').replaceChildren(
    ...entries.map(([id, p]) => {
      const isMe = id === source.myId;
      const li = document.createElement('li');
      li.className = 'jam';
      const badge = document.createElement('span');
      badge.className = 'jam-icon';
      badge.append(icon('music'));
      const text = document.createElement('span');
      text.className = 'jam-text';
      const title = document.createElement('span');
      title.className = 'jam-title';
      title.textContent = isMe ? 'Sua Jam' : `Jam de ${p.name}`;
      const host = document.createElement('span');
      host.className = 'jam-host';
      host.textContent = new URL(p.jam).hostname;
      text.append(title, host);

      const actions = document.createElement('span');
      actions.className = 'jam-actions';
      // Abrir: o link do Spotify leva ao app (ou ao player na web, se o app não estiver instalado).
      const open = document.createElement('a');
      open.className = 'jam-btn';
      open.href = p.jam;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.title = 'Entrar na Jam (abre o Spotify)';
      open.setAttribute('aria-label', open.title);
      open.append(icon('external'));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'jam-btn';
      copy.title = 'Copiar o link';
      copy.setAttribute('aria-label', copy.title);
      copy.append(icon('copy'));
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(p.jam);
          status(`Link ${isMe ? 'da sua Jam' : `da Jam de ${p.name}`} copiado.`, 'ok');
        } catch {
          prompt('Copie o link:', p.jam);
        }
      });
      actions.append(open, copy);
      if (isMe) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'jam-btn';
        remove.title = 'Tirar sua Jam da lista';
        remove.setAttribute('aria-label', remove.title);
        remove.append(icon('close'));
        remove.addEventListener('click', () => {
          source.publish(null);
          status('Sua Jam saiu da lista.');
        });
        actions.append(remove);
      }
      li.append(badge, text, actions);
      return li;
    })
  );
}
