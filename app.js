// Cada pessoa que compartilha abre uma conexão WebRTC direta (P2P) com cada espectador.
// Não há servidor próprio: o Trystero usa relays públicos (Nostr) só para as pessoas da sala
// se encontrarem e trocarem as mensagens de negociação. O vídeo nunca passa por eles.
import { joinRoom, selfId } from './vendor/trystero.js';
import { pipSupported, connectPip, openPip, closePip, isPipOpen, refreshPip } from './pip.js';
import { icon } from './icons.js';
import { connectJams, renderJams, canonicalJam } from './jams.js';
import { connectWishlist, receiveWishlist, dropWishlist, sendMyWishlist, renderWishlist } from './wishlist.js';
import { cleanText } from './sanitize.js';

const APP_ID = 'tela-compartilhar-tela-v1';
// Aparece no rodapé, nos ajustes e no "Sobre": ajuda a saber se o navegador está com a versão nova.
export const APP_VERSION = '2026.10.20';

// STUN descobre o IP público. Se algum amigo não conseguir conectar (4G, rede de faculdade…),
// adicione um servidor TURN aqui, por exemplo:
// { urls: 'turn:servidor:3478', username: 'usuario', credential: 'senha' }
const RTC_CONFIG = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  bundlePolicy: 'max-bundle',
};

const $ = (s) => document.querySelector(s);

// Taxa de bits máxima por qualidade. O WebRTC reduz sozinho se a rede não aguentar.
// Squad e Leve: para várias pessoas compartilhando ao mesmo tempo (cada uma envia uma cópia por amigo).
const QUALITY = {
  squad: { width: 1280, height: 720, fps: 60, bitrate: 4_000_000 },
  light: { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  720: { width: 1280, height: 720, fps: 60, bitrate: 6_000_000 },
  1080: { width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 },
  1440: { width: 2560, height: 1440, fps: 60, bitrate: 20_000_000 },
  0: { width: 0, height: 0, fps: 60, bitrate: 25_000_000 },
};

let room;
let stateAction;
let sigAction;
let wishAction;
const myId = selfId;
let myName;
const rtcConfig = RTC_CONFIG;
let localStream = null;
let sidCounter = 0;
const people = new Map(); // id -> { name, sharing }
const sendPcs = new Map(); // id do espectador -> RTCPeerConnection (eu transmitindo)
const recvs = new Map(); // id de quem transmite -> { pc, sid, stream, tile, prev }
const tiles = new Map(); // id -> elementos do quadro de vídeo

// Processa mensagens e ações em ordem, para a negociação nunca se atropelar.
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch((err) => console.error(err)));

// ---------- preferências salvas ----------
function load(key) {
  try { return localStorage.getItem('tela:' + key); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem('tela:' + key, value); } catch {}
}

const roomKey = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);

// Nome de sala aleatório difícil de adivinhar: 16 caracteres sem letras parecidas (0/o, 1/l/i),
// ~79 bits. Sem senha, o nome da sala é o único segredo.
function randomRoom() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => abc[b % abc.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

// A senha é "esticada" com PBKDF2 antes de virar chave. As mensagens criptografadas ficam em
// relays públicos; sem isso, quem soubesse o nome da sala poderia testar bilhões de senhas por
// segundo. Com 600 mil rodadas, cada tentativa custa o mesmo que 600 mil.
async function stretchPassword(secret, roomName) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(APP_ID + ':' + roomName), iterations: 600_000 },
    base,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

$('#name').value = load('name') || '';
$('#room').value = decodeURIComponent(location.hash.slice(1)) || randomRoom();
// A senha não vai no link; o site lembra a última usada em cada sala, só neste navegador.
const fillPassword = () => ($('#password').value = load('pw:' + roomKey($('#room').value)) || '');
fillPassword();
$('#room').addEventListener('change', fillPassword);
for (const id of ['quality', 'mode', 'codec']) {
  const v = load(id);
  if (v && [...$('#' + id).options].some((o) => o.value === v)) $('#' + id).value = v;
}
if (load('audio') === '0') $('#audio').checked = false;

