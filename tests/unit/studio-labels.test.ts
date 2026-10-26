import { describe, expect, it } from "vitest";
import {
  editorReducer,
  initialEditorState,
} from "../../lib/studio/editor-state";
import {
  actionLabel,
  BLOCK_LABELS,
  blockLabel,
  fieldLabel,
  optionLabel,
} from "../../lib/studio/labels";
import { BLOCK_TYPES, PROP_RULES } from "../../lib/studio/layout-schema";
import { SYSTEM_TEMPLATES } from "../../lib/studio/templates";

describe("Studio human labels", () => {
  it("has one sentence-case label per block type and no raw identifiers", () => {
    expect(Object.keys(BLOCK_LABELS).sort()).toEqual([...BLOCK_TYPES].sort());
    for (const type of BLOCK_TYPES) {
      const label = blockLabel(type);
      expect(label).toMatch(/^[A-Z][a-z]+( [a-z]+)*$/);
      expect(label).not.toContain("_");
    }
    expect(blockLabel("quote_meta")).toBe("Quote details");
    expect(blockLabel("payment_schedule")).toBe("Payment schedule");
    expect(blockLabel("free_text")).toBe("Free text");
  });
  it("labels every inspector field and option readably", () => {
    for (const rules of Object.values(PROP_RULES))
      for (const [key, rule] of Object.entries(rules)) {
        expect(fieldLabel(key)).toMatch(/^[A-Z]/);
        expect(fieldLabel(key)).not.toMatch(/[_A-Z].*[A-Z]|_/);
        const options = Array.isArray(rule)
          ? rule
          : typeof rule === "object"
            ? (rule as { array: readonly string[] }).array
            : [];
        for (const option of options)
          expect(optionLabel(option)).toMatch(/^[A-Z0-9]/);
      }
    expect([
      "Sharp",
      "Rounded",
      "None",
      "Hairline",
      "Bold",
      "Compact",
      "Normal",
      "Airy",
    ]).toEqual(
      [
        "sharp",
        "rounded",
        "none",
        "hairline",
        "bold",
        "compact",
        "normal",
        "airy",
      ].map(optionLabel),
    );
    expect(optionLabel("x_of_y")).toBe("Page x of y");
    expect(optionLabel("tax_code")).toBe("Tax code");
    expect(actionLabel("template.default_set")).toBe("Template default set");
  });
  it("announces block changes by label", () => {
    let state = initialEditorState(SYSTEM_TEMPLATES[0].layout);
    state = editorReducer(state, {
      type: "add",
      block: { id: "free-1", type: "free_text", props: { text: "x" } },
    });
    expect(state.announcement).toBe("Free text added.");
    state = editorReducer(state, { type: "move", id: "free-1", to: 0 });
    expect(state.announcement).toBe(
      `Free text moved to position 1 of ${state.layout.blocks.length}.`,
    );
    state = editorReducer(state, { type: "remove", id: "free-1" });
    expect(state.announcement).toBe("Free text removed.");
  });
});
