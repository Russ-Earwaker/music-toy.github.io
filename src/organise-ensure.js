// src/organise-ensure.js
(function(){
  if (window.__mtOrganiseEnsure) return; window.__mtOrganiseEnsure = true;
  function ensure(){
    if (document.getElementById('organise-toys-btn')) return;
    const b = document.createElement('button');
    b.id='organise-toys-btn'; b.textContent='Organise';
    b.style.position='fixed'; b.style.top='10px'; b.style.right='10px'; b.style.zIndex='10001';
    b.addEventListener('click', ()=>{ try{ window.organizeBoard && window.organizeBoard(); }catch(e){} });
    document.body.appendChild(b);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', ensure); else ensure();
})();