// ---------- entrar na sala ----------
$('#join').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (room) return;
  myName = cleanText($('#name').value, 32) || 'Anônimo';
  const roomName = roomKey($('#room').value);
  if (!roomName) return;
  const secret = $('#password').value;
  save('name', myName);
  save('pw:' + roomName, secret);
  history.replaceState(null, '', '#' + encodeURIComponent(roomName));

  // A negociação entre os PCs é criptografada com o nome da sala + a senha. Os relays não
  // conseguem ler, e quem tiver a senha errada não consegue se conectar com ninguém da sala.
  const joinBtn = $('#join button');
  joinBtn.disabled = true;
  joinBtn.textContent = 'Entrando…';
  const password = secret ? await stretchPassword(secret, roomName) : roomName;
  room = joinRoom({ appId: APP_ID, password, rtcConfig }, roomName, {
    onJoinError: (err) => {
      // Os dois lados recebem esse erro: quem errou a senha e quem já estava na sala.
      if (/password/i.test(err.error)) {
        showBanner(
          'Alguém tentou se conectar com uma senha diferente da sua. Se quem errou foi você, recarregue a página e confira a senha.',
          'OK',
          () => ($('#banner').hidden = true)
        );
      } else {
        showBanner('Erro ao entrar na sala: ' + err.error, 'Recarregar', () => location.reload());
      }
    },
  });
  stateAction = room.makeAction('state');
  sigAction = room.makeAction('sig');
  // Mensagens com formato errado são descartadas antes do limite, para não tomarem o lugar das válidas.
  stateAction.onMessage = (data, { peerId }) => data && typeof data === 'object' && !Array.isArray(data) && stateIn(data, peerId);
  sigAction.onMessage = (data, { peerId }) => enqueue(() => onSignal(peerId, data));
  // Wishlist em um canal próprio (a lista pode ter dezenas de itens).
  wishAction = room.makeAction('wish');
  wishAction.onMessage = (data, { peerId }) => Array.isArray(data) && wishIn(data, peerId);
  room.onPeerJoin = (peerId) => {
    sendState(peerId);
    sendMyWishlist(peerId);
  };
  room.onPeerLeave = (peerId) => enqueue(() => onPeerLeave(peerId));
  addEventListener('pagehide', () => room.leave());

  people.set(myId, { name: myName, sharing: false, jam: null });
  connectWishlist({
    send: (list, target = null) => wishAction.send(list, { target }).catch(() => {}),
    people: () => people,
    myId,
  });
  connectJams({
    people: () => people,
    myId,
    publish: (url) => {
      people.get(myId).jam = url;
      sendState();
      renderJams();
    },
  });
  renderPeople();

  $('#roomName').textContent = roomName + (secret ? ' 🔒' : '');
  $('#roomName').title = secret ? 'Sala com senha' : '';
  $('#noPassword').hidden = !!secret;
  $('#join').hidden = true;
  $('#app').hidden = false;
  measureTools();

  // Ao trocar de aba, o Chrome pode abrir o PiP sozinho (como no Google Meet).
  try {
    navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
      if ([...tiles.keys()].some((id) => id !== 'me')) openPip().catch((err) => console.warn('PiP:', err));
    });
  } catch {}

  if (!navigator.mediaDevices?.getDisplayMedia) {
    $('#share').disabled = true;
    $('#share').title = 'Este navegador/dispositivo não permite compartilhar a tela (você ainda pode assistir).';
  }
});

// Cada pessoa pode mandar no máximo uma atualização por segundo de estado (nome, transmissão, Jam)
// e de wishlist. Se mandar mais, vale só a última: o spam fica de fora, sem perder o estado final.
// (As mensagens de conexão WebRTC não passam por aqui: elas chegam em rajadas normais.)
function perPeerThrottle(fn, ms = 1000) {
  const peers = new Map();
  const handle = (data, peerId) => {
    let s = peers.get(peerId);
    if (!s) peers.set(peerId, (s = { last: 0, timer: null, data: null }));
    s.data = data;
    if (s.timer) return;
    const run = () => {
      s.timer = null;
      s.last = Date.now();
      fn(peerId, s.data);
    };
    const wait = s.last + ms - Date.now();
    if (wait <= 0) run();
    else s.timer = setTimeout(run, wait);
  };
  // Quem saiu da sala: descarta o que estava esperando (senão a pessoa "voltaria" na lista).
  handle.forget = (peerId) => {
    clearTimeout(peers.get(peerId)?.timer);
    peers.delete(peerId);
  };
  return handle;
}
const stateIn = perPeerThrottle((peerId, data) => enqueue(() => onState(peerId, data)));
const wishIn = perPeerThrottle((peerId, data) => receiveWishlist(peerId, data));

