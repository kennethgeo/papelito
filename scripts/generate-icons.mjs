import fs from 'node:fs';
import zlib from 'node:zlib';

// Code-native Papelito artwork. Raster icons and SVG share the same paper motif.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#46245D"/><path d="M29 23h35l10 11-4 44-8-4-7 4-8-4-7 4-11-4Z" fill="#F7D85B" stroke="#FFFEFC" stroke-width="1.5" stroke-linejoin="round"/><path d="m64 23-1 13 11-2" fill="#D6C3EA" stroke="#46245D" stroke-width="1.5"/><path d="M36 47q5-6 10 0m8 0q5-6 10 0M45 62q5 5 10 0" fill="none" stroke="#46245D" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const table = Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(name,data){const type=Buffer.from(name);let crc=0xffffffff;for(const b of Buffer.concat([type,data]))crc=table[(crc^b)&255]^(crc>>>8);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const sum=Buffer.alloc(4);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([len,type,data,sum]);}
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;}
function distance(x,y,a,b,c,d){const dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a-t*dx,y-b-t*dy);}
const note=[[29,23],[64,23],[74,34],[70,78],[62,74],[55,78],[47,74],[40,78],[29,74]];
function color(x,y){
  let rgb=[70,36,93];
  if(inside(x,y,note))rgb=[247,216,91];
  if(inside(x,y,[[64,23],[63,36],[74,34]]))rgb=[214,195,234];
  for(let i=0;i<note.length;i++){const a=note[i],b=note[(i+1)%note.length];if(distance(x,y,...a,...b)<.75)rgb=[255,254,252];}
  if(x>=35&&x<=47&&Math.abs(y-(44+3*((x-41)/5)**2))<1.2)rgb=[70,36,93];
  if(x>=53&&x<=65&&Math.abs(y-(44+3*((x-59)/5)**2))<1.2)rgb=[70,36,93];
  if(x>=44&&x<=56&&Math.abs(y-(64.5-2.5*((x-50)/5)**2))<1.2)rgb=[70,36,93];
  return rgb;
}
function png(size){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const total=[0,0,0];for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const c=color((x+(dx+.5)/2)*100/size,(y+(dy+.5)/2)*100/size);c.forEach((v,k)=>total[k]+=v);}const at=y*(size*4+1)+1+x*4;for(let k=0;k<3;k++)raw[at+k]=Math.round(total[k]/4);raw[at+3]=255;}const head=Buffer.alloc(13);head.writeUInt32BE(size);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
for(const size of [192,512]){fs.writeFileSync(`public/icon-${size}.svg`,svg(size));fs.writeFileSync(`public/icon-${size}.png`,png(size));}
fs.writeFileSync('public/apple-touch-icon.png',png(180));
const small=png(32),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(small.length,14);ico.writeUInt32LE(22,18);
fs.writeFileSync('public/favicon.ico',Buffer.concat([ico,small]));
if(fs.existsSync('src/app/favicon.ico'))fs.copyFileSync('public/favicon.ico','src/app/favicon.ico');
console.log('Papelito: iconos SVG, PNG, Apple y favicon actualizados.');
