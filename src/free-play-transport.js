import {MAIN_TRANSPORT_ID,transportRegistry} from './transport-registry.js';

// An alias to the existing main transport, never a Free Play clock or tempo.
export const getFreePlayTransport=(registry=transportRegistry)=>registry.get(MAIN_TRANSPORT_ID);
export function gateFreePlayLine(instance,transport,durationTicks){
 const tick=transport.currentTick;
 const joinTick=tick>0||transport.state==='playing'?transport.nextBeatTick(tick):0;
 instance.startTick=joinTick;instance.scheduledUntilTick=joinTick;instance.loopLengthTicks=durationTicks;
 return joinTick;
}
