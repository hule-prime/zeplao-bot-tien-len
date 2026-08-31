// The six faces of bầu cua tôm cá, drawn rather than fetched.
//
// Inline SVG and not emoji, for one reason that matters and one that decides it. The one that
// matters: emoji are drawn by whoever made the phone, so the same board is six different
// drawing styles on six different handsets and none of them are the style of this table. The
// one that decides it: there is no calabash emoji, and bầu is the game's first word.
//
// Flat, two colours, one 64×64 box each, so they sit on the tiles at any size and take the
// table's own palette rather than bringing their own.
const FACE_ART = {
  // A calabash: a small round above a big round with a waist between them, which is the shape
  // the word means and the shape on every board. One blob was not it.
  bau: `<path d="M32 10v8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M33 15c4-4 9-5 13-3-2 5-7 7-13 6z" fill="currentColor" opacity=".55"/>
    <circle cx="32" cy="28" r="9.5" fill="currentColor"/>
    <circle cx="32" cy="44" r="14" fill="currentColor"/>
    <ellipse cx="26" cy="42" rx="4" ry="6" fill="rgba(255,255,255,.3)"/>
    <circle cx="28" cy="25" r="2.6" fill="rgba(255,255,255,.25)"/>`,

  cua: `<ellipse cx="32" cy="36" rx="17" ry="12" fill="currentColor"/>
    <circle cx="25" cy="32" r="2.6" fill="rgba(0,0,0,.45)"/>
    <circle cx="39" cy="32" r="2.6" fill="rgba(0,0,0,.45)"/>
    <path d="M15 30c-5-2-9-6-9-11 0-3 2-5 4-4 3 1 2 5 5 7 2 1 4 2 6 2z" fill="currentColor"/>
    <path d="M49 30c5-2 9-6 9-11 0-3-2-5-4-4-3 1-2 5-5 7-2 1-4 2-6 2z" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="3.4" stroke-linecap="round">
      <path d="M17 42 8 48M18 47l-7 7M46 42l9 6M45 47l7 7"/>
    </g>`,

  // A prawn: the body curled round, segments across it, a fan on the tail and feelers off the
  // head. Drawn as one thick stroke so the curl stays a curl at any size.
  tom: `<path d="M45 47c-12 3-24-4-24-16 0-9 7-16 16-16 6 0 11 3 13 8"
      stroke="currentColor" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M50 15l9-5-3 9 9 2-9 5z" fill="currentColor"/>
    <g stroke="rgba(0,0,0,.13)" stroke-width="2.2" stroke-linecap="round">
      <path d="M28 19c2 2 3 5 3 8M22 25c2 2 4 4 5 7M20 34c3 0 5 1 8 3"/>
    </g>
    <circle cx="43" cy="45" r="2.6" fill="rgba(0,0,0,.45)"/>
    <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <path d="M47 50c4 3 9 4 13 3M46 54c3 4 7 6 11 7"/>
    </g>
    <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
      <path d="M32 52c1 4 3 7 6 9M24 49c-1 4-1 8 1 11"/>
    </g>`,

  ca: `<path d="M40 16c9 3 16 9 18 16-2 7-9 13-18 16-13 4-25-2-30-16 5-14 17-20 30-16z"
      fill="currentColor"/>
    <path d="M58 32c3-4 5-9 5-14-6 2-11 6-14 10zM58 32c3 4 5 9 5 14-6-2-11-6-14-10z"
      fill="currentColor"/>
    <circle cx="21" cy="29" r="2.8" fill="rgba(0,0,0,.45)"/>
    <path d="M32 20c-2 8-2 16 0 24" stroke="rgba(0,0,0,.18)" stroke-width="3"
      stroke-linecap="round" fill="none"/>`,

  // A rooster: comb, beak and a tail, which is the three things that stop it being a duck.
  // A rooster and not a chick: the comb, the wattle and a tail sweeping up behind it are the
  // three things that make the difference, and the first draw had none of them.
  ga: `<path d="M14 30c-6-1-11 2-13 7 5 3 10 3 14 1zM10 22c-5-3-8-8-8-14 6 2 10 7 12 13z"
      fill="currentColor" opacity=".75"/>
    <ellipse cx="31" cy="38" rx="15" ry="13" fill="currentColor"/>
    <circle cx="43" cy="24" r="9" fill="currentColor"/>
    <path d="M38 15c0-4 2-6 4-7 0 2 0 3 1 4 1-3 3-4 5-4-1 2-1 3 0 5 2-2 4-2 6-1-2 2-3 4-3 6z"
      fill="currentColor"/>
    <path d="M52 25l9 3-9 4z" fill="currentColor"/>
    <path d="M47 32c2 3 2 6 0 8-2-2-3-5-2-8z" fill="currentColor" opacity=".8"/>
    <circle cx="45" cy="22" r="2.4" fill="rgba(0,0,0,.5)"/>
    <g stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
      <path d="M26 50v7M36 50v7"/>
    </g>`,

  nai: `<path d="M32 24c8 0 14 6 14 14 0 8-4 14-8 18l2 6h-6l-2-5h-1l-2 5h-6l2-6c-4-4-7-10-7-18
      0-8 6-14 14-14z" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none">
      <path d="M25 22c-3-4-3-9-2-13M23 15c-3-1-6-1-8 1M25 22c-4 1-7 3-9 6"/>
      <path d="M39 22c3-4 3-9 2-13M41 15c3-1 6-1 8 1M39 22c4 1 7 3 9 6"/>
    </g>
    <circle cx="27" cy="35" r="2.4" fill="rgba(0,0,0,.45)"/>
    <circle cx="37" cy="35" r="2.4" fill="rgba(0,0,0,.45)"/>
    <ellipse cx="32" cy="42" rx="3.4" ry="2.6" fill="rgba(0,0,0,.3)"/>`,
};

/// One face, at whatever size the thing holding it is.
///
/// `innerHTML` on a string this file wrote itself — not on anything anybody typed. The six
/// drawings above are the only thing that ever goes in here.
function faceArt(face) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'face-art');
  svg.innerHTML = FACE_ART[face] || '';
  return svg;
}