// JSON ida e volta transforma RTCSessionDescription/RTCIceCandidate em objetos simples.
const signal = (to, data) => sigAction.send(JSON.parse(JSON.stringify(data)), { target: to }).catch(() => {});

// Nome e "está compartilhando?" de cada um. Enviado ao conhecer alguém e quando muda.
function sendState(target = null) {
  stateAction.send({ name: myName, sharing: !!localStream, jam: people.get(myId)?.jam || null }, { target }).catch(() => {});
}

async function onState(peerId, data) {
  if (!data || typeof data !== 'object') return; // mensagem estranha de outro PC: ignora
  const isNew = !people.has(peerId);
  // A Jam vem de outro PC: só entra se for mesmo um link do Spotify (validada de novo aqui).
  people.set(peerId, { name: cleanText(data.name, 32) || 'Anônimo', sharing: !!data.sharing, jam: canonicalJam(data.jam) });
  const tile = tiles.get(peerId);
  if (tile) {
    tile.label.textContent = people.get(peerId).name;
    refreshPip();
  }
  if (!data.sharing) closeRecv(peerId);
  renderPeople();
  if (isNew && localStream) await startSendTo(peerId);
}

function onPeerLeave(peerId) {
  stateIn.forget(peerId);
  wishIn.forget(peerId);
  people.delete(peerId);
  dropWishlist(peerId);
  closeSend(peerId);
  closeRecv(peerId);
  renderPeople();
}

// ---------- transmitir ----------
const currentQuality = () => QUALITY[$('#quality').value];

function captureConstraints() {
  const q = currentQuality();
  const video = { frameRate: { ideal: q.fps, max: q.fps } };
  if (q.width) {
    video.width = { max: q.width };
    video.height = { max: q.height };
  }
  return video;
}

$('#share').addEventListener('click', () => (localStream ? stopShare() : startShare()));

// ---------- áudio extra (ex.: TeamSpeak via cabo virtual) ----------
let captureCleanup = []; // o que precisa ser parado ao encerrar a transmissão

// Sem permissão de microfone o navegador esconde os nomes dos dispositivos.
async function listAudioInputs(askPermission) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  if (askPermission && devices.some((d) => !d.label)) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    } catch {}
  }
  const select = $('#extraAudio');
  const current = select.value || load('extraAudio') || '';
  select.replaceChildren(new Option('Nenhum', ''));
  for (const d of devices) {
    if (d.deviceId === 'default' || d.deviceId === 'communications') continue;
    select.append(new Option(d.label || 'Entrada de áudio', d.deviceId));
  }
  select.value = [...select.options].some((o) => o.value === current) ? current : '';
}

listAudioInputs(false);
$('#extraAudio').addEventListener('pointerdown', () => listAudioInputs(true), { once: true });
$('#extraAudio').addEventListener('change', () => save('extraAudio', $('#extraAudio').value));
navigator.mediaDevices?.addEventListener?.('devicechange', () => listAudioInputs(false));

async function captureExtraAudio() {
  const tracks = [];
  const extraId = $('#extraAudio').value;
  if (extraId) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: extraId },
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      tracks.push(...s.getAudioTracks());
    } catch (err) {
      alert('Não foi possível capturar o áudio extra: ' + err.message);
    }
  }
  return tracks;
}

// Junta várias fontes num único canal de áudio. Com uma fonte só, usa ela direto (sem atraso extra).
function mixAudio(tracks) {
  if (tracks.length <= 1) return tracks[0];
  const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
  captureCleanup.push(() => ctx.close());
  return dest.stream.getAudioTracks()[0];
}

