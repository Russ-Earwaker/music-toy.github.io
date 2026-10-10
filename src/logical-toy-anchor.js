import { resolveToySideAnchorY } from './toy-side-button-position.js';

// Socket offsets depend on toy layout, never on the camera's client rectangles.
export function createLogicalToyMetricsReader(Observer = globalThis.ResizeObserver) {
  const metrics=new WeakMap(), owners=new WeakMap(), watched=new WeakMap();
  const observer=Observer?new Observer(entries=>{
    for(const entry of entries){const panel=owners.get(entry.target);if(panel)metrics.delete(panel);}
  }):null;
  const observed=new WeakSet();
  return panel=>{
    let value=metrics.get(panel);
    if(!value){
      const body=panel.querySelector?.(':scope > .toy-body')||panel.querySelector?.('.toy-body');
      value={width:panel.offsetWidth||0,height:panel.offsetHeight||0};
      value.localY=resolveToySideAnchorY({panelHeight:value.height,bodyTop:(body?.offsetTop||0)+(panel.clientTop||0),bodyHeight:body?.offsetHeight});
      metrics.set(panel,value);
      if(!watched.has(panel)){
        watched.set(panel,new Set());
        panel.addEventListener?.('toy:dispose',()=>{
          for(const node of watched.get(panel)||[]){observer?.unobserve?.(node);observed.delete(node);owners.delete(node);}
          watched.delete(panel);metrics.delete(panel);
        },{once:true});
      }
      for(const node of [panel,body,panel.querySelector?.('.toy-header')].filter(Boolean)){
        if(!observed.has(node)){observed.add(node);watched.get(panel).add(node);owners.set(node,panel);observer?.observe(node);}
      }
    }
    return value;
  };
}
