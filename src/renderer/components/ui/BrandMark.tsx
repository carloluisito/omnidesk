/**
 * BrandMark — OmniDesk radial hexagon mark.
 *
 * A six-pointed radial mark: a regular hexagon with lines extending outward
 * from three alternating vertices, suggesting a network hub / orchestration center.
 * Geometric, not illustrative. Scalable from 16px to 256px.
 */

interface BrandMarkProps {
  size?: number;
  color?: string;
  className?: string;
}

export function BrandMark({ size = 20, color = 'var(--accent-primary)', className = '' }: BrandMarkProps) {
  // Hexagon geometry — flat-top orientation, centered at (32,32) in a 64x64 viewBox
  // Vertices at radius 18 from center (slightly inset for clean scaling)
  const cx = 32;
  const cy = 32;
  const r = 16;    // inner hexagon radius
  const ext = 10;  // extension length for the 3 radiating lines

  // Flat-top hex: angles 0°, 60°, 120°, 180°, 240°, 300°
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const hex = (deg: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });
  const extPt = (deg: number) => ({
    x: cx + (r + ext) * Math.cos(toRad(deg)),
    y: cy + (r + ext) * Math.sin(toRad(deg)),
  });

  // 6 hex vertices (flat-top, starting at 0°)
  const angles = [0, 60, 120, 180, 240, 300];
  const vertices = angles.map(hex);
  const hexPath = vertices
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x.toFixed(2)},${v.y.toFixed(2)}`)
    .join(' ') + ' Z';

  // Extend lines from alternating vertices (0°, 120°, 240°)
  const extAngles = [0, 120, 240];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="OmniDesk logo"
      style={{ flexShrink: 0 }}
    >
      {/* Hexagon outline */}
      <path
        d={hexPath}
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Three radiating extension lines from alternating vertices */}
      {extAngles.map((deg) => {
        const start = hex(deg);
        const end = extPt(deg);
        return (
          <line
            key={deg}
            x1={start.x.toFixed(2)}
            y1={start.y.toFixed(2)}
            x2={end.x.toFixed(2)}
            y2={end.y.toFixed(2)}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="2.5" fill={color} />
    </svg>
  );
}