async function startShare() {
  let display;
  try {
    // getDisplayMedia primeiro: ele precisa do clique do usuário "fresco".
    display = await navigator.mediaDevices.getDisplayMedia({
      video: captureConstraints(),
      // Sem processamento de voz: é áudio do sistema, não microfone.
      audio: $('#audio').checked
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : false,
      // Tela inteira: áudio do PC todo. Janela: só o áudio daquela janela. Aba: só o da aba.
      systemAudio: 'include',
      windowAudio: 'window',
      // Não captura o som desta própria página (as telas dos amigos), para não dar eco.
      restrictOwnAudio: true,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (err) {
    if (err.name !== 'NotAllowedError') alert('Não foi possível capturar a tela: ' + err.message);
    return;
  }

  const videoTrack = display.getVideoTracks()[0];
  if ($('#audio').checked && !display.getAudioTracks().length && videoTrack.getSettings().displaySurface === 'window') {
    showBanner(
      'Este navegador não enviou o áudio da janela. Para ter áudio, compartilhe a tela inteira ou atualize o Chrome/Edge.',
      'OK',
      () => ($('#banner').hidden = true)
    );
  }
  const sources = [...display.getAudioTracks(), ...(await captureExtraAudio())];
  captureCleanup = sources.map((t) => () => t.stop());
  const audioTrack = mixAudio(sources);
  localStream = new MediaStream(audioTrack ? [videoTrack, audioTrack] : [videoTrack]);
  for (const id of ['audio', 'extraAudio']) $('#' + id).disabled = true;

  videoTrack.contentHint = $('#mode').value;
  videoTrack.addEventListener('ended', stopShare); // botão "Parar" do próprio navegador

  const tile = makeTile('me', 'Você (prévia)', false);
  tile.video.srcObject = new MediaStream([videoTrack]);
  refreshPip();

  $('#share').textContent = 'Parar de compartilhar';
  $('#share').className = 'danger';
  people.get(myId).sharing = true;
  renderPeople();
  sendState();

  enqueue(async () => {
    for (const id of people.keys()) if (id !== myId) await startSendTo(id);
  });
}

function stopShare() {
  if (!localStream) return;
  localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  captureCleanup.forEach((fn) => fn());
  captureCleanup = [];
  for (const id of ['audio', 'extraAudio']) $('#' + id).disabled = false;
  for (const id of [...sendPcs.keys()]) closeSend(id);
  removeTile('me');
  $('#share').textContent = 'Compartilhar tela';
  $('#share').className = 'primary';
  people.get(myId).sharing = false;
  renderPeople();
  sendState();
}

async function startSendTo(peerId) {
  if (!localStream) return;
  closeSend(peerId);
  const pc = new RTCPeerConnection(rtcConfig);
  pc.sid = ++sidCounter;
  sendPcs.set(peerId, pc);

  pc.onicecandidate = (e) => e.candidate && signal(peerId, { dir: 'toViewer', sid: pc.sid, candidate: e.candidate });
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' && sendPcs.get(peerId) === pc) {
      setTimeout(() => enqueue(() => sendPcs.get(peerId) === pc && startSendTo(peerId)), 1000);
    }
  };

  const q = currentQuality();
  for (const track of localStream.getTracks()) {
    // streams: [] = áudio e vídeo sem grupo de sincronização labial.
    // Assim o navegador não atrasa o vídeo para "esperar" o áudio.
    const transceiver = pc.addTransceiver(track, {
      direction: 'sendonly',
      streams: [],
      sendEncodings: [
        track.kind === 'video'
          ? { maxBitrate: q.bitrate, maxFramerate: q.fps, priority: 'high', networkPriority: 'high' }
          : { maxBitrate: 160_000, priority: 'high', networkPriority: 'high' },
      ],
    });
    if (track.kind === 'video') preferCodec(transceiver);
  }

  await pc.setLocalDescription(await pc.createOffer());
  signal(peerId, { dir: 'toViewer', sid: pc.sid, sdp: pc.localDescription });
  await applyParams(pc);
}

// Ajustes do codificador: taxa de bits, 60 fps e o que sacrificar quando a rede apertar.
async function applyParams(pc) {
  const q = currentQuality();
  const motion = $('#mode').value === 'motion';
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    Object.assign(params.encodings[0], {
      maxBitrate: q.bitrate,
      maxFramerate: q.fps,
      priority: 'high',
      networkPriority: 'high',
    });
    // Fluidez: mantém os fps e baixa a resolução. Nitidez: mantém a resolução e baixa os fps.
    params.degradationPreference = motion ? 'maintain-framerate' : 'maintain-resolution';
    try {
      await sender.setParameters(params);
    } catch (err) {
      console.warn('setParameters:', err);
    }
  }
}

function preferCodec(transceiver) {
  if (!transceiver.setCodecPreferences || !RTCRtpReceiver.getCapabilities) return;
  const want = 'video/' + $('#codec').value.toLowerCase();
  const rank = (c) => {
    const mime = c.mimeType.toLowerCase();
    if (mime === want) return 0;
    if (/rtx|red|ulpfec|flexfec/.test(mime)) return 2;
    return 1;
  };
  const codecs = [...RTCRtpReceiver.getCapabilities('video').codecs].sort((a, b) => rank(a) - rank(b));
  try {
    transceiver.setCodecPreferences(codecs);
  } catch (err) {
    console.warn('setCodecPreferences:', err);
  }
}

