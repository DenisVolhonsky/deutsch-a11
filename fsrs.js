// FSRS-4.5 formula implementation (no external runtime dependency).
// Based on the published 17-parameter FSRS-4.5 model; default weights, desired retention .9.
// Cards are scheduled separately for each translation direction.
'use strict';
const FSRS=(()=>{
  const w=[0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
  const MAX_DAYS=36500;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const initialD=r=>clamp(w[4]-(r-3)*w[5],1,10);
  const retrievability=(elapsed,stability)=>Math.pow(1+19*elapsed/(81*Math.max(0.1,stability)),-0.5);
  const success=(d,s,r,g)=>s*(1+Math.exp(w[8])*(11-d)*Math.pow(s,-w[9])*(Math.exp((1-r)*w[10])-1)*(g===2?w[15]:1)*(g===4?w[16]:1));
  const fail=(d,s,r)=>Math.min(s, w[11]*Math.pow(d,-w[12])*(Math.pow(s+1,w[13])-1)*Math.exp((1-r)*w[14]));
  const nextD=(d,g)=>clamp(w[7]*w[4]+(1-w[7])*(d-w[6]*(g-3)),1,10);
  const interval=(s,retention=.9)=>clamp(Math.round((81*s/19)*(Math.pow(retention,-2)-1)),1,MAX_DAYS);
  function review(card,grade,now=Date.now()){
    const g={again:1,hard:2,good:3,easy:4}[grade];if(!g)throw Error('Invalid rating');
    const previous=card||null;
    if(!previous){
      const stability=w[g-1],difficulty=initialD(g),short=g===1?60*1000:g===2?10*60*1000:0;
      const delay=short||interval(stability)*86400000;
      return {stability,difficulty,lastReview:new Date(now).toISOString(),due:new Date(now+delay).toISOString(),reps:1,lapses:g===1?1:0,last:grade,algorithm:'FSRS-4.5'};
    }
    const days=Math.max(0,(now-Date.parse(previous.lastReview||previous.reviewedAt||new Date(now).toISOString()))/86400000);
    const oldS=clamp(Number(previous.stability)||w[2],.1,MAX_DAYS),oldD=clamp(Number(previous.difficulty)||initialD(3),1,10);
    const r=retrievability(days,oldS);let s=g===1?Math.max(.1,fail(oldD,oldS,r)):Math.max(.1,success(oldD,oldS,r,g));s=clamp(s,.1,MAX_DAYS);
    const d=nextD(oldD,g);
    const dueMs=(g===1?10*60*1000:(g===2&&days<1?30*60*1000:interval(s)*86400000));
    return {stability:s,difficulty:d,lastReview:new Date(now).toISOString(),due:new Date(now+dueMs).toISOString(),reps:(previous.reps||0)+1,lapses:(previous.lapses||0)+(g===1?1:0),last:grade,algorithm:'FSRS-4.5'};
  }
  return {review,interval,retrievability,initialD};
})();
