import React, { Component, useEffect, useState } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Fault-isolation boundary ensuring that any unexpected rendering issue in the
 * decorative technology visualization can never disrupt the login form or
 * corporate identity content.
 */
class BackgroundFaultBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const NODES: Array<{ id: string; cx: number; cy: number; r: number; accent: 'cyan' | 'gold' | 'slate'; delay: string }> = [
  { id: 'n1', cx: 88, cy: 112, r: 3.2, accent: 'cyan', delay: '0s' },
  { id: 'n2', cx: 218, cy: 76, r: 2.6, accent: 'slate', delay: '1.2s' },
  { id: 'n3', cx: 348, cy: 128, r: 3.5, accent: 'gold', delay: '2.4s' },
  { id: 'n4', cx: 468, cy: 88, r: 2.4, accent: 'cyan', delay: '0.8s' },
  { id: 'n5', cx: 142, cy: 238, r: 2.8, accent: 'slate', delay: '1.9s' },
  { id: 'n6', cx: 278, cy: 214, r: 4.0, accent: 'cyan', delay: '0.4s' },
  { id: 'n7', cx: 418, cy: 242, r: 3.0, accent: 'slate', delay: '2.8s' },
  { id: 'n8', cx: 74, cy: 386, r: 2.6, accent: 'gold', delay: '1.5s' },
  { id: 'n9', cx: 214, cy: 362, r: 3.2, accent: 'cyan', delay: '2.1s' },
  { id: 'n10', cx: 356, cy: 392, r: 3.6, accent: 'cyan', delay: '0.9s' },
  { id: 'n11', cx: 472, cy: 352, r: 2.5, accent: 'gold', delay: '3.1s' },
  { id: 'n12', cx: 132, cy: 528, r: 3.0, accent: 'slate', delay: '1.1s' },
  { id: 'n13', cx: 288, cy: 512, r: 3.4, accent: 'gold', delay: '2.6s' },
  { id: 'n14', cx: 432, cy: 544, r: 2.8, accent: 'cyan', delay: '0.6s' },
  { id: 'n15', cx: 186, cy: 676, r: 2.6, accent: 'cyan', delay: '1.7s' },
  { id: 'n16', cx: 364, cy: 664, r: 3.0, accent: 'slate', delay: '2.2s' },
];

const EDGES: Array<{ from: number; to: number; emphasis?: 'cyan' | 'gold' }> = [
  { from: 0, to: 1 },
  { from: 1, to: 2, emphasis: 'gold' },
  { from: 2, to: 3 },
  { from: 0, to: 4 },
  { from: 1, to: 5, emphasis: 'cyan' },
  { from: 2, to: 5 },
  { from: 2, to: 6 },
  { from: 3, to: 6 },
  { from: 4, to: 5 },
  { from: 5, to: 6, emphasis: 'cyan' },
  { from: 4, to: 7 },
  { from: 4, to: 8 },
  { from: 5, to: 8 },
  { from: 5, to: 9, emphasis: 'cyan' },
  { from: 6, to: 9 },
  { from: 6, to: 10 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 9, to: 10, emphasis: 'gold' },
  { from: 7, to: 11 },
  { from: 8, to: 11 },
  { from: 8, to: 12 },
  { from: 9, to: 12, emphasis: 'gold' },
  { from: 9, to: 13 },
  { from: 10, to: 13 },
  { from: 11, to: 12 },
  { from: 12, to: 13, emphasis: 'cyan' },
  { from: 11, to: 14 },
  { from: 12, to: 14 },
  { from: 12, to: 15 },
  { from: 13, to: 15 },
  { from: 14, to: 15 },
];

const PARTICLES: Array<{ cx: number; cy: number; r: number; fill: string; delay: string; duration: string }> = [
  { cx: 168, cy: 158, r: 1.5, fill: '#00C2C7', delay: '0s', duration: '9s' },
  { cx: 318, cy: 274, r: 1.4, fill: '#D4AF37', delay: '2.2s', duration: '11s' },
  { cx: 242, cy: 438, r: 1.6, fill: '#00C2C7', delay: '1.1s', duration: '10s' },
  { cx: 396, cy: 468, r: 1.3, fill: '#94A3B8', delay: '3.4s', duration: '12s' },
  { cx: 152, cy: 604, r: 1.5, fill: '#D4AF37', delay: '0.7s', duration: '10.5s' },
  { cx: 410, cy: 174, r: 1.4, fill: '#00C2C7', delay: '2.8s', duration: '9.5s' },
];