function closeSend(peerId) {
  sendPcs.get(peerId)?.close();
  sendPcs.delete(peerId);
}

// Mudar configurações durante a transmissão
for (const id of ['quality', 'mode', 'codec']) {
  $('#' + id).addEventListener('change', () => save(id, $('#' + id).value));
}
$('#audio').addEventListener('change', () => save('audio', $('#audio').checked ? '1' : '0'));

$('#quality').addEventListener('change', async () => {
  if (!localStream) return;
  await localStream.getVideoTracks()[0].applyConstraints(captureConstraints()).catch(console.warn);
  for (const pc of sendPcs.values()) applyParams(pc);
});
$('#mode').addEventListener('change', () => {
  if (!localStream) return;
  localStream.getVideoTracks()[0].contentHint = $('#mode').value;
  for (const pc of sendPcs.values()) applyParams(pc);
});
$('#codec').addEventListener('change', () => {
  if (!localStream) return;
  enqueue(async () => {
    for (const id of [...sendPcs.keys()]) await startSendTo(id);
  });
});

// ---------- assistir ----------
async function onSignal(from, data) {
  if (data.dir === 'toViewer') {
    if (data.sdp) return acceptOffer(from, data.sdp, data.sid);
    const r = recvs.get(from);
    if (data.candidate && r?.sid === data.sid) await r.pc.addIceCandidate(data.candidate).catch(() => {});
  } else if (data.dir === 'toSender') {
    const pc = sendPcs.get(from);
    if (!pc || pc.sid !== data.sid) return; // resposta de uma conexão antiga
    if (data.sdp) await pc.setRemoteDescription({ type: data.sdp.type, sdp: startBitrate(data.sdp.sdp) });
    else if (data.candidate) await pc.addIceCandidate(data.candidate).catch(() => {});
  }
}

async function acceptOffer(from, sdp, sid) {
  recvs.get(from)?.pc.close();
  const pc = new RTCPeerConnection(rtcConfig);
  const tile = makeTile(from, people.get(from)?.name || '?', true);
  const stream = new MediaStream();
  const r = { pc, sid, stream, tile, prev: null };
  recvs.set(from, r);
  tile.video.srcObject = stream;
  tile.stats.textContent = 'Conectando…';

  pc.onicecandidate = (e) => e.candidate && signal(from, { dir: 'toSender', sid, candidate: e.candidate });
  pc.ontrack = (e) => {
    // Pede ao navegador o menor buffer possível antes de exibir os quadros.
    try { e.receiver.jitterBufferTarget = 0; } catch {}
    try { e.receiver.playoutDelayHint = 0; } catch {}
    stream.addTrack(e.track);
    tile.video.srcObject = stream;
    tile.video.play().catch(() => {});
    refreshPip();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') tile.stats.textContent = 'Falha na conexão — tentando de novo…';
  };

  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  answer.sdp = stereoOpus(answer.sdp);
  await pc.setLocalDescription(answer);
  signal(from, { dir: 'toSender', sid, sdp: pc.localDescription });
}

// O WebRTC começa em ~300 kbps e sobe aos poucos, então os primeiros segundos ficam borrados e
// em resolução baixa. Começa já em metade da taxa escolhida; se a rede não aguentar, ele desce.
function startBitrate(sdp) {
  const kbps = Math.round(currentQuality().bitrate / 2000);
  const video = [...sdp.matchAll(/a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\/90000/gi)].map((m) => m[1]);
  for (const pt of video) {
    const param = `x-google-start-bitrate=${kbps}`;
    sdp = new RegExp(`a=fmtp:${pt} `).test(sdp)
      ? sdp.replace(new RegExp(`a=fmtp:${pt} (.*)`), (line) => `${line};${param}`)
      : sdp.replace(new RegExp(`(a=rtpmap:${pt} .*\\r\\n)`), `$1a=fmtp:${pt} ${param}\r\n`);
  }
  return sdp;
}

// Pede áudio estéreo e com mais qualidade (o padrão do WebRTC é mono, pensado para voz).
function stereoOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  return sdp.replace(
    new RegExp(`a=fmtp:${m[1]} (.*)`),
    (line) => line + ';stereo=1;sprop-stereo=1;maxaveragebitrate=160000'
  );
}

function closeRecv(id) {
  const r = recvs.get(id);
  if (r) {
    r.pc.close();
    recvs.delete(id);
  }
  removeTile(id);
}

