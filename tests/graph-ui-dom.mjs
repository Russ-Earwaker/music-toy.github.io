export class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs=new Map();this.handlers=new Map();this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.className='';this.hidden=false;this.classList={contains:c=>this.className.split(' ').includes(c),toggle:(c,on)=>{const s=new Set(this.className.split(' ').filter(Boolean));if(on===undefined)on=!s.has(c);on?s.add(c):s.delete(c);this.className=[...s].join(' ');return on;},add:(...cs)=>cs.forEach(c=>this.classList.toggle(c,true)),remove:(...cs)=>cs.forEach(c=>this.classList.toggle(c,false))};}
 getAttribute(k){return k==='class'?this.className:this.attrs.get(k)??null;}setAttribute(k,v){if(k==='class')this.className=String(v);else this.attrs.set(k,String(v));}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}appendChild(node){this.append(node);return node;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}replaceChildren(...nodes){for(const c of [...this.children])c.remove();this.append(...nodes);}
 set innerHTML(html){this.replaceChildren();for(const m of html.matchAll(/<div class="([^"]+)"><\/div>/g)){const n=new Node();n.className=m[1];this.append(n);}}
 addEventListener(k,fn){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(fn);}removeEventListener(k,fn){this.handlers.get(k)?.delete(fn);}dispatchEvent(e){e.target??=this;for(const fn of this.handlers.get(e.type)||[])fn(e);return true;}
 matches(sel){return sel.startsWith('.')?this.classList.contains(sel.slice(1)):sel.startsWith('#')?this.id===sel.slice(1):this.tagName===sel;}
 querySelector(sel){return walk(this,n=>n!==this&&n.matches(sel))[0]||null;}closest(sel){for(let n=this;n;n=n.parentNode)if(sel.split(',').some(s=>n.matches(s)))return n;return null;}
 contains(node){return walk(this,n=>n===node).length>0;}
 getBoundingClientRect(){return {left:0,top:0,right:1000,bottom:800,width:1000,height:800};}setPointerCapture(){}
}
export const walk=(node,fn)=>[node,...node.children.flatMap(c=>walk(c,()=>true))].filter(fn);
export function dom(){const document=new Node('document'),window=new Node('window');document.head=new Node('head');document.body=new Node('body');document.documentElement=new Node('html');document.append(document.head,document.body);document.createElement=tag=>new Node(tag);document.createElementNS=(ns,tag)=>new Node(tag);document.createTextNode=text=>{const n=new Node('#text');n.textContent=text;return n;};document.getElementById=id=>walk(document,n=>n.id===id)[0]||null;window.innerWidth=1000;window.innerHeight=800;return {document,window};}
export class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
export const event=(type,x=0,y=0,extra={})=>({type,button:0,pointerId:1,clientX:x,clientY:y,preventDefault(){},stopPropagation(){},...extra});
