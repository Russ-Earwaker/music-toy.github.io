/* src/bouncer-osd.js — tiny debug overlay for Bouncer */
export function installBouncerOSD(panel, sizing, getSpeed, getBall, getLaunchDiag){
  const osd = document.createElement('div');
  osd.style.position='absolute';
  osd.style.right='8px';
  osd.style.bottom='8px';
  osd.style.color='#9aa4b2';
  osd.style.font='11px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial';
  osd.style.background='rgba(0,0,0,0.35)';
  osd.style.padding='6px 8px';
  osd.style.borderRadius='6px';
  osd.style.pointerEvents='none';
  osd.style.display='none';
  osd.style.zIndex='5';
  osd.dataset.role='diag';
  try{ panel.appendChild(osd);}catch{}
  function tick(){
    try{ osd.style.display = globalThis.BOUNCER_DIAG ? 'block' : 'none'; }catch{}
    if (osd.style.display === 'block'){
      try{
        const d = (typeof getLaunchDiag === 'function') ? getLaunchDiag() : {};
        const sp = (typeof getSpeed === 'function') ? Number(getSpeed()||0) : 0;
        const ball = (typeof getBall === 'function') ? getBall() : null;
        const vmag = (ball && ball.vx!=null) ? Math.hypot(ball.vx, ball.vy) : 0;
        osd.textContent = `scale=${(sizing?.scale||1).toFixed(3)} speed=${sp.toFixed(2)} v=${vmag.toFixed(1)} baseDiag=${(d?.baseDiag||0).toFixed(1)} ppfOv=${(d?.ppfOverride||0).toFixed(3)}`;
      }catch{}
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return osd;
}
