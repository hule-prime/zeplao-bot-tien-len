// Every id and class the page actually puts on the screen, checked against the stylesheet.
//
// Written after a search-and-replace quietly ate the whole advertisement screen's styling and
// the only thing that noticed was a screenshot. An id is covered when the same element carries
// a class that is styled — most of them do, and flagging those would make this cry wolf.
import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const css = readFileSync(dir + '/style.css', 'utf8');
const js = readFileSync(dir + '/tienlen.js', 'utf8');
const html = readFileSync(dir + '/index.html', 'utf8');

const has = (sel) => css.includes(sel);
const missing = [];

for (const m of js.matchAll(/className\s*=\s*[`"']([^`"'${]+)/g)) {
  for (const one of m[1].split(/\s+/)) if (one && !has('.' + one)) missing.push('.' + one);
}
for (const m of js.matchAll(/classList\.(?:add|toggle)\([`"']([\w-]+)/g)) {
  if (!has('.' + m[1])) missing.push('.' + m[1]);
}
for (const tag of html.matchAll(/<[a-z]+\b[^>]*>/g)) {
  const classes = (/class="([^"]+)"/.exec(tag[0]) || [, ''])[1].split(/\s+/).filter(Boolean);
  for (const one of classes) if (!has('.' + one)) missing.push('.' + one);

  const id = (/id="([\w-]+)"/.exec(tag[0]) || [])[1];
  // An id with a styled class on the same element is dressed already.
  if (id && !has('#' + id) && !classes.some((one) => has('.' + one))) missing.push('#' + id);
}

const unique = [...new Set(missing)].sort();
if (unique.length) {
  console.error('không có luật CSS: ' + unique.join(' '));
  process.exit(1);
}
console.log('CSS phủ hết mọi thứ trang này vẽ ra');
