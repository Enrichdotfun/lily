// Per-process outbound-request counter, so each daemon can report its live API
// load (RPC + HTTP calls). Every outbound call site calls tick(); load() returns
// the rolling count over the last 60s plus the lifetime total.
const hits = [];
let total = 0;

export function tick(n = 1) {
  const now = Date.now();
  for (let i = 0; i < n; i++) hits.push(now);
  total += n;
}

export function load() {
  const cut = Date.now() - 60_000;
  while (hits.length && hits[0] < cut) hits.shift();
  return { perMin: hits.length, total };
}
