const C=require('../engine.js'); global.window={}; require('../openings.js');
const L=window.OPENINGS_RAW; let bad=0;
for(const o of L){ const p=new C.Position(C.START_FEN); const mv=o[4].split(/\s+/);
 for(let i=0;i<mv.length;i++){ const m=p.parseSan(mv[i]); if(!m){ console.log('BAD',o[1],o[2],'ply',i+1,mv[i],'fen',p.fen()); bad++; break;} const s=p.san(m); if(s.replace(/[+#]/g,'')!==mv[i].replace(/[+#]/g,'')) console.log('SAN diff',o[2],mv[i],s); p.make(m);} }
console.log(L.length,'openings',bad,'bad');
