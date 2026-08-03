import React from "react";
import styles from "./N50Button.module.css";

type Variant = "red" | "green" | "ghost";

export function N50Button({
  variant = "ghost",
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className ?? ""}`} {...rest}>
      <span className={styles.label}>{children}</span>
    </button>
  );
}
