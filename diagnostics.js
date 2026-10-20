// "Testar minha conexão": em poucos segundos diz por que alguém pode não estar conectando —
// versão do site, WebRTC, relays (ponto de encontro) e tipo de rede (NAT) — com um resumo em
// português e um relatório para copiar e mandar no grupo.

import { RELAYS, APP_VERSION } from './app.js';

const $ = (s) => document.querySelector(s);
const dlg = $('#diag');
let lastReport = '';

function row(label, state, detail) {
  const li = document.createElement('li');
  li.className = 'diag-row ' + state;
  const dot = document.createElement('span');
  dot.className = 'diag-dot';
  const text = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('span');
  small.className = 'diag-detail';
  small.textContent = detail;
  text.append(strong, small);
  li.append(dot, text);
  return li;
}

// Cada relay: abre a conexão e espera até 5 s.
function testRelay(url) {
  return new Promise((resolve) => {
    let ws;
    const t0 = performance.now();
    const done = (ok) => {
      clearTimeout(timer);
      try { ws?.close(); } catch {}
      resolve({ url, ok, ms: Math.round(performance.now() - t0) });
    };
    const timer = setTimeout(() => done(false), 5000);
    try {
      ws = new WebSocket(url);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
    } catch {
      done(false);
    }
  });
}

// Tipo de rede: pergunta o endereço público a dois servidores STUN diferentes.
// - nenhum endereço público: UDP bloqueado (VPN, firewall, opção WebRTC do navegador);
// - portas públicas diferentes para a mesma porta local: NAT "simétrico" (restritivo);
// - mesma porta: rede que costuma permitir conexão direta.
async function testNat() {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] });
  pc.createDataChannel('diag');
  const cands = [];
  pc.onicecandidate = (e) => e.candidate && cands.push(e.candidate);
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r) => {
    const t = setTimeout(r, 6000);
    pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && (clearTimeout(t), r());
  });
  pc.close();
  const srflx = cands.filter((c) => c.type === 'srflx');
  const host = cands.filter((c) => c.type === 'host');
  if (!srflx.length) return { kind: 'blocked', host: host.length };
  const byLocal = new Map();
  for (const c of srflx) {
    const k = c.relatedPort;
    if (!byLocal.has(k)) byLocal.set(k, new Set());
    byLocal.get(k).add(c.port);
  }
  const symmetric = [...byLocal.values()].some((ports) => ports.size > 1);
  return { kind: symmetric ? 'symmetric' : 'open', public: srflx[0].address };
}

export async function runDiagnostics() {
  const list = $('#diagResults');
  list.replaceChildren(row('Testando…', 'wait', 'leva uns 10 segundos'));
  $('#diagSummary').textContent = '';
  $('#diagCopy').hidden = true;
  if (!dlg.open) dlg.showModal();

  const rows = [];
  const report = [`Tela ${APP_VERSION} · ${navigator.userAgent}`];
  const add = (label, state, detail) => {
    rows.push(row(label, state, detail));
    report.push(`${state === 'ok' ? 'OK ' : state === 'warn' ? '!! ' : 'XX '} ${label}: ${detail}`);
  };

  add('Versão do site', 'ok', `${APP_VERSION} — todos da sala precisam estar na mesma`);

  const webrtc = typeof RTCPeerConnection === 'function';
  add('WebRTC no navegador', webrtc ? 'ok' : 'bad', webrtc ? 'disponível' : 'indisponível: use Chrome, Edge ou Firefox atualizados');

  const [relays, nat] = await Promise.all([
    Promise.all(RELAYS.map(testRelay)),
    webrtc ? testNat().catch(() => ({ kind: 'error' })) : Promise.resolve({ kind: 'error' }),
  ]);
  const okRelays = relays.filter((r) => r.ok);
  add(
    'Ponto de encontro (relays)',
    okRelays.length >= 3 ? 'ok' : okRelays.length ? 'warn' : 'bad',
    `${okRelays.length} de ${relays.length} respondem` + (okRelays.length < relays.length ? ` (sem resposta: ${relays.filter((r) => !r.ok).map((r) => r.url.replace('wss://', '')).join(', ')})` : '')
  );

  const natText = {
    open: ['ok', 'permite conexão direta'],
    symmetric: ['warn', 'restritiva (NAT simétrico, comum em CGNAT e 4G): a conexão direta pode falhar com quem também estiver numa rede assim'],
    blocked: ['bad', 'UDP bloqueado: VPN, firewall/antivírus ou a opção WebRTC do navegador (no Opera: “Interfaces públicas e privadas padrão”)'],
    error: ['bad', 'não foi possível testar'],
  }[nat.kind];
  add('Sua rede', natText[0], natText[1]);

  const peers = document.querySelectorAll('#people li:not(.unreachable)').length - 1;
  const unreachable = document.querySelectorAll('#people li.unreachable').length;
  if (!$('#app').hidden) {
    add('Na sala', unreachable ? 'warn' : 'ok', `${Math.max(0, peers)} conectado(s)` + (unreachable ? `, ${unreachable} sem conexão com você` : ''));
  }

  list.replaceChildren(...rows);
  lastReport = report.join('\n');
  $('#diagCopy').hidden = false;

  // Resumo: o problema mais provável primeiro.
  let summary;
  if (!webrtc) summary = 'Seu navegador não tem WebRTC. Use Chrome ou Edge atualizados.';
  else if (!okRelays.length) summary = 'Nenhum relay respondeu: sua rede, antivírus ou extensão está bloqueando. Tente sem VPN/bloqueador ou em outra rede.';
  else if (nat.kind === 'blocked') summary = 'Seu navegador ou rede bloqueia a conexão direta. Desligue a VPN do navegador, ajuste a opção WebRTC ou libere o navegador no firewall/antivírus.';
  else if (nat.kind === 'symmetric') summary = 'Sua rede é restritiva: com quem também estiver numa rede assim, a conexão direta pode não se formar. Tente outra rede (outro Wi-Fi ou provedor); a solução definitiva seria um servidor TURN.';
  else summary = 'Sua conexão parece boa. Se alguém não aparece, confira se estão no mesmo link, com a mesma senha e a mesma versão — e peça para essa pessoa fazer este teste também.';
  $('#diagSummary').textContent = summary;
  report.push('Resumo: ' + summary);
  lastReport = report.join('\n');
}

$('#diagCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastReport);
    $('#diagCopy').textContent = 'Relatório copiado';
    setTimeout(() => ($('#diagCopy').textContent = 'Copiar relatório'), 2000);
  } catch {
    prompt('Copie o relatório:', lastReport);
  }
});
for (const b of document.querySelectorAll('.diag-open')) {
  b.addEventListener('click', () => {
    $('.settings').open = false;
    runDiagnostics();
  });
}
addEventListener('tela:diag', runDiagnostics); // o app.js pede o teste quando uma conexão falha
