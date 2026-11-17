const C=require('../engine.js');
function perft(p,d){ if(d===0) return 1; const buf=new Int32Array(256); const n=p.gen(buf,false); let c=0; const us=p.turn;
 for(let i=0;i<n;i++){ p.make(buf[i]); if(!p.attacked(p.king[us],us^1)) c+=perft(p,d-1); p.unmake(); } return c; }
const tests=[[C.START_FEN,4,197281],[C.START_FEN,5,4865609],
['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',3,97862],
['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',4,4085603],
['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',5,674624],
['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',4,422333],
['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',3,62379],
['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',3,89890]];
for(const [f,d,e] of tests){const p=new C.Position(f); const t=Date.now(); const r=perft(p,d); const h=p.h1; console.log(r===e?'OK ':'FAIL',d,r,e,(Date.now()-t)+'ms', p.fen()===new C.Position(f).fen());}
// hash consistency
const p=new C.Position(C.START_FEN); for(const s of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7']){const m=p.parseSan(s); if(!m) throw 'bad '+s; console.log(p.san(m)); p.make(m);} 
const q=new C.Position(p.fen()); console.log('hash match', q.h1===p.h1&&q.h2===p.h2, p.fen());
const S=new C.Searcher(20); let t=Date.now(); const r=S.search(new C.Position(C.START_FEN),{time:3000}); console.log('search',r.depth,C.scoreToText(r.score),r.nodes,Date.now()-t,'ms nps',Math.round(r.nodes/((Date.now()-t)/1000)));
t=Date.now(); const r2=S.search(new C.Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),{time:3000}); const kp=new C.Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'); console.log('kiwi',r2.depth,C.scoreToText(r2.score),kp.san(r2.move),r2.nodes);
// mate in 2
const mp=new C.Position('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'); const r3=S.search(mp,{time:1000}); console.log('scholar',mp.san(r3.move),C.scoreToText(r3.score));
