// All values are logical board units. Effects never participate in fitting.
export const SIMPLE_TOY_MIN_SIZE=Object.freeze({width:640,height:440});
export const SIMPLE_DRAW_INSETS=Object.freeze({left:16,right:16,top:126,bottom:124});
export const SIMPLE_TOY_PADDING=32;
export function authoredBounds(points){
 if(!points?.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
 return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
export function fitAuthoredBounds(content,{minimum=SIMPLE_TOY_MIN_SIZE,padding=SIMPLE_TOY_PADDING,insets={left:0,right:0,top:0,bottom:0}}={}){
 if(!content||![content.x,content.y,content.width,content.height].every(Number.isFinite)||content.width<0||content.height<0)throw new Error('Invalid authored bounds');
 const width=Math.max(minimum.width,content.width+padding*2+insets.left+insets.right),height=Math.max(minimum.height,content.height+padding*2+insets.top+insets.bottom);
 return {x:content.x-padding-insets.left-(width-content.width-padding*2-insets.left-insets.right)/2,y:content.y-padding-insets.top-(height-content.height-padding*2-insets.top-insets.bottom)/2,width,height};
}
export function growAuthoredBounds(current,content,options){
 const required=fitAuthoredBounds(content,{...options,minimum:{width:0,height:0}}),x=Math.min(current.x,required.x),y=Math.min(current.y,required.y);
 return {x,y,width:Math.max(current.x+current.width,required.x+required.width)-x,height:Math.max(current.y+current.height,required.y+required.height)-y};
}
