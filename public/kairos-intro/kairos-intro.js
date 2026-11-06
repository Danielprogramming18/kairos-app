/* Independent local onboarding; only trusted local illustration strings are inserted. */
(()=>{'use strict';
const root=document.getElementById('kairos-intro-root'),deck=document.getElementById('kairos-intro-deck'),dots=document.getElementById('kairos-intro-dots'),next=document.getElementById('kairos-intro-next'),prev=document.getElementById('kairos-intro-prev'),skip=document.getElementById('kairos-intro-skip'),status=document.getElementById('kairos-intro-status');

// Track input intent explicitly: older Android WebViews may treat a tap as focus-visible.
root.dataset.input = 'pointer';
const usePointer = () => { root.dataset.input = 'pointer'; };
root.addEventListener('pointerdown', usePointer, { passive: true, capture: true });
root.addEventListener('touchstart', usePointer, { passive: true, capture: true });
root.addEventListener('mousedown', usePointer, { passive: true, capture: true });
document.addEventListener('keydown', event => {
  if (!event.altKey && !event.ctrlKey && !event.metaKey &&
      ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
    root.dataset.input = 'keyboard';
  }
}, true);

const slides=window.KairosIntroData.slides,preview=new URLSearchParams(location.search).get('preview')==='1',reduce=matchMedia('(prefers-reduced-motion: reduce)');
let index=0,ended=false,frame=0,elapsed=0,last=0,touch=null,bridgeError=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function emit(type,reason){const event={version:1,type,slideId:slides[index].id,slideIndex:index,totalSlides:slides.length,reason};document.getElementById('kairos-intro-event').textContent=type+' / '+event.slideId;window.dispatchEvent(new CustomEvent('kairos-intro-event',{detail:event}));try{if(window.KairosOnboarding&&typeof window.KairosOnboarding.postMessage==='function'){window.KairosOnboarding.postMessage(JSON.stringify(event));return true;}}catch(e){bridgeError=true;}return false;}
function halt(){cancelAnimationFrame(frame);frame=0;last=0;}
function tick(now){if(document.hidden||ended||reduce.matches)return;const delta=last?Math.min(now-last,100):0;last=now;elapsed+=delta;const slide=deck.querySelector('section');if(!slide)return;
if(slides[index].id==='planning'){const title=slide.querySelector('.kairos-intro-task-title');if(title)title.textContent='ادامهٔ پروژه'.slice(0,Math.max(0,Math.floor((elapsed-400)/90)));const strike=slide.querySelector('.kairos-intro-task-strike');if(strike)strike.setAttribute('opacity',elapsed>2200?'1':'0');}
if(slides[index].id==='focus'){const seconds=Math.min(3,Math.floor(Math.max(0,elapsed-700)/1000));slide.querySelector('.kairos-intro-clock').textContent=seconds?'24:'+String(60-seconds).padStart(2,'0'):'25:00';slide.dataset.running=elapsed>=700&&elapsed<4000?'true':'false';slide.querySelector('.kairos-intro-ring').setAttribute('stroke-dasharray',(22+seconds/15)+' 100');}
if(slides[index].id==='habits'){const msg='یک ایدهٔ تازه…';slide.querySelector('.kairos-intro-note').textContent=msg.slice(0,Math.max(0,Math.floor((elapsed-300)/95)));}
if(elapsed<5000)frame=requestAnimationFrame(tick);}
function play(){halt();if(!reduce.matches&&!document.hidden&&!ended)frame=requestAnimationFrame(tick);else if(reduce.matches){const note=deck.querySelector('.kairos-intro-note');if(note)note.textContent='یک ایدهٔ تازه…';const title=deck.querySelector('.kairos-intro-task-title');if(title)title.textContent='ادامهٔ پروژه';const strike=deck.querySelector('.kairos-intro-task-strike');if(strike)strike.setAttribute('opacity','1');}}
function render(announce=false){halt();elapsed=0;const s=slides[index];let art=s.id==='welcome'?'<img class="kairos-intro-logo" src="kairos-intro-assets/kairos-intro-logo.png" alt=""><span class="kairos-intro-badge" aria-hidden="true">✓</span><span class="kairos-intro-badge" aria-hidden="true">＋</span>':window.KairosIntroArt[s.id];
// IDs in SVG are only present for the active slide, preventing gradient collisions.
deck.innerHTML='<section class="kairos-intro-slide" aria-labelledby="kairos-intro-title"><div class="kairos-intro-art" aria-hidden="true">'+art+'</div><div class="kairos-intro-copy"><div class="kairos-intro-eyebrow">'+esc(s.eyebrow)+'</div><h1 id="kairos-intro-title" tabindex="-1">'+esc(s.title)+'</h1><p>'+esc(s.text)+'</p>'+(s.id==='welcome'?'<p class="kairos-intro-credits">ایده‌پرداز و سازنده: <strong>دانیال صادقیان</strong><br>با همکاری <strong>انتشارات گیوسترن</strong></p>':'')+(s.id==='offline'?'<p class="kairos-intro-disclaimer">همگام‌سازی خودکار بین دستگاه‌ها فعلاً فعال نیست.</p>':'')+'</div></section>';
next.querySelector('span').textContent=s.button;prev.hidden=index===0;[...dots.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));if(announce)status.textContent='اسلاید '+(index+1)+' از '+slides.length+'؛ '+s.title;play();}
function goTo(n,reason='host'){if(ended||!Number.isInteger(n)||n<0||n>=slides.length||n===index)return false;index=n;render(true);emit('slide_change',reason);return true;}
function finish(type){if(ended)return;ended=true;halt();next.disabled=true;skip.disabled=true;prev.disabled=true;const sent=emit(type,'button');deck.innerHTML='<div class="kairos-intro-end"><h1 tabindex="-1">'+(sent?'آمادهٔ شروعی تازه':'معرفی به پایان رسید')+'</h1><p>'+(sent?'در حال ورود به کایروس…':bridgeError?'ارتباط با میزبان برقرار نشد. اتصال اندروید را بررسی کنید.':'این نسخه مستقل است. در برنامهٔ اندروید، از اینجا وارد کایروس می‌شوی.')+'</p></div>';dots.hidden=true;next.hidden=true;prev.hidden=true;skip.hidden=true;deck.querySelector('h1').focus();if(!sent||preview)document.getElementById('kairos-intro-preview').hidden=false;}
function restart(){ended=false;index=0;next.disabled=skip.disabled=prev.disabled=false;next.hidden=skip.hidden=dots.hidden=false;render(true);emit('ready','replay');}
slides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','اسلاید '+(i+1)+'؛ '+s.title);b.onclick=()=>goTo(i,'indicator');dots.appendChild(b);});
next.onclick=()=>index===slides.length-1?finish('complete'):goTo(index+1,'next');prev.onclick=()=>goTo(index-1,'previous');skip.onclick=()=>finish('skip');document.getElementById('kairos-intro-replay').onclick=restart;
root.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||ended)return;if(e.key==='ArrowLeft'){e.preventDefault();goTo(index+1,'keyboard');}if(e.key==='ArrowRight'){e.preventDefault();goTo(index-1,'keyboard');}});
deck.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.pointerType!=='mouse')touch={x:e.clientX,y:e.clientY};});deck.addEventListener('pointerup',e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)goTo(index+(dx>0?1:-1),'swipe');});deck.addEventListener('pointercancel',()=>touch=null);
document.addEventListener('visibilitychange',()=>{root.dataset.paused=String(document.hidden);if(document.hidden)halt();else play();});const motionChange=()=>{if(!ended)render();};if(reduce.addEventListener)reduce.addEventListener('change',motionChange);else reduce.addListener(motionChange);
window.KairosIntro={next:()=>goTo(index+1),previous:()=>goTo(index-1),goTo:n=>goTo(n),setTheme:mode=>{if(!['light','dark','system'].includes(mode))return false;if(mode==='system')delete root.dataset.theme;else root.dataset.theme=mode;return true;},getState:()=>({index,slideId:slides[index].id,ended,version:1}),restart};
render();document.getElementById('kairos-intro-preview').hidden=!preview;emit('ready','init');
})();
