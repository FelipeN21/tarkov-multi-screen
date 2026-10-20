// Ícones de linha (estilo SF Symbols) em SVG, para não depender de emojis, que mudam de um
// sistema para outro. icon('volume') devolve um <svg>; em outra janela (PiP), passe o document dela.

const PATHS = {
  volume: "<path d='M11 5 6 9H2v6h4l5 4z'/><path d='M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14'/>",
  mute: "<path d='M11 5 6 9H2v6h4l5 4z'/><path d='m22 9-6 6M16 9l6 6'/>",
  expand: "<path d='M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'/>",
  close: "<path d='M18 6 6 18M6 6l12 12'/>",
  crop: "<path d='M6 2v14a2 2 0 0 0 2 2h14'/><path d='M18 22V8a2 2 0 0 0-2-2H2'/>",
  reset: "<path d='M3 12a9 9 0 1 0 3-6.7L3 8'/><path d='M3 3v5h5'/>",
  grid: "<rect x='3' y='3' width='7' height='7' rx='1.5'/><rect x='14' y='3' width='7' height='7' rx='1.5'/><rect x='3' y='14' width='7' height='7' rx='1.5'/><rect x='14' y='14' width='7' height='7' rx='1.5'/>",
  focus: "<rect x='3' y='3' width='12' height='18' rx='1.5'/><rect x='17' y='3' width='4' height='8' rx='1'/><rect x='17' y='13' width='4' height='8' rx='1'/>",
  strip: "<rect x='2' y='8' width='6' height='8' rx='1'/><rect x='9' y='8' width='6' height='8' rx='1'/><rect x='16' y='8' width='6' height='8' rx='1'/>",
  warning: "<path d='M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/><path d='M12 9v4M12 17h.01'/>",
  info: "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4M12 8h.01'/>",
  check: "<circle cx='12' cy='12' r='10'/><path d='m8 12 3 3 5-6'/>",
  search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-3.5-3.5'/>",
  tag: "<path d='M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.8 8.8a2.4 2.4 0 0 0 3.4 0l6.4-6.4a2.4 2.4 0 0 0 0-3.4z'/><circle cx='7.5' cy='7.5' r='1.5'/>",
  user: "<circle cx='12' cy='8' r='4'/><path d='M4 21a8 8 0 0 1 16 0'/>",
  list: "<path d='m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8'/>",
  map: "<path d='M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z'/><path d='M9 4v14M15 6v14'/>",
  music: "<path d='M9 18V5l12-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='18' cy='16' r='3'/>",
  copy: "<rect x='9' y='9' width='13' height='13' rx='2'/><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'/>",
  external: "<path d='M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/>",
  heart: "<path d='M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
};

export function icon(name, doc = document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = PATHS[name] || '';
  return svg;
}
