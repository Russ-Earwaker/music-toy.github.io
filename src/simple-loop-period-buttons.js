export function syncSimpleLoopPeriodButtons(root,value,disabled=false){
 for(const button of root.querySelectorAll('button')){
  button.setAttribute('aria-pressed',String(Number(button.dataset.period)===value));
  button.disabled=disabled;
 }
}

export function createSimpleLoopPeriodButtons({value=1,onChange,disabled=false,label='Loop period'}){
 const root=document.createElement('div');root.className='simple-loop-period';root.dataset.simpleHelp='Choose how many loops before repeating.';root.setAttribute('role','group');root.setAttribute('aria-label',label);
 const title=document.createElement('span');title.textContent='LOOPS';root.append(title);
 const row=document.createElement('div');row.className='simple-loop-period-buttons';root.append(row);
 for(let period=1;period<=4;period++){
  const button=document.createElement('button');button.type='button';button.textContent=String(period);button.dataset.period=String(period);
  button.setAttribute('aria-label',period+(period===1?' loop':' loops'));
  button.onclick=()=>onChange(period);row.append(button);
 }
 syncSimpleLoopPeriodButtons(root,value,disabled);return root;
}
