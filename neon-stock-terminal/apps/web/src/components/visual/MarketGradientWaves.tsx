import { useMemo, type CSSProperties } from "react";
import { marketWaveProfileWithRsi } from "./marketGradientWaves";
import styles from "./MarketGradientWaves.module.css";

type WaveStyle = CSSProperties & {
  "--market-wave-canvas": string; "--market-wave-wash": string; "--market-wave-one": string; "--market-wave-two": string; "--market-wave-three": string; "--market-wave-accent": string;
  "--market-wave-opacity": string; "--market-wave-saturation": string; "--market-wave-soft-light-opacity": string; "--market-wave-drift-duration": string;
  "--market-wave-flow-one-duration": string; "--market-wave-flow-two-duration": string; "--market-wave-flow-three-duration": string;
};

export function MarketGradientWaves({ changePct, rsi }: { changePct: number | null | undefined; rsi: number | null | undefined }) {
  const profile = useMemo(() => marketWaveProfileWithRsi(changePct, rsi), [changePct, rsi]);
  const style = useMemo<WaveStyle>(() => ({
    "--market-wave-canvas": profile.canvas, "--market-wave-wash": profile.wash, "--market-wave-one": profile.waveOne, "--market-wave-two": profile.waveTwo, "--market-wave-three": profile.waveThree, "--market-wave-accent": profile.accent,
    "--market-wave-opacity": (0.5 + profile.brilliance * 0.36).toFixed(3), "--market-wave-saturation": (0.9 + profile.brilliance * 0.55).toFixed(3),
    "--market-wave-soft-light-opacity": (0.7 - profile.brilliance * 0.25).toFixed(3), "--market-wave-drift-duration": `${profile.driftSeconds.toFixed(2)}s`,
    "--market-wave-flow-one-duration": `${profile.flowOneSeconds.toFixed(2)}s`, "--market-wave-flow-two-duration": `${profile.flowTwoSeconds.toFixed(2)}s`, "--market-wave-flow-three-duration": `${profile.flowThreeSeconds.toFixed(2)}s`,
  }), [profile]);
  return <div className={styles.backdrop} style={style} data-market-gradient-waves="true" data-market-tone={profile.tone} data-market-band={profile.label} data-nifty-change-pct={Number.isFinite(changePct) ? Number(changePct).toFixed(2) : "unavailable"} data-nifty-rsi={profile.rsi == null ? "unavailable" : profile.rsi.toFixed(2)} data-wave-brilliance={profile.brilliance.toFixed(3)} data-wave-speed-seconds={profile.driftSeconds.toFixed(2)} aria-hidden="true"><svg className={styles.waves} viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false"><path className={styles.waveOne} pathLength="1" d="M-180 188 C 145 10, 420 374, 742 180 S 1260 12, 1620 220" /><path className={styles.waveTwo} pathLength="1" d="M-210 430 C 120 168, 430 616, 780 354 S 1300 194, 1640 456" /><path className={styles.waveThree} pathLength="1" d="M-190 705 C 160 450, 460 842, 810 635 S 1320 442, 1630 690" /></svg><div className={styles.softLight} /></div>;
}
