// src/theme-switcher.js — Floating theme switcher with arrows (<300 lines)
import { THEMES } from './themes.js';

function build(){
  const id = 'theme-switcher-wrap';
  let wrap = document.getElementById(id);
  if (wrap) return;
  wrap = document.createElement('div'); wrap.id = id;
  wrap.style.cssText = 'position:fixed;left:10px;top:8px;z-index:12000;display:flex;gap:8px;align-items:center;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px 10px;backdrop-filter:blur(4px);pointer-events:auto';

  const label = document.createElement('span'); label.textContent='Theme:';
  const prev = document.createElement('button'); prev.textContent='◀'; prev.className='btn-theme-prev';
  const next = document.createElement('button'); next.textContent='▶'; next.className='btn-theme-next';
  const name = document.createElement('span'); name.id = 'theme-name'; name.style.minWidth='120px'; name.style.textAlign='center';

  const keys = Object.keys(THEMES||{});
  let i = Math.max(0, keys.indexOf((window.ThemeBoot && window.ThemeBoot.getActiveThemeKey && window.ThemeBoot.getActiveThemeKey()) || keys[0]));

  function apply(){
    name.textContent = keys[i] ? keys[i].split('_').join(' ') : '';
    try{ window.ThemeBoot && window.ThemeBoot.setTheme && window.ThemeBoot.setTheme(keys[i]); }catch{}
    console.log('[THEME][floating] change ->', keys[i]);
  }
  prev.addEventListener('click', (e)=>{ e.stopPropagation(); i = (i-1+keys.length)%keys.length; apply(); });
  next.addEventListener('click', (e)=>{ e.stopPropagation(); i = (i+1)%keys.length; apply(); });

  wrap.append(label, prev, name, next);
  document.body.appendChild(wrap);
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', build);
else build();
