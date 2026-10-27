import { parseLayout, type Block, type Layout } from "./layout-schema.ts";
import { blockLabel } from "./labels.ts";
export type EditorState = {
  layout: Layout;
  past: readonly Layout[];
  future: readonly Layout[];
  selected: string | null;
  saved: string;
  announcement: string;
};
export type EditorAction =
  | { type: "load"; layout: Layout }
  | { type: "select"; id: string | null }
  | { type: "replace"; layout: Layout }
  | { type: "add"; block: Block }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "update"; block: Block }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved" };
export function initialEditorState(layout: Layout): EditorState {
  const clean = parseLayout(layout);
  return {
    layout: clean,
    past: [],
    future: [],
    selected: null,
    saved: JSON.stringify(clean),
    announcement: "",
  };
}
export function isDirty(state: EditorState) {
  return JSON.stringify(state.layout) !== state.saved;
}
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  if (action.type === "load") return initialEditorState(action.layout);
  if (action.type === "select")
    return {
      ...state,
      selected: state.layout.blocks.some((b) => b.id === action.id)
        ? action.id
        : null,
    };
  if (action.type === "saved")
    return {
      ...state,
      saved: JSON.stringify(state.layout),
      announcement: "Template saved.",
    };
  if (action.type === "undo") {
    const layout = state.past.at(-1);
    return layout
      ? {
          ...state,
          layout,
          past: state.past.slice(0, -1),
          future: [state.layout, ...state.future].slice(0, 50),
          selected: null,
          announcement: "Change undone.",
        }
      : state;
  }
  if (action.type === "redo") {
    const layout = state.future[0];
    return layout
      ? {
          ...state,
          layout,
          past: [...state.past, state.layout].slice(-50),
          future: state.future.slice(1),
          selected: null,
          announcement: "Change redone.",
        }
      : state;
  }
  let layout: Layout;
  const blocks = [...state.layout.blocks];
  let announcement = "Layout updated.";
  if (action.type === "replace") layout = action.layout;
  else {
    if (action.type === "add") {
      blocks.push(action.block);
      announcement = `${blockLabel(action.block.type)} added.`;
    }
    if (action.type === "remove") {
      const index = blocks.findIndex((b) => b.id === action.id);
      if (index < 0) return state;
      const [gone] = blocks.splice(index, 1);
      announcement = `${blockLabel(gone!.type)} removed.`;
    }
    if (action.type === "update") {
      const index = blocks.findIndex((b) => b.id === action.block.id);
      if (index < 0) return state;
      blocks[index] = action.block;
    }
    if (action.type === "move") {
      const from = blocks.findIndex((b) => b.id === action.id),
        to = Math.max(0, Math.min(blocks.length - 1, Math.trunc(action.to)));
      if (from < 0 || !Number.isFinite(to) || from === to) return state;
      const [block] = blocks.splice(from, 1);
      blocks.splice(to, 0, block!);
      announcement = `${blockLabel(block!.type)} moved to position ${to + 1} of ${blocks.length}.`;
    }
    layout = { ...state.layout, blocks };
  }
  try {
    layout = parseLayout(layout);
  } catch {
    return {
      ...state,
      announcement:
        "That change is not valid. A layout needs 1–60 blocks and at most one line table and totals block.",
    };
  }
  if (JSON.stringify(layout) === JSON.stringify(state.layout)) return state;
  return {
    ...state,
    layout,
    past: [...state.past, state.layout].slice(-50),
    future: [],
    selected:
      action.type === "add"
        ? action.block.id
        : layout.blocks.some((b) => b.id === state.selected)
          ? state.selected
          : null,
    announcement,
  };
}