// ---------- estatísticas (para você ver o atraso real) ----------
setInterval(async () => {
  for (const r of recvs.values()) {
    const stats = await r.pc.getStats().catch(() => null);
    if (!stats) continue;
    let video;
    let pair;
    stats.forEach((s) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video') video = s;
      if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
    });
    if (!video || !video.framesDecoded) continue;

    const prev = r.prev;
    r.prev = {
      t: video.timestamp,
      bytes: video.bytesReceived,
      jbd: video.jitterBufferDelay,
      jbe: video.jitterBufferEmittedCount,
    };
    if (!prev) continue;

    const mbps = ((video.bytesReceived - prev.bytes) * 8) / (video.timestamp - prev.t) / 1000;
    const emitted = video.jitterBufferEmittedCount - prev.jbe;
    const buffer = emitted > 0 ? ((video.jitterBufferDelay - prev.jbd) / emitted) * 1000 : 0;
    const codec = stats.get(video.codecId)?.mimeType.split('/')[1] || '';
    const parts = [
      `${video.frameWidth}×${video.frameHeight}`,
      `${Math.round(video.framesPerSecond || 0)} fps`,
      `${mbps.toFixed(1)} Mbps`,
      codec,
    ];
    if (pair?.currentRoundTripTime != null) parts.push(`ping ${Math.round(pair.currentRoundTripTime * 1000)} ms`);
    parts.push(`buffer ${Math.round(buffer)} ms`);
    const local = pair && stats.get(pair.localCandidateId);
    if (local?.candidateType === 'relay') parts.push('via TURN');
    if (video.freezeCount) parts.push(`⚠ travou ${video.freezeCount}×`);
    r.tile.stats.textContent = parts.join(' · ');
  }
  await senderStats();
}, 1000);

// Quem transmite vê, na própria prévia, como a tela está saindo para cada amigo
// e o que está segurando a qualidade.
async function senderStats() {
  const me = tiles.get('me');
  if (!me) return;
  const lines = [];
  for (const [id, pc] of sendPcs) {
    const stats = await pc.getStats().catch(() => null);
    let out;
    stats?.forEach((s) => {
      if (s.type === 'outbound-rtp' && s.kind === 'video') out = s;
    });
    if (!out?.framesEncoded) continue;
    const parts = [
      `→ ${people.get(id)?.name || '?'}: ${out.frameWidth}×${out.frameHeight}`,
      `${Math.round(out.framesPerSecond || 0)} fps`,
    ];
    if (out.qualityLimitationReason === 'cpu') parts.push('⚠ PC sobrecarregado: baixe a qualidade ou use H.264');
    if (out.qualityLimitationReason === 'bandwidth') parts.push('⚠ upload no limite');
    if (out.powerEfficientEncoder === false) parts.push('codificando no processador');
    lines.push(parts.join(' · '));
  }
  me.stats.textContent = lines.join('\n');
}

// ---------- interface ----------
function makeTile(id, label, withSound) {
  let t = tiles.get(id);
  if (t) {
    t.label.textContent = label;
    return t;
  }
  const el = document.createElement('div');
  el.className = 'tile';
  el.innerHTML =
    '<video autoplay playsinline muted></video><div class="label"></div><div class="stats"></div>' +
    '<div class="tools"><button data-a="sound" title="Ligar/desligar som" aria-label="Ligar/desligar som"></button>' +
    '<input data-a="vol" type="range" min="0" max="1" step="0.05" title="Volume" aria-label="Volume">' +
    '<button data-a="full" title="Tela cheia" aria-label="Tela cheia"></button></div>';
  t = {
    el,
    video: el.querySelector('video'),
    label: el.querySelector('.label'),
    stats: el.querySelector('.stats'),
  };
  t.label.textContent = label;
  const soundBtn = el.querySelector('[data-a="sound"]');
  const slider = el.querySelector('[data-a="vol"]');
  soundBtn.append(icon('mute'));
  el.querySelector('[data-a="full"]').append(icon('expand'));
  t.withSound = withSound;
  if (withSound) {
    // Volume salvo por nome, para valer nas próximas vezes. O som começa desligado (regra dos
    // navegadores); mexer no volume já liga.
    const volKey = () => 'vol:' + (people.get(id)?.name || '').trim().toLowerCase();
    const saved = parseFloat(load(volKey()));
    t.video.volume = slider.value = Number.isFinite(saved) ? saved : 1;
    t.setMuted = (muted) => {
      if (!muted && t.video.volume === 0) t.setVolume(1);
      t.video.muted = muted;
      soundBtn.replaceChildren(icon(muted ? 'mute' : 'volume'));
      refreshPip();
    };
    t.setVolume = (v) => {
      t.video.volume = v;
      slider.value = v;
      save(volKey(), v);
      if (v > 0 && t.video.muted) t.setMuted(false);
      else if (v === 0 && !t.video.muted) t.setMuted(true);
      else refreshPip();
    };
    soundBtn.addEventListener('click', () => t.setMuted(!t.video.muted));
    slider.addEventListener('input', () => t.setVolume(+slider.value));
  } else {
    soundBtn.remove();
    slider.remove();
  }
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen());
  el.querySelector('[data-a="full"]').addEventListener('click', toggleFull);
  t.video.addEventListener('dblclick', toggleFull);
  // O quadro acompanha a proporção da tela de quem transmite (ex.: ultrawide 21:9).
  const fitAspect = () => {
    const { videoWidth: w, videoHeight: h } = t.video;
    if (w && h) el.style.setProperty('--ar', (w / h).toFixed(4));
  };
  t.video.addEventListener('loadedmetadata', fitAspect);
  t.video.addEventListener('resize', fitAspect);

  // A prévia local fica por último; telas dos amigos primeiro.
  if (id === 'me') $('#grid').append(el);
  else $('#grid').insertBefore(el, tiles.get('me')?.el || null);
  tiles.set(id, t);
  $('#empty').hidden = true;
  refreshPip();
  return t;
}

