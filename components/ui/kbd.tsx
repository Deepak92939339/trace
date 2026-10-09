import React from "react";
import styles from "./kbd.module.css";

export type KbdProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

export function Kbd({ children, className, id }: KbdProps) {
  const classNames = [styles.kbd, className ?? ""].filter(Boolean).join(" ");

  return (
    <kbd className={classNames} id={id}>
      {children}
    </kbd>
  );
}
