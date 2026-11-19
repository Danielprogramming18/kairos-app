import React, { useEffect, useId, useState } from 'react';
import { usePlanning } from '../app/PlanningContext';
import './planning.css';

export function Field({label,children}:{label:string;children:React.ReactNode}) {
  const id=useId();
  return <div className="kp-field"><label htmlFor={id}>{label}</label>{React.isValidElement<{id?:string}>(children)?React.cloneElement(children,{id}):children}</div>;
}
export function PlanningShell({title,children,disabled=false}:{title:string;children:React.ReactNode;disabled?:boolean}) {
  const p=usePlanning();
  return <section className="kp" dir="rtl"><h2>{title}</h2>{p.error&&<div role="alert" className="kp-error">{p.error}<button onClick={()=>void p.refresh()}>تازه‌سازی</button></div>}{!p.ready?<p>در حال خواندن اطلاعات…</p>:<fieldset disabled={p.busy || disabled}>{children}</fieldset>}</section>;
}
export function useClock() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const tick=()=>setNow(new Date());const timer=window.setInterval(tick,30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{window.clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};},[]);
  return now;
}
