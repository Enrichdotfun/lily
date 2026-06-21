// Token avatar: real image if we have one, otherwise a deterministic colour tile
// derived from the mint so each coin is visually stable.
import { useEffect, useState } from 'react';

function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ mint, symbol, image, size = 36 }: {
  mint: string;
  symbol?: string | null;
  image?: string | null;
  size?: number;
}) {
  // Track load failures so a broken/slow image host (IPFS, dead CDN, hotlink
  // block) falls back to the colour tile instead of leaving a blank gap.
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]); // reset when the src changes

  if (image && !failed) {
    return (
      <img
        src={image}
        alt={symbol || mint}
        width={size}
        height={size}
        loading="lazy"
        style={{ borderRadius: 10, objectFit: 'cover', flex: 'none', width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  const h = hue(mint);
  const initials = (symbol || mint).slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.34,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.92)',
        background: `linear-gradient(135deg, hsl(${h} 70% 30%), hsl(${(h + 40) % 360} 70% 22%))`,
      }}
    >
      {initials}
    </div>
  );
}
