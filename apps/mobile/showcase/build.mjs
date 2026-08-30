// Assemble the self-contained showcase: inline the fonts link stays external
// (Google Fonts is CSP-allowed), photos become data URIs, logo + status-bar
// icons are inlined SVG. Output: apps/mobile/showcase/index.html
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = (p) => resolve(here, p);
const dataUri = (name) => {
  const b = readFileSync(A(`assets/${name}.jpg`));
  return `data:image/jpeg;base64,${b.toString('base64')}`;
};

// genie lamp-genie glyph — a rounded genie rising from a lamp curl.
const logo = (fill) => `<svg viewBox="0 0 132 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="genie">
  <g fill="${fill}">
    <circle cx="15.5" cy="6.2" r="2.6"/>
    <path d="M15.5 10.4c-5.1 0-8.6 3.7-8.6 8.7 0 3 1.3 5.4 3.4 6.9-2.9.9-5 2.9-5 5.9 0 .5.1 1 .3 1.6H26c.2-.6.3-1.1.3-1.6 0-3-2.1-5-5-5.9 2.1-1.5 3.4-3.9 3.4-6.9 0-5-3.5-8.7-9.2-8.7Zm0 4.6c2.6 0 4.3 1.7 4.3 4.1 0 2.4-1.7 4.1-4.3 4.1s-4.1-1.7-4.1-4.1c0-2.4 1.6-4.1 4.1-4.1Z"/>
  </g>
  <text x="33" y="30" font-family="'Quicksand','Inter',sans-serif" font-size="30" font-weight="700" letter-spacing="-0.5" fill="${fill}">genie</text>
</svg>`;

const statusIcons = `
<svg width="18" height="12" viewBox="0 0 18 12" fill="#fff" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/><rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg>
<svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true"><path d="M1 4.2C3.1 2.2 5.6 1 8.5 1s5.4 1.2 7.5 3.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M3.7 7C5.1 5.7 6.7 5 8.5 5s3.4.7 4.8 2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.5" cy="10" r="1.5" fill="#fff"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true"><rect x="1" y="1.5" width="22" height="10" rx="3" stroke="#fff" stroke-opacity="0.5" stroke-width="1.2"/><rect x="3" y="3.5" width="16" height="6" rx="1.5" fill="#fff"/><path d="M25 4.5v4c1.2-.4 1.2-3.6 0-4Z" fill="#fff" fill-opacity="0.6"/></svg>`;

let html = readFileSync(A('template.html'), 'utf8');
html = html
  .replaceAll('__IMG_COUPLE__', dataUri('couple-dancing'))
  .replaceAll('__IMG_GIFT__', dataUri('man-gift'))
  .replaceAll('__IMG_CARD__', dataUri('man-party'))
  .replaceAll('__LOGO_WHITE__', logo('#ffffff'))
  .replaceAll('__STATUS_ICONS__', statusIcons);

writeFileSync(A('index.html'), html);
console.log(`wrote index.html (${(html.length / 1024).toFixed(0)} KB)`);
