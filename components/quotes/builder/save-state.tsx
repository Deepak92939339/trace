import styles from "./save-state.module.css";

type SaveStateProps = {
  saveState: string;
  saveMessage: string;
  staleConflict: boolean;
  onReloadServerState: () => void;
};

export function SaveState({
  saveState,
  saveMessage,
  staleConflict,
  onReloadServerState,
}: SaveStateProps) {
  const stateClass = `save-${saveState.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`;

  return (
    <>
      <div
        className={`save-indicator ${stateClass} ${styles.saveIndicator}`}
        aria-live="polite"
        role="status"
      >
        <strong>{saveState}</strong>
        <span>{saveMessage}</span>
      </div>
      {staleConflict && (
        <button
          className={`button ${styles.reloadButton}`}
          type="button"
          onClick={onReloadServerState}
        >
          Reload server state
        </button>
      )}
    </>
  );
}
