// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/link",()=>({default:(props:AnchorHTMLAttributes<HTMLAnchorElement>)=>createElement("a",props)}));
import { ProfileMenu } from "../../components/shell/profile-menu";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const base={displayName:"Anika Admin",roleLabel:"Organization admin",organizationName:"Trace Demo",canReadStudio:true,canExport:true,signOutAction:vi.fn()};
describe("Studio profile menu keyboard",()=>{
 it("opens, moves with arrows, closes with Escape and returns focus",async()=>{
  await act(async()=>root.render(createElement(ProfileMenu,base)));
  const trigger=host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await act(async()=>trigger.click());expect(trigger.getAttribute("aria-expanded")).toBe("true");expect(document.activeElement?.textContent).toBe("Studio");
  await act(async()=>document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})));
  expect(document.activeElement?.textContent).toBe("Export workspace");
  await act(async()=>document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(host.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement).toBe(trigger);
 });
 it("omits shortcuts without capability and provides the beforeSignOut slot",async()=>{
  const proceed=vi.fn();await act(async()=>root.render(createElement(ProfileMenu,{...base,canReadStudio:false,canExport:false,signOutAction:proceed,beforeSignOut:slot=>createElement("button",{role:"menuitem",onClick:()=>slot.proceed()},"Review leaving") })));
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click());
  expect([...host.querySelectorAll('[role="menuitem"]')].map(n=>n.textContent)).toEqual(["Sign out"]);expect(proceed).not.toHaveBeenCalled();
  await act(async()=>host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());expect(proceed).not.toHaveBeenCalled();
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Review leaving")!.click());expect(proceed).toHaveBeenCalledTimes(1);
 });
});
