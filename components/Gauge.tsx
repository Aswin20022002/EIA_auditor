"use client";

const CX = 110;
const CY = 105;
const R = 84;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Sweeps from 0deg (left, score 0) to 180deg (right, score 100) along the top half.
function arcPath(r: number, fromScore: number, toScore: number) {
  const a0 = (fromScore / 100) * 180;
  const a1 = (toScore / 100) * 180;
  const p0 = polarToCartesian(CX, CY, r, a0);
  const p1 = polarToCartesian(CX, CY, r, a1);
  const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

function bandColor(score: number) {
  if (score >= 70) return "#1F5E56"; // teal
  if (score >= 40) return "#C97A2B"; // ochre
  return "#A8402C"; // brick
}

export default function Gauge({ score, label = "Completeness score" }: { score: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const needleAngle = (clamped / 100) * 180;
  const needleTip = polarToCartesian(CX, CY, R - 14, needleAngle);
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 130" className="w-full max-w-[280px]" role="img" aria-label={`${label}: ${clamped} out of 100`}>
        <path d={arcPath(R, 0, 100)} fill="none" stroke="#C7CDC3" strokeWidth={10} strokeLinecap="round" />
        <path d={arcPath(R, 0, clamped)} fill="none" stroke={bandColor(clamped)} strokeWidth={10} strokeLinecap="round" />

        {ticks.map((t) => {
          const angle = (t / 100) * 180;
          const inner = polarToCartesian(CX, CY, R - 12, angle);
          const outer = polarToCartesian(CX, CY, R + 2, angle);
          return (
            <line
              key={t}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#5B6B62"
              strokeWidth={t % 50 === 0 ? 2 : 1}
            />
          );
        })}

        <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} stroke="#20302B" strokeWidth={3} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={5.5} fill="#20302B" />

        <text x={CX} y={CY - 24} textAnchor="middle" className="fill-ink" style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700 }}>
          {clamped}
        </text>
        <text x={CX} y={CY - 4} textAnchor="middle" className="fill-muted" style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500 }}>
          out of 100
        </text>
      </svg>
      <div className="text-sm font-semibold text-ink mt-1">{label}</div>
    </div>
  );
}