const TechnologyMeshInner: React.FC = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    return undefined;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {/* Subtle architectural depth illumination (restrained cyan & metallic gold) */}
      <div
        className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(0, 194, 199, 0.28) 0%, rgba(11, 31, 59, 0) 72%)',
        }}
      />
      <div
        className="absolute -bottom-28 -left-20 w-80 h-80 rounded-full opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.22) 0%, rgba(8, 21, 41, 0) 72%)',
        }}
      />

      {/* Lightweight vector infrastructure grid, neural pathways & blockchain node lattice */}
      <svg
        viewBox="0 0 540 760"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full opacity-[0.42]"
        focusable="false"
      >
        <defs>
          <pattern id="dti-login-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path
              d="M 36 0 L 0 0 0 36"
              fill="none"
              stroke="rgba(148, 163, 184, 0.12)"
              strokeWidth="0.75"
            />
          </pattern>
          <linearGradient id="dti-login-edge-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00C2C7" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#00C2C7" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="dti-login-edge-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id="dti-login-fade" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.15" />
          </radialGradient>
          <mask id="dti-login-vignette-mask">
            <rect width="540" height="760" fill="url(#dti-login-fade)" />
          </mask>
        </defs>

        <g mask="url(#dti-login-vignette-mask)">
          {/* Digital infrastructure grid */}
          <rect width="540" height="760" fill="url(#dti-login-grid)" />

          {/* Subtle enterprise architectural data pathways */}
          <g className={reducedMotion ? '' : 'dti-login-mesh-drift'}>
            {EDGES.map((edge, idx) => {
              const a = NODES[edge.from];
              const b = NODES[edge.to];
              const stroke =
                edge.emphasis === 'cyan'
                  ? 'url(#dti-login-edge-cyan)'
                  : edge.emphasis === 'gold'
                  ? 'url(#dti-login-edge-gold)'
                  : 'rgba(148, 163, 184, 0.18)';
              return (
                <line
                  key={`edge-${idx}`}
                  x1={a.cx}
                  y1={a.cy}
                  x2={b.cx}
                  y2={b.cy}
                  stroke={stroke}
                  strokeWidth={edge.emphasis ? 1.05 : 0.7}
                />
              );
            })}

            {/* Interconnected nodes */}
            {NODES.map((node) => {
              const fill =
                node.accent === 'cyan'
                  ? '#00C2C7'
                  : node.accent === 'gold'
                  ? '#D4AF37'
                  : '#94A3B8';
              return (
                <g
                  key={node.id}
                  className={reducedMotion ? '' : 'dti-login-node-pulse'}
                  style={reducedMotion ? undefined : { animationDelay: node.delay }}
                >
                  {node.accent !== 'slate' && (
                    <circle
                      cx={node.cx}
                      cy={node.cy}
                      r={node.r * 3.1}
                      fill="none"
                      stroke={fill}
                      strokeOpacity="0.22"
                      strokeWidth="0.75"
                    />
                  )}
                  <circle cx={node.cx} cy={node.cy} r={node.r} fill={fill} fillOpacity="0.82" />
                </g>
              );
            })}

            {/* Slow-drifting network particles */}
            {!reducedMotion &&
              PARTICLES.map((p, idx) => (
                <circle
                  key={`particle-${idx}`}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={p.fill}
                  fillOpacity="0.65"
                  className="dti-login-particle-float"
                  style={{
                    animationDelay: p.delay,
                    animationDuration: p.duration,
                  }}
                />
              ))}
          </g>
        </g>
      </svg>

      {/* Readability veil ensuring crisp contrast behind corporate text */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(8, 21, 41, 0.52) 0%, rgba(11, 31, 59, 0.34) 45%, rgba(8, 21, 41, 0.72) 100%)',
        }}
      />
    </div>
  );
};

export const ClientPortalTechnologyBackground: React.FC = () => (
  <BackgroundFaultBoundary>
    <TechnologyMeshInner />
  </BackgroundFaultBoundary>
);

export default ClientPortalTechnologyBackground;
