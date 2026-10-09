import React from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";

export type ReasonChipProps = {
  code: string;
  className?: string;
  id?: string;
};

type ReasonDefinition = {
  label: string;
  tone: ChipTone;
};

const KNOWN_REASONS: Record<string, ReasonDefinition> = {
  discount_above_threshold: {
    label: "Discount over limit",
    tone: "amber",
  },
  // reserved: backend P1 (cost price)
  below_cost: {
    label: "Below cost",
    tone: "red",
  },
  // reserved: backend P1 (cost price)
  margin_under_floor: {
    label: "Margin under floor",
    tone: "red",
  },
  successor_revision: {
    label: "Successor revision",
    tone: "neutral",
  },
};

function formatUnknownCode(code: string): string {
  if (!code) return "Unknown";
  return code
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ReasonChip({ code, className, id }: ReasonChipProps) {
  const definition = KNOWN_REASONS[code];
  const label = definition ? definition.label : formatUnknownCode(code);
  const tone: ChipTone = definition ? definition.tone : "neutral";

  return (
    <Chip tone={tone} className={className} id={id}>
      {label}
    </Chip>
  );
}
