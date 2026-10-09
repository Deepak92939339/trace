"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./toast.module.css";

export type ToastContextValue = {
  showToast: (message: React.ReactNode) => void;
  toast: (message: React.ReactNode) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export type ToastProps = {
  message: React.ReactNode | null;
  visible: boolean;
  className?: string;
  id?: string;
};

export function Toast({ message, visible, className, id }: ToastProps) {
  const classNames = [
    styles.toast,
    visible ? styles.visible : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      id={id}
      className={classNames}
    >
      {visible ? message : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<React.ReactNode | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: React.ReactNode) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setMessage(msg);
    setVisible(true);

    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toast: showToast }}>
      {children}
      <Toast message={message} visible={visible} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
