"use client";

import {useId, useRef, useState, type ReactNode} from "react";
import {ListBullets, X} from "@phosphor-icons/react";
import "./project-list-drawer.css";

export default function ProjectListDrawer({count, children}: {count:number; children:ReactNode}) {
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  const show=()=>{
    const bounds=trigger.current?.getBoundingClientRect();
    if (!dialog.current || !bounds) return;
    dialog.current.style.setProperty("--drawer-left",`${Math.max(16,Math.min(bounds.left,window.innerWidth-396))}px`);
    dialog.current.style.setProperty("--drawer-top",`${Math.max(16,Math.min(bounds.bottom+12,window.innerHeight-300))}px`);
    dialog.current.showModal();
    setOpen(true);
  };
  const close=()=>dialog.current?.close();
  return <div className="home-project-picker">
    <button ref={trigger} type="button" className="project-drawer-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show}>
      <ListBullets size={20} weight="bold" aria-hidden="true" />
      <span>과제 목록</span><span className="project-drawer-count">{count}</span>
    </button>
    <dialog ref={dialog} id={id} className="home-project-drawer" aria-label="과제 목록" onClose={()=>{setOpen(false);trigger.current?.focus();}} onKeyDown={event=>{
      if (event.key!=="Tab") return;
      const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element=>element.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    }} onClick={event=>{
      if (event.target===event.currentTarget) {
        const box=event.currentTarget.getBoundingClientRect();
        if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) close();
      }
      if ((event.target as Element).closest('[data-project-select]')) close();
    }}>
      <button type="button" className="project-drawer-close" onClick={close} autoFocus>닫기 <X size={16} aria-hidden="true" /></button>
      {children}
    </dialog>
  </div>;
}
