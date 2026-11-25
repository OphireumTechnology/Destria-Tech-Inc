import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { BlockchainNetworkCanvas } from './BlockchainNetworkCanvas';

interface TechBackgroundErrorBoundaryProps {
  children: ReactNode;
}

interface TechBackgroundErrorBoundaryState {
  hasError: boolean;
}

/**
 * Fault-isolation boundary ensuring any runtime canvas or graphics context
 * error degrades cleanly to the static corporate gradient & grid without
 * disrupting Corporate Resources accessibility or downloads.
 */
class TechBackgroundErrorBoundary extends Component<
  TechBackgroundErrorBoundaryProps,
  TechBackgroundErrorBoundaryState
> {
  state: TechBackgroundErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): TechBackgroundErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Gracefully degraded to static gradient backdrop
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

/**
 * CorporateResourcesTechBackground
 *
 * Refined enterprise technology background for the DESTRIA TECH INC Corporate
 * Resources section and Download Center. Layers Graphite (#111827) and Deep
 * Navy (#0B1F3B) depth gradients, a subtle holographic architectural grid,
 * understated circuit nodes in Technology Cyan (#00C2C7), Technology Blue
 * (#0EA5E9), and Metallic Gold (#D4AF37), and a fault-isolated lightweight
 * connected-node canvas that automatically suspends under
 * `prefers-reduced-motion: reduce`.
 */
export const CorporateResourcesTechBackground: React.FC = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }
    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {/* Layered Deep Navy & Graphite Enterprise Depth Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#0B1F3B]" />

      {/* Restrained Atmospheric Glows (Approved Palette Only) */}
      <div className="absolute -top-32 right-[12%] h-[420px] w-[420px] rounded-full bg-[#00C2C7]/[0.07] blur-[120px]" />
      <div className="absolute top-[38%] -left-24 h-[380px] w-[380px] rounded-full bg-[#0EA5E9]/[0.06] blur-[120px]" />
      <div className="absolute -bottom-28 right-[26%] h-[320px] w-[320px] rounded-full bg-[#D4AF37]/[0.05] blur-[110px]" />

      {/* Subtle Architectural Blueprint Grid & Geometric Circuit Pathways */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.22]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="destria-resources-grid"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 64 0 L 0 0 0 64"
              fill="none"
              stroke="#00C2C7"
              strokeOpacity="0.14"
              strokeWidth="0.75"
            />
            <circle cx="0" cy="0" r="1.2" fill="#00C2C7" fillOpacity="0.28" />
          </pattern>
          <linearGradient id="destria-circuit-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00C2C7" stopOpacity="0" />
            <stop offset="35%" stopColor="#00C2C7" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#0EA5E9" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width="100%" height="100%" fill="url(#destria-resources-grid)" />

        {/* Subtle Horizon & Angular Enterprise Circuit Traces */}
        <path
          d="M 0 118 H 240 L 288 158 H 640 L 680 128 H 1440"
          fill="none"
          stroke="url(#destria-circuit-line)"
          strokeWidth="1"
        />
        <path
          d="M 1440 460 H 1120 L 1072 420 H 720 L 672 456 H 0"
          fill="none"
          stroke="url(#destria-circuit-line)"
          strokeWidth="0.9"
          strokeOpacity="0.7"
        />
        <circle cx="288" cy="158" r="2.5" fill="#00C2C7" fillOpacity="0.55" />
        <circle cx="680" cy="128" r="2.5" fill="#D4AF37" fillOpacity="0.6" />
        <circle cx="1072" cy="420" r="2.5" fill="#0EA5E9" fillOpacity="0.55" />
      </svg>

      {/* Lightweight Fault-Isolated Connected Node Canvas (Paused Off-Screen & Disabled on Reduced Motion) */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <TechBackgroundErrorBoundary>
            <BlockchainNetworkCanvas
              nodeCount={28}
              interactive={false}
              className="w-full h-full pointer-events-none"
            />
          </TechBackgroundErrorBoundary>
        </div>
      )}

      {/* Edge Vignette for Consistent Text Contrast Across Viewports */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#111827]/70 via-transparent to-[#111827]/85" />
    </div>
  );
};
