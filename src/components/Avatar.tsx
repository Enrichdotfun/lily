// Token avatar: real image if we have one, otherwise a deterministic colour tile
// derived from the mint so each coin is visually stable.
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
  if (image) {
    return (
      <img
        src={image}
        alt={symbol || mint}
        width={size}
        height={size}
        style={{ borderRadius: 10, objectFit: 'cover', flex: 'none' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
