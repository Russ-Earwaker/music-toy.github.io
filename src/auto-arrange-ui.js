export function installAutoArrangeUI({arrange,play,edit,reveal=()=>{},describe=()=>null}){
 const panel=document.createElement('section');panel.className='arrangement-result';panel.hidden=true;
 panel.setAttribute('aria-label','Arrangement');
 const message=document.createElement('div');message.setAttribute('role','status');panel.append(message);
 const actions=document.createElement('div');actions.className='arrangement-actions';panel.append(actions);
 let result=null,busy=false;
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);actions.append(b);return b;};
 const playButton=button('Play',()=>play(result));
 const editButton=button('Edit Arrangement',()=>edit(result));
 const mineButton=button('Show my parts',()=>reveal(result,{onlyAuthored:true}));mineButton.hidden=true;
 const again=button('Arrange Again',()=>run());
 button('Close',()=>{panel.hidden=true;});
 document.body.append(panel);
 async function run(){
  if(busy)return;busy=true;panel.hidden=false;message.textContent='Arranging…';
  playButton.disabled=editButton.disabled=again.disabled=true;mineButton.hidden=true;
  const entry=document.querySelector('.toy-spawner-arrange');if(entry)entry.disabled=true;
  try{result=await arrange();const summary=describe(result);message.textContent='Arrangement ready'+(summary?`\nUsed ${summary.usedCount} of your toys\nAdded ${summary.addedCount} supporting ${summary.addedCount===1?'part':'parts'}`:'');playButton.disabled=editButton.disabled=false;mineButton.hidden=!summary?.authoredIds?.length;reveal(result);}
  catch(error){message.textContent=error.message || 'Could not build the arrangement.';}
  finally{busy=false;again.disabled=false;if(entry)entry.disabled=false;}
 }
 document.addEventListener('arrange:request',run);
 const reset=()=>{result=null;panel.hidden=true;};
 window.addEventListener('scene:new',reset);window.addEventListener('scene:load',reset);
 return {run};
}
