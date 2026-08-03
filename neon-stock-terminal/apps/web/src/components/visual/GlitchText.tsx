import styles from "./GlitchText.module.css";

export type GlitchTone = "red" | "green" | "white";

export function GlitchText({
  text,
  tone = "white",
  className
}: {
  text: string;
  tone?: GlitchTone;
  className?: string;
}) {
  return (
    <span className={`${styles.glitch} ${className ?? ""}`} data-tone={tone} data-text={text}>
      {text}
    </span>
  );
}
