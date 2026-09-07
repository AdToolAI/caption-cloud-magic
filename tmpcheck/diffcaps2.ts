import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { getVideoModelSpec } from '@/config/videoModelSpecs';
for (const m of AI_VIDEO_TOOLKIT_MODELS) {
  const s = getVideoModelSpec(m.id)!;
  const modes = new Set(s.modes.map(x=>x.mode));
  const specAudio = s.modes.some(x=>x.audio);
  const specSmart = s.modes.some(x=>x.controls.smartDuration);
  const out:string[]=[];
  const cmp=(k:string,ui:boolean|undefined,sp:boolean)=>{ if(!!ui!==sp) out.push(`${k} ui=${!!ui} spec=${sp}`); };
  cmp('t2v',m.capabilities.t2v,modes.has('t2v'));
  cmp('i2v',m.capabilities.i2v,modes.has('i2v'));
  cmp('v2v',m.capabilities.v2v,modes.has('v2v'));
  cmp('audio',m.capabilities.audio,specAudio);
  cmp('smartDuration',m.capabilities.smartDuration,specSmart);
  if(out.length) console.log(m.id,'|',out.join(' ; '));
}
