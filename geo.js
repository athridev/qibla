/* Spherical great-circle initial bearing. R = IUGG mean Earth radius. */
(function(root){
const R=6371008.8,K=[21.422487,39.826206],rad=Math.PI/180;
function valid(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;}
function distance(a,b){const x=(b[0]-a[0])*rad,y=(b[1]-a[1])*rad,h=Math.sin(x/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));}
function bearing(a,b){const p=a[0]*rad,q=b[0]*rad,d=(b[1]-a[1])*rad;return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/rad+360)%360;}
function destination(a,bearing,meters){const p=a[0]*rad,l=a[1]*rad,b=bearing*rad,d=meters/R,q=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(b)),z=l+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(q));return [q/rad,((z/rad+540)%360)-180];}
function turn(from,to){return ((to-from+540)%360)-180;}
function qibla(a){if(!valid(a))throw Error('Invalid coordinates');const d=distance(a,K);return {bearing:bearing(a,K),distance:d,usable:d>100&&Math.PI*R-d>1000&&Math.abs(a[0])<89.9};}
function route(a){
  const q=qibla(a);if(!q.usable)return [];const steps=new Set([0,q.distance]);
  for(let i=1;i<512;i++)steps.add(q.distance*i/512);
  for(const d of [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000,20000])if(d<q.distance){steps.add(d);steps.add(q.distance-d);}
  let last=a[1];return [...steps].sort((x,y)=>x-y).map(d=>{const p=d===q.distance?[...K]:destination(a,q.bearing,d);while(p[1]-last>180)p[1]-=360;while(p[1]-last< -180)p[1]+=360;last=p[1];return p;});
}
// Clip projected route segments before placing arrows, so even a continental
// segment at street zoom has a bounded amount of rendering work.
function mapArrows(points,width,height,spacing=130){
  const arrows=[];let until=spacing/2;
  for(let i=1;i<points.length&&arrows.length<24;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];if(![...a,...b].every(Number.isFinite))continue;
    let lo=0,hi=1,visible=true;const P=[-dx,dx,-dy,dy],Q=[a[0]-24,width-24-a[0],a[1]-24,height-24-a[1]];
    for(let k=0;k<4;k++){if(P[k]===0){if(Q[k]<0)visible=false;continue;}const u=Q[k]/P[k];if(P[k]<0)lo=Math.max(lo,u);else hi=Math.min(hi,u);}
    if(!visible||lo>hi)continue;const len=Math.hypot(dx,dy)*(hi-lo);if(len===0)continue;
    let d=until;while(d<len&&arrows.length<24){const u=lo+(hi-lo)*d/len;arrows.push({x:a[0]+dx*u,y:a[1]+dy*u,angle:Math.atan2(dx,-dy)/rad});d+=spacing;}until=d-len;
  }return arrows;
}

const api={R,K,valid,distance,bearing,destination,turn,qibla,route,mapArrows};if(typeof module!=='undefined')module.exports=api;else root.Geo=api;
})(typeof window==='undefined'?globalThis:window);
