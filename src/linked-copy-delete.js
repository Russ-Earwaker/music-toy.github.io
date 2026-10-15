export function confirmFinalLinkedCopy(onDelete){
 if(document.querySelector('.linked-copy-delete-confirmation'))return;
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='linked-copy-delete-confirmation';
 dialog.setAttribute('aria-label','Delete final Linked Copy');
 const message=document.createElement('p');message.textContent='Delete the final Linked Copy? Its shared musical content will be removed.';
 const actions=document.createElement('div'),cancel=document.createElement('button'),remove=document.createElement('button');
 for(const b of [cancel,remove]){b.type='button';b.className='toy-btn';}cancel.textContent='Keep Copy';remove.textContent='Delete Copy';
 const close=()=>{dialog.close?.();dialog.remove();previous?.focus?.({preventScroll:true});};
 cancel.onclick=close;remove.onclick=()=>{close();onDelete();};dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 actions.append(cancel,remove);dialog.append(message,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
}
