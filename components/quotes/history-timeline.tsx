import React from "react";
import styles from "./history-timeline.module.css";

export type HistoryTimelineEvent = {
  id: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  actor?: string;
  at: string;
  atLabel: string;
  type?: string;
};

export type HistoryTimelineProps = {
  events: HistoryTimelineEvent[];
  className?: string;
};

function getDotColorClass(type?: string, title?: React.ReactNode): string {
  const t = (type || (typeof title === "string" ? title : "")).toLowerCase();
  if (t.includes("submit")) {
    return styles.dotAmber ?? "";
  }
  if (t.includes("approv") || t.includes("issue") || t.includes("accept")) {
    return styles.dotAccent ?? "";
  }
  if (t.includes("reject") || t.includes("declin")) {
    return styles.dotRed ?? "";
  }
  return styles.dotMuted ?? "";
}

export function HistoryTimeline({ events, className }: HistoryTimelineProps) {
  if (!events || events.length === 0) {
    return null;
  }

  return (
    <ol className={`${styles.timeline} ${className ?? ""}`.trim()}>
      {events.map((event, index) => {
        const dotColorClass = getDotColorClass(event.type, event.title);
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className={styles.item}>
            <div className={styles.rail} aria-hidden="true">
              <span className={`${styles.dot} ${dotColorClass}`} />
              {!isLast && <span className={styles.line} />}
            </div>
            <div className={styles.content}>
              <div className={styles.header}>
                <strong className={styles.title}>{event.title}</strong>
                <time dateTime={event.at} className={styles.time}>
                  {event.atLabel}
                </time>
              </div>
              {event.detail && (
                <div className={styles.detail}>{event.detail}</div>
              )}
              {event.actor && <div className={styles.actor}>{event.actor}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
