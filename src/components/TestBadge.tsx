// Diskret "TEST"-vattenstämpel över hela appen (bara i testbygget) så att
// test-instansen aldrig förväxlas med produktion. pointer-events: none.
const SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'>` +
    `<text x='4' y='95' font-family='sans-serif' font-size='40' font-weight='700' ` +
    `fill='#b23a2e' fill-opacity='0.13' transform='rotate(-24 110 75)'>TEST</text></svg>`,
);

export default function TestBadge() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 5, backgroundImage: `url("data:image/svg+xml,${SVG}")` }}
    />
  );
}
