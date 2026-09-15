export function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <svg
        className="hero-chart"
        viewBox="0 0 1200 720"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0A2438" />
            <stop offset="55%" stopColor="#123B52" />
            <stop offset="100%" stopColor="#1B5C5A" />
          </linearGradient>
          <linearGradient id="lift" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#7BE0C8" stopOpacity="0" />
            <stop offset="100%" stopColor="#7BE0C8" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9FF2D8" />
            <stop offset="100%" stopColor="#D7F56A" />
          </linearGradient>
        </defs>

        <rect width="1200" height="720" fill="url(#sky)" />

        {/* Soft atmosphere */}
        <circle cx="980" cy="120" r="220" fill="#7BE0C8" fillOpacity="0.08" />
        <circle cx="180" cy="560" r="280" fill="#D7F56A" fillOpacity="0.05" />

        {/* Grid */}
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={80 + i * 90}
            y1="80"
            x2={80 + i * 90}
            y2="640"
            stroke="#E8F4F2"
            strokeOpacity="0.08"
          />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1="80"
            y1={100 + i * 80}
            x2="1120"
            y2={100 + i * 80}
            stroke="#E8F4F2"
            strokeOpacity="0.08"
          />
        ))}

        {/* Area under ROI curve */}
        <path
          className="hero-area"
          d="M120 560 C260 540 320 500 420 430 C540 340 620 300 760 220 C900 140 980 120 1080 100 L1080 640 L120 640 Z"
          fill="url(#lift)"
        />

        {/* ROI curve */}
        <path
          className="hero-line"
          d="M120 560 C260 540 320 500 420 430 C540 340 620 300 760 220 C900 140 980 120 1080 100"
          stroke="url(#line)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Endpoint */}
        <circle className="hero-dot" cx="1080" cy="100" r="10" fill="#D7F56A" />
        <circle
          className="hero-dot-ring"
          cx="1080"
          cy="100"
          r="22"
          stroke="#D7F56A"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