function removeTile(id) {
  const t = tiles.get(id);
  if (!t) return;
  t.video.srcObject = null;
  t.el.remove();
  tiles.delete(id);
  $('#empty').hidden = tiles.size > 0;
  refreshPip();
}

// ---------- PiP (janela por cima dos outros programas) ----------
function pipScreens() {
  const list = [...tiles].map(([id, t]) => ({
    id,
    name: id === 'me' ? 'Você' : people.get(id)?.name || '?',
    stream: t.video.srcObject,
    muted: t.withSound ? t.video.muted : null,
    volume: t.video.volume,
    self: id === 'me',
  }));
  return [...list.filter((s) => !s.self), ...list.filter((s) => s.self)];
}

const updatePipButton = () => ($('#pip').textContent = isPipOpen() ? 'Fechar PiP' : 'Abrir PiP');
const toggleSound = (id) => {
  const t = tiles.get(id);
  t?.setMuted?.(!t.video.muted);
};
const setVolume = (id, v) => tiles.get(id)?.setVolume?.(v);
connectPip({ screens: pipScreens, toggleSound, setVolume }, updatePipButton);
$('#pip').addEventListener('click', async () => {
  if (isPipOpen()) return closePip();
  const hide = () => ($('#banner').hidden = true);
  if (!pipSupported) {
    return showBanner(
      'Este navegador não tem a janela PiP. Use Chrome ou Edge (versão 116 ou mais nova) no computador. Firefox, Opera, Opera GX e Safari não têm.',
      'OK',
      hide
    );
  }
  try {
    await openPip();
  } catch (err) {
    showBanner('Não foi possível abrir o PiP: ' + err.message, 'OK', hide);
  }
});

// Cor fixa por pessoa (a mesma em todos os PCs, porque vem do nome).
const AVATAR_COLORS = ['#e5484d', '#f76b15', '#c99a06', '#30a46c', '#0d9488', '#0a84ff', '#5e5ce6', '#9d4edd', '#d6409f'];
function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function renderPeople() {
  const ul = $('#people');
  ul.replaceChildren();
  for (const [id, p] of people) {
    const li = document.createElement('li');
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = (Array.from(p.name.trim())[0] || '?').toUpperCase();
    avatar.style.background = avatarColor(p.name);
    const who = document.createElement('span');
    who.className = 'who';
    const name = document.createElement('span');
    name.className = 'who-name';
    name.textContent = p.name;
    if (id === myId) {
      const you = document.createElement('span');
      you.className = 'muted';
      you.textContent = ' (você)';
      name.append(you);
    }
    const state = document.createElement('span');
    state.className = 'who-state';
    state.textContent = p.sharing ? 'transmitindo' : 'assistindo';
    who.append(name, state);
    li.append(avatar, who);
    if (p.sharing) {
      const live = document.createElement('span');
      live.className = 'live';
      live.textContent = 'AO VIVO';
      li.append(live);
    }
    ul.append(li);
  }
  renderJams();
  renderWishlist(); // os nomes nas listas dos outros vêm daqui
}

