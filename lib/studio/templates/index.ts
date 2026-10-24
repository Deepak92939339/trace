import type { Layout } from "../layout-schema.ts";
import { classic } from "./classic.ts";
import { modern } from "./modern.ts";
import { industrial } from "./industrial.ts";
import { compact } from "./compact.ts";
import { exec } from "./exec.ts";
import { project } from "./project.ts";
import { showcase } from "./showcase.ts";
import { dark } from "./dark.ts";
export const SYSTEM_TEMPLATE_VERSION = 2; // 2: Executive and Premium Dark carry the company in the cover; no standalone letterhead
export const SYSTEM_TEMPLATES = [
  { key: "classic", name: "Classic Formal", layout: classic },
  { key: "modern", name: "Modern Minimal", layout: modern },
  { key: "industrial", name: "Bold Industrial", layout: industrial },
  { key: "compact", name: "Compact One-Pager", layout: compact },
  { key: "exec", name: "Executive Cover + Detail", layout: exec },
  { key: "project", name: "Project / Service", layout: project },
  { key: "showcase", name: "Product Showcase", layout: showcase },
  { key: "dark", name: "Premium Dark Accent", layout: dark },
] as const satisfies readonly { key: string; name: string; layout: Layout }[];
export type SystemTemplateKey = typeof SYSTEM_TEMPLATES[number]["key"];
export function systemTemplate(key: string) { return SYSTEM_TEMPLATES.find(t => t.key === key); }
