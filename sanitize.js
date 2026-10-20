// Limpeza de textos que chegam de outros PCs (nomes, itens da wishlist). Eles já aparecem sempre
// como texto puro (nunca como HTML); isto só evita nomes que confundem: sinais < >, caracteres de
// controle e caracteres invisíveis ou de inversão de direção (usados para disfarçar nomes).

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;

export function cleanText(value, max) {
  const s = String(value ?? '')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, max).join(''); // corta por caractere, sem partir emojis ao meio
}
