/**
 * ClaudeDesk Logo - Mission Control Edition
 *
 * A custom SVG logo combining a cloud + desk motif with
 * the aerospace terminal aesthetic. Clean, geometric, memorable.
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { icon: 24, text: 'text-sm', gap: 'gap-1.5' },
  md: { icon: 32, text: 'text-lg', gap: 'gap-2' },
  lg: { icon: 40, text: 'text-xl', gap: 'gap-2.5' },
};

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {/* Icon mark */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Glow filter */}
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <filter id="logo-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring - represents mission control / radar */}
        <circle
          cx="20"
          cy="20"
          r="18"
          stroke="url(#logo-grad)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.3"
        />

        {/* Cloud shape - top arc */}
        <path
          d="M12 22c-2.2 0-4-1.8-4-4 0-1.8 1.2-3.3 2.8-3.8C11.5 11.3 14.5 9 18 9c3.2 0 5.9 1.9 7 4.6.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5 0 1.9-1 3.4-2.6 4.2"
          stroke="url(#logo-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          filter="url(#logo-glow)"
        />

        {/* Desk surface - horizontal line with depth */}
        <path
          d="M9 25h22"
          stroke="url(#logo-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#logo-glow)"
        />

        {/* Desk legs */}
        <path
          d="M13 25v5M27 25v5"
          stroke="url(#logo-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Monitor/screen on desk */}
        <rect
          x="17"
          y="20"
          width="6"
          height="5"
          rx="1"
          stroke="url(#logo-grad)"
          strokeWidth="1.2"
          fill="rgba(96, 165, 250, 0.1)"
        />

        {/* Screen glow dot */}
        <circle cx="20" cy="22.5" r="1" fill="#60a5fa" opacity="0.8" />

        {/* Crosshair accent - mission control */}
        <circle cx="20" cy="20" r="1" fill="url(#logo-grad)" opacity="0.4" />
      </svg>

      {/* Wordmark */}
      {showText && (
        <span className={`${s.text} font-semibold tracking-tight flex items-baseline gap-1.5`}>
          <span>
            <span className="text-white">Claude</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
              Desk
            </span>
          </span>
          <span
            className="text-[0.55em] font-bold tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 border border-blue-400/30 rounded px-1 py-[1px] leading-none"
            style={{ fontSize: '0.45em', letterSpacing: '0.1em' }}
          >
            v3
          </span>
        </span>
      )}
    </div>
  );
}
