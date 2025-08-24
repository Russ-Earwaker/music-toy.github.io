// src/roles-assign.js — assign sensible roles to known toys (<=200 lines)
function setRole(id, role){
  const el = document.querySelector(`.toy-panel[data-toyid="${id}"]`);
  if (el) el.dataset.role = role;
}
function setRoleForPrefix(prefix, role){
  document.querySelectorAll(`.toy-panel[data-toyid^="${prefix}"]`).forEach(el => { el.dataset.role = role; });
}

window.addEventListener('DOMContentLoaded', ()=>{
  setRole('wheel','lead');
  setRole('rippler','pad');
  setRole('bouncer','percussion');
  setRoleForPrefix('grid','percussion'); // grid, grid-1, grid2, etc.
  // Future: actively performed instruments can use role "perform"
});
