import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { getVideoModelSpec, isResolutionTierAvailable, nativeResolutionLabels } from '@/config/videoModelSpecs';
for (const m of AI_VIDEO_TOOLKIT_MODELS) {
  const s = getVideoModelSpec(m.id);
  if (!s) { console.log(m.id, 'NO SPEC'); continue; }
  const durs = [...new Set(s.modes.flatMap(x=>x.durations))].sort((a,b)=>a-b);
  const ars = [...new Set(s.modes.flatMap(x=>x.aspectRatios))];
  const resAvail = [...new Set(s.modes.flatMap(x=>x.resolutions).filter(r=>r.native&&isResolutionTierAvailable(r)).map(r=>r.label))];
  const resLocked = [...new Set(s.modes.flatMap(x=>x.resolutions).filter(r=>r.native&&!isResolutionTierAvailable(r)).map(r=>r.label))];
  const uiRes = m.resolutions ?? [m.resolution];
  const d = (a:any[],b:any[])=>JSON.stringify([...a].sort())!==JSON.stringify([...b].sort());
  const notes:string[]=[];
  if (d(durs,m.durations)) notes.push(`dur ui=${m.durations} spec=${durs}`);
  if (d(ars,m.aspectRatios)) notes.push(`ar ui=${m.aspectRatios} spec=${ars}`);
  if (d(uiRes,resAvail)) notes.push(`res ui=${uiRes} specAvail=${resAvail} locked=${resLocked}`);
  if (notes.length) console.log(m.id+'\n  '+notes.join('\n  '));
}