// Tema claro/escuro. O escuro é o padrão; o <head> do index.html já aplica o tema salvo.
for (const b of document.querySelectorAll('.theme-toggle')) {
  b.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    save('theme', light ? 'light' : 'dark');
  });
}

// Grupo "Tarkov": clicar no nome recolhe ou mostra as ferramentas (a escolha fica salva).
// A busca rápida (Ctrl+K) continua funcionando com o grupo recolhido.
function setTools(open) {
  measureTools();
  $('.toolgroup').classList.toggle('collapsed', !open);
  $('#toolsToggle').setAttribute('aria-expanded', open);
  save('tools', open ? '1' : '0');
}
// Largura real das ferramentas, para a animação de deslizar ir exatamente até ela.
function measureTools() {
  const items = $('#toolsItems');
  // Com a sala ainda escondida (tela de entrada) a medida dá 0: ignora e mede quando aparecer.
  if (items.scrollWidth) items.style.setProperty('--tools-w', items.scrollWidth + 'px');
}
addEventListener('resize', measureTools); // em telas estreitas os nomes somem e a largura muda
addEventListener('load', measureTools); // fontes carregadas mudam a largura
// O contador da wishlist aparece/muda depois: remede para não cortar.
new MutationObserver(measureTools).observe($('#toolsItems'), { subtree: true, childList: true, characterData: true });
// Estado salvo aplicado sem animar (só anima quando a pessoa clica).
$('.toolgroup').classList.add('no-anim');
setTools(load('tools') !== '0');
requestAnimationFrame(() => requestAnimationFrame(() => $('.toolgroup').classList.remove('no-anim')));
$('#toolsToggle').addEventListener('click', () => setTools($('#toolsToggle').getAttribute('aria-expanded') !== 'true'));

// O painel de ajustes fecha ao clicar fora dele ou apertar Esc.
document.addEventListener('click', (e) => {
  const settings = $('.settings');
  if (settings.open && !settings.contains(e.target)) settings.open = false;
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && ($('.settings').open = false));

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showBanner($('#password').value ? 'Link copiado. Mande a senha à parte.' : 'Link copiado.', null, null, 'ok');
  } catch {
    prompt('Copie o link:', location.href);
  }
});

// Instalar como app (PWA). O navegador avisa quando dá para instalar; aí os botões aparecem.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  for (const b of document.querySelectorAll('.install-app')) b.hidden = false;
});
addEventListener('appinstalled', () => {
  installPrompt = null;
  for (const b of document.querySelectorAll('.install-app')) b.hidden = true;
});
for (const b of document.querySelectorAll('.install-app')) {
  b.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    for (const x of document.querySelectorAll('.install-app')) x.hidden = true;
  });
}

// Versão e janela "Sobre"
for (const el of document.querySelectorAll('.app-version')) el.textContent = APP_VERSION;
for (const b of document.querySelectorAll('.about-open')) {
  b.addEventListener('click', () => {
    $('.settings').open = false;
    $('#about').showModal();
  });
}
// Janelas (Sobre, busca rápida): botão de fechar e clique fora fecham.
for (const d of document.querySelectorAll('dialog.sheet')) {
  d.querySelector('.sheet-close')?.addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => e.target === d && d.close());
}

// Aviso no canto (estilo notificação). Sem ação para tomar (ou só "OK"), some sozinho.
let bannerTimer;
function showBanner(text, buttonText, onClick, kind = 'warn') {
  const b = $('#banner');
  clearTimeout(bannerTimer);
  b.className = 'toast ' + kind;
  const body = document.createElement('span');
  body.className = 'toast-text';
  body.textContent = text;
  const close = document.createElement('button');
  close.className = 'icon';
  close.title = 'Fechar';
  close.setAttribute('aria-label', 'Fechar');
  close.append(icon('close'));
  close.onclick = () => (b.hidden = true);
  b.replaceChildren(icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'warning'), body);
  if (buttonText && buttonText !== 'OK') {
    const btn = document.createElement('button');
    btn.textContent = buttonText;
    btn.onclick = onClick;
    b.append(btn);
  }
  b.append(close);
  b.hidden = false;
  if (!buttonText || buttonText === 'OK') bannerTimer = setTimeout(() => (b.hidden = true), kind === 'ok' ? 3000 : 9000);
}
