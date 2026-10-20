// Hora dentro do Tarkov. O jogo corre 7× mais rápido que a hora real, no fuso de Moscou, e na
// tela de escolha da raid há sempre dois horários, separados por 12 h (a raid "da esquerda" e a
// "da direita"). Mesma conta usada pela comunidade (tarkov.dev e outras ferramentas).
// Factory e The Lab têm horário fixo e não seguem esse relógio.

import { icon } from './icons.js';

const RATIO = 7;
const DAY = 24 * 60 * 60 * 1000;
const MOSCOW = 3 * 60 * 60 * 1000;

export function tarkovTime(now = Date.now(), right = false) {
  const t = (MOSCOW + (right ? DAY / 2 : 0) + now * RATIO) % DAY;
  return { h: Math.floor(t / 3600000), m: Math.floor((t % 3600000) / 60000) };
}

const fmt = ({ h, m }) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const isDay = ({ h }) => h >= 5 && h < 21;

const clock = document.querySelector('#tarkovClock');
const parts = [0, 1].map(() => {
  const span = document.createElement('span');
  span.className = 'tk-time';
  return span;
});
clock.replaceChildren(parts[0], document.createTextNode(' '), parts[1]);

function tick() {
  [false, true].forEach((right, i) => {
    const t = tarkovTime(Date.now(), right);
    parts[i].replaceChildren(icon(isDay(t) ? 'sun' : 'moon'), fmt(t));
    parts[i].classList.toggle('night', !isDay(t));
  });
}
tick();
setInterval(tick, 1000); // um minuto do jogo passa a cada ~8,6 s reais
