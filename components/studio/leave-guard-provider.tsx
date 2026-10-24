"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import styles from "./leave-guard-provider.module.css";
import {configureSignOut,confirmLeave,hasLeaveGuards,performSignOut,registerLeaveGuard} from "./leave-guard-registry.ts";
export {requestSignOut} from "./leave-guard-registry.ts";
export type BeforeSignOut = (slot:{proceed:()=>void|Promise<void>;close:()=>void})=>ReactNode;
const GuardScope = createContext(false);
export function useHasLeaveGuardProvider() { return useContext(GuardScope); }
const SENTINEL = "__traceStudioLeaveGuard";
export function LeaveGuardProvider({children,signOutAction,beforeSignOut}:{children:ReactNode;signOutAction:()=>void|Promise<void>;beforeSignOut?:BeforeSignOut}) {
  const [slot,setSlot]=useState<{proceed:()=>Promise<void>;close:()=>void}|null>(null);
  const dialog=useRef<HTMLDivElement>(null),restoreFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>configureSignOut(async()=>{
    if(!beforeSignOut){await performSignOut(signOutAction);return;}
    restoreFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    await new Promise<void>((resolve,reject)=>{
      const close=()=>{setSlot(null);resolve();restoreFocus.current?.focus();};
      setSlot({close,proceed:async()=>{setSlot(null);try{await performSignOut(signOutAction);resolve();}catch(error){reject(error);}}});
    });
  }),[signOutAction,beforeSignOut]);
  useEffect(()=>{if(slot)dialog.current?.querySelector<HTMLElement>('button,[href],input,[tabindex="0"]')?.focus();},[slot]);
  useEffect(()=>{
    const unload=(event:BeforeUnloadEvent)=>{if(hasLeaveGuards()){event.preventDefault();event.returnValue="";}};
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href]"):null;
      if(!link||link.hasAttribute("download")||(link.target&&link.target!=="_self"))return;
      const url=new URL(link.href,window.location.href);
      if(url.origin!==window.location.origin||url.href===window.location.href||url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
      if(!confirmLeave()){event.preventDefault();event.stopImmediatePropagation();}
    };
    window.addEventListener("beforeunload",unload);document.addEventListener("click",click,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",click,true);};
  },[]);
  return <GuardScope.Provider value={true}>{children}{slot&&beforeSignOut&&<div role="dialog" aria-modal="true" aria-label="Before signing out" ref={dialog} className={styles.dialog} onKeyDown={event=>{
    if(event.key==="Escape"){event.preventDefault();slot.close();}
    if(event.key==="Tab"){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')??[]),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>{beforeSignOut(slot)}<button type="button" onClick={slot.close}>Cancel sign out</button></div>}</GuardScope.Provider>;
}
/** Register dirty state; push one sentinel while dirty and restore it after a rejected Back. */
export function useLeaveGuard(isDirty:boolean) {
  const inScope=useHasLeaveGuardProvider();
  useEffect(()=>{
    if(!isDirty||!inScope)return;
    const unregister=registerLeaveGuard(()=>window.confirm("Leave without saving your Studio changes?"));
    const token=crypto.randomUUID();
    let active=true,restoring=false;
    history.pushState({...history.state,[SENTINEL]:token},"",location.href);
    const pop=(event:PopStateEvent)=>{
      if(restoring){restoring=false;event.stopImmediatePropagation();return;}
      if(!active||history.state?.[SENTINEL]===token)return;
      event.stopImmediatePropagation();
      if(confirmLeave()){
        active=false;unregister();window.removeEventListener("popstate",pop,true);
        // First Back consumed our duplicate; the next reaches the actual previous page.
        history.back();
      }else{
        restoring=true;history.go(1);
      }
    };
    window.addEventListener("popstate",pop,true);
    return()=>{active=false;unregister();window.removeEventListener("popstate",pop,true);
      // Do not navigate during React cleanup. Remove only our marker, preserving Next state.
      if(history.state?.[SENTINEL]===token){const next={...history.state};delete next[SENTINEL];history.replaceState(next,"",location.href);}
    };
  },[isDirty,inScope]);
}
