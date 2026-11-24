import { WORLD, LAUNCH, WALL, CUSHION, basketAt, spareBasketAt } from './physics.mjs';

const W = WORLD.width;
const H = WORLD.height;
const F = WORLD.floorY;
const TAU = Math.PI * 2;
const INK = '#574b3f';
const flowerColors = ['#fff0ba', '#ffd079', '#ffc6ad', '#f4dfd4', '#e7c5ce'];
const scenery = new Map();

function curve(c, d, fill, stroke, line = 1) {
  const p = new Path2D(d);
  if (fill) { c.fillStyle = fill; c.fill(p); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(p); }
}
function oval(c, x, y, rx, ry, color, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fillStyle = color;
  c.fill();
}
function segment(c, x1, y1, x2, y2, color, width) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.lineWidth = width; c.strokeStyle = color; c.stroke();
}
function place(c, x, y, scale, fn) {
  c.save(); c.translate(x, y); c.scale(scale, scale); fn(); c.restore();
}
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function cloud(c, x, y, s) {
  place(c, x, y, s, () => {
    const shape = 'M-55 4 Q-66 2 -62 -4 Q-59 -11 -48 -10 Q-48 -22 -34 -21 Q-29 -35 -12 -34 Q4 -35 12 -22 Q22 -24 29 -16 Q40 -20 47 -10 Q68 -10 68 -3 Q67 3 45 3 L-55 4Z';
    curve(c,shape,'#fff6da');
    curve(c,'M-46 3 Q-17 3 -3 2 M10 -3 Q19 -4 25 -3',null,'#e0dfbd',1.7);
  });
}

function farTree(c, x, y, size, color) {
  place(c,x,y,size,() => {
    curve(c,'M-9 0 Q-12 -8 -9 -13 Q-13 -23 -5 -28 Q-2 -40 5 -32 Q14 -30 11 -19 Q17 -9 11 -3 L8 0Z',color);
    segment(c,1,-11,1,2,color,3);
  });
}
function church(c) {
  place(c,599,258,.86,() => {
    // A small distant chapel anchors the spring fair without competing with the target.
    curve(c,'M-30 0 L-30 -34 L-10 -49 L23 -47 L40 -32 L40 0Z','#efe3b6');
    curve(c,'M-39 -32 L-12 -53 L22 -52 L47 -32 L39 -31 L20 -44 L-9 -46 L-29 -30Z','#be977e');
    curve(c,'M-28 -33 L-10 -46 L7 -32 L7 0 L-28 0Z','#f9ecc5');
    curve(c,'M-48 -4 L-48 -55 L-27 -55 L-27 0Z','#f0e5bb');
    curve(c,'M-53 -53 L-38 -83 L-23 -53Z','#739589');
    segment(c,-38,-82,-38,-94,'#839184',2.5);
    segment(c,-42,-90,-34,-90,'#839184',2.2);
    oval(c,-37,-46,3,4.2,'#ada782');
    for (const x of [15,27]) curve(c,`M${x} -11 v-7 q3 -7 6 0 v7Z`,'#abb5a1');
    curve(c,'M-17 -1 V-12 Q-13 -23 -8 -12 V-1Z','#aba185');
  });
}
function petal(c, x, y, size, color, center = '#dcaa53') {
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5;
    oval(c,x+Math.cos(a)*size*.52,y+Math.sin(a)*size*.52,size*.57,size*.4,color,a);
  }
  oval(c,x,y,size*.32,size*.32,center);
}
function daisy(c, x, ground, size, color, tilt) {
  const topX = x + Math.sin(tilt)*size*1.9, y = ground-size*2.45;
  curve(c,`M${x} ${ground} Q${x-2} ${y+size} ${topX} ${y}`,null,'#5a855c',Math.max(.9, size*.2));
  oval(c,x-1,y+size*1.55,size*.66,size*.25,'#6c986a',-.6);
  petal(c,topX,y,size,color);
}
function hedge(c, x, y, s, col) {
  place(c,x,y,s,() => {
    curve(c,'M-28 0 Q-39 -10 -28 -16 Q-32 -27 -18 -28 Q-15 -39 -5 -32 Q6 -45 14 -31 Q25 -35 26 -21 Q39 -19 35 -10 Q42 -1 26 0Z',col);
    curve(c,'M-11 -17 q4 -1 7 3 M5 -23 q4 -2 8 0 M17 -13 q4 -3 6 -2',null,'#ffffff2e',2);
  });
}
function bunting(c) {
  // Cotton bunting is tied to the twigs just beyond the upper corners.
  curve(c,'M-12 6 Q105 83 229 29 Q254 15 278 -5',null,'#496957',1.7);
  const flags = [[15,20,-.01],[44,33,-.09],[75,42,-.14],[108,48,-.15],[142,49,-.12],[174,46,-.1],[203,38,-.14],[233,26,-.38],[259,10,-.56]];
  const colors = ['#d88d72','#ecbb6d','#f7e7b8','#79a998','#d99487'];
  flags.forEach(([x,y,r],i) => {
    c.save(); c.translate(x,y); c.rotate(r);
    curve(c,'M-6 -2 L7 1 L2 17Z',colors[i%colors.length]);
    segment(c,-3,0,5,2,'#fff1c77a',1.2); c.restore();
  });
}

function rabbit(c, time, shooting) {
  const breathe=Math.sin(time*2.1)*.7;
  oval(c,55,F+1,32,4,'#5f805b5c');
  place(c,51,F-.2,1.04,() => {
    // The little caddie's large face, bent back ear and neckerchief read at phone size.
    curve(c,'M-19 -20 Q-30 -25 -31 -16 Q-37 -17 -35 -10 Q-31 -2 -20 -7Z','#fff3d8',INK,2);
    curve(c,'M-13 -39 Q-25 -34 -23 -17 Q-25 -8 -15 -2 Q-1 3 14 -2 Q20 -11 16 -20 Q10 -35 3 -40Z','#f8e9c9',INK,2);
    curve(c,'M-23 -20 Q-9 -18 5 -28 L15 -19 Q18 -9 14 -3 Q3 3 -15 -1 Q-23 -4 -23 -12Z','#72968b',INK,1.7);
    curve(c,'M-13 -20 L-7 -33 L-2 -33 L-5 -19Z','#578576',INK,1.2);
    oval(c,-7,-19,1.7,1.7,'#f1c174');
    curve(c,'M-18 -4 Q-11 -9 -5 -3 Q-4 0 -7 1 H-19 Q-22 -1 -18 -4Z','#eddbb9',INK,1.6);
    curve(c,'M4 -3 Q10 -7 18 -4 Q22 -1 19 1 H4 Q1 -1 4 -3Z','#fff0d1',INK,1.6);
    c.save();c.translate(0,breathe);
    c.rotate(shooting?-.045:0);
    curve(c,'M-9 -52 Q-26 -62 -32 -78 Q-33 -86 -28 -86 Q-19 -87 -12 -74 L0 -54Z','#f9ebd1',INK,2.1);
    curve(c,'M-12 -59 Q-25 -69 -28 -79 Q-27 -84 -23 -79 Q-14 -71 -9 -60Z','#e8ac98');
    curve(c,'M-4 -54 Q-9 -75 -4 -90 Q-1 -99 5 -94 Q13 -87 9 -69 L6 -55Z','#fff0d4',INK,2.2);
    curve(c,'M1 -62 Q-2 -79 1 -88 Q3 -93 6 -87 Q9 -78 4 -65Z','#ebb1a0');
    curve(c,'M-14 -55 Q-1 -66 13 -58 Q23 -53 22 -44 Q28 -41 23 -35 Q18 -30 6 -30 Q-4 -28 -11 -32 Q-20 -31 -18 -35 Q-23 -36 -20 -40 Q-22 -49 -14 -55Z','#fff2d6',INK,2.2);
    curve(c,'M-18 -32 Q0 -27 14 -34 L14 -29 Q3 -24 -6 -25 L-13 -21 L-15 -29Z','#c96e53',INK,1.5);
    curve(c,'M-13 -27 L-22 -23 L-18 -32Z','#e09065',INK,1.1);
    oval(c,10,-48,2.1,3.15,'#453c35',-.10);
    oval(c,10.6,-49,.65,.75,'#fff1d5');
    curve(c,'M7 -54 Q10 -55 13 -54',null,'#866c53',1.2);
    oval(c,5.5,-40.2,4.3,2.25,'#efb59c',.06);
    curve(c,'M20 -45 Q25 -47 25 -43 L22 -41Z','#8e6558');
    curve(c,'M22 -41 Q22 -37 18 -38',null,'#765747',1.3);
    segment(c,4,-38,-4,-37,'#bc9372',.9); segment(c,4,-40,-4,-42,'#bc9372',.9);
    curve(c,shooting?'M4 -28 Q11 -31 18 -38 Q23 -41 24 -36 Q20 -24 11 -22 Q6 -21 4 -25Z':'M2 -28 Q8 -30 15 -26 Q22 -28 24 -24 Q23 -20 16 -20 Q7 -20 2 -24Z','#fff0d3',INK,1.7);
    c.restore();
  });
}
function chick(c,x,y,time,excited) {
  const hop=excited?Math.abs(Math.sin(time*12))*7:0;
  oval(c,x,y+1,13,2.8,'#60835942');
  place(c,x,y-hop,.82,()=>{
    segment(c,-4,-7,-4,0,'#946c44',2.1); segment(c,4,-6,5,.5,'#946c44',2.1);
    segment(c,-4,0,-9,1,'#946c44',1.7); segment(c,5,.5,1,2,'#946c44',1.7);
    curve(c,'M-10 -20 Q-10 -31 -1 -33 Q2 -36 4 -35 Q5 -32 8 -33 Q9 -31 8 -29 Q16 -25 14 -17 L21 -21 Q19 -10 11 -8 Q2 -2 -7 -7 Q-15 -10 -12 -17Z','#f4c765','#876f48',1.7);
    curve(c,'M0 -17 Q5 -16 9 -20 Q8 -13 3 -12',null,'#c29451',1.4);
    curve(c,'M-11 -23 L-17 -20 L-11 -19Z','#ca8552','#9a764b',1);
    oval(c,-6.5,-24,1.75,2.1,'#514b3d');
    oval(c,-6,-24.4,.45,.45,'#fff');
    oval(c,-6,-19.7,2.3,1.2,'#e6a57e');
  });
}
function makeEgg(c,x,y,scale,rotation,color='pink') {
  const colors={
    pink:['#f3a19d','#f8d195','#ac5757','#fff0ca'],
    blue:['#8fc8c2','#f7e6b3','#4e8882','#f9ebbc'],
    lilac:['#c4a6c8','#ffdb96','#9b779d','#fff1c8'],
  }[color];
  c.save(); c.translate(x,y); c.rotate(rotation); c.scale(scale,scale);
  const shape=new Path2D('M0 -17 C7 -17 14 -3 14 6 C14 14 9 18 0 18 C-9 18 -14 13 -14 6 C-14 -4 -7 -17 0 -17Z');
  c.fillStyle=colors[0]; c.fill(shape);
  c.save();c.clip(shape);
  curve(c,'M-16 -1 Q-7 -5 0 -1 Q9 2 16 -2 V7 Q8 11 0 7 Q-7 3 -16 7Z',colors[1]);
  curve(c,'M-16 3 Q-11 0 -7 2 T1 4 T10 4 T17 2',null,colors[2],1.7);
  for(const [dx,dy] of [[-4,-9],[4,-6],[-7,12],[2,13],[9,10]]) oval(c,dx,dy,1.35,1.35,colors[3]);
  curve(c,'M-10 -3 Q-8 -10 -4 -12',null,'#fff8e2a6',1.8);
  c.restore();
  c.lineWidth=1.9;c.strokeStyle=INK;c.stroke(shape);c.restore();
}
function nest(c) {
  const x=LAUNCH.x;
  oval(c,x,F+.5,24,3.2,'#65855e55');
  place(c,x,LAUNCH.y+12,1,()=>{
    curve(c,'M-16 -2 Q-4 3 17 -2 L10 10 Q7 13 3 13 L5 17 L12 19 Q14 21 11 21 H-11 Q-14 20 -11 18 L-4 16 L-3 13 Q-12 11 -16 -2Z','#d5a664','#7d6446',1.8);
    curve(c,'M-15 -2 Q1 -7 16 -2 Q5 4 -10 1Z','#f1cf89','#806e4d',1.4);
    curve(c,'M-10 5 Q-3 9 8 6',null,'#f5d294',1.8);
  });
}
function bow(c,x,y,s) {
  place(c,x,y,s,()=>{
    curve(c,'M-2 1 Q-6 8 -8 12 L-3 10 L-1 14 Q2 8 2 3 L7 12 L9 7 L13 8 Q10 4 5 1Z','#c36c57','#9a574d',1);
    curve(c,'M-1 -1 Q-13 -11 -15 -5 Q-17 1 -13 5 Q-9 7 0 2Z','#e29a83','#9e6355',1.15);
    curve(c,'M2 0 Q12 -10 15 -6 Q18 -1 14 4 Q12 7 4 3Z','#eab09a','#9e6355',1.15);
    curve(c,'M-11 -2 L-3 1 M6 0 L12 -3',null,'#ba705c',1);
    oval(c,1,1,3.6,4,'#bc6955');
  });
}
function wheel(c,x,y,r,spin) {
  oval(c,x,y,r,r,'#6d6050');oval(c,x,y,r-2.4,r-2.4,'#debb7b');
  for(let i=0;i<6;i++){
    const a=i*TAU/6+spin;
    segment(c,x,y,x+Math.cos(a)*(r-3.5),y+Math.sin(a)*(r-3.5),'#9b7852',1.6);
  }
  oval(c,x,y,2.4,2.4,'#6b6551');
}
function basketBack(c,b,kind,phase) {
  const {x,y,width}=b, spare=kind==='spare',cart=kind==='cart',w=width/2;
  oval(c,x,F+2,w+(cart?19:4),4.6,'#67845c44');
  c.save();c.translate(x,y);
  const bottom=spare?34:Math.min(48,w*.91);
  if(cart) {
    const axle=F-y-9;
    const spin=x/8;
    wheel(c,-w*.58,axle,9,spin);wheel(c,w*.58,axle,9,spin);
    curve(c,`M${-w*.49} ${bottom-1} L${-w*.7} ${axle-8} L${w*.64} ${axle-8} L${w*.46} ${bottom-1}Z`,'#b69165','#876f50',1.7);
    curve(c,`M${-w-8} ${axle-13} Q-3 ${axle-10} ${w+7} ${axle-13} L${w+7} ${axle-5} Q0 ${axle-3} ${-w-8} ${axle-6}Z`,'#d1a66e','#806b52',1.9);
    segment(c,w+8,axle-8,w+26,axle-18,'#8d7755',2.4);
  } else if(!spare) {
    for(const side of [-1,1]){
      const legX=w*.55*side;
      segment(c,legX,bottom,legX+side*4,F-y-3,'#826f53',7);
      segment(c,legX,bottom,legX+side*4,F-y-4,'#ba9361',4);
    }
    const plankY=bottom+3;
    curve(c,`M${-w*.85} ${plankY-3} Q0 ${plankY-1} ${w*.85} ${plankY-4} L${w*.83} ${plankY+3} Q0 ${plankY+7} ${-w*.84} ${plankY+3}Z`,'#d5ae72','#887656',1.4);
  } else {
    curve(c,`M-13 ${bottom} L-15 ${F-y-1} M14 ${bottom} L15 ${F-y-1}`,null,'#968f6f',3);
  }
  // Goal baskets have a tall wrapped handle and a polka-dot pennant.
  if(!spare){
    const handle=`M${-w*.84} 1 C${-w*.84} ${-w*1.45} ${w*.88} ${-w*1.47} ${w*.84} 1`;
    curve(c,handle,null,'#8c6c4f',6.8);curve(c,handle,null,'#d9b078',3.8);
    for(const side of [-1,1]) for(let i=0;i<3;i++){
      const yy=-7-i*8;
      const xx=side*w*(.835-i*.037);
      segment(c,xx-1.8,yy+1,xx+1.6,yy-1,'#b48b5f',1.3);
    }
    const poleX=w*.66;
    segment(c,poleX,-1,poleX,-w*1.53,'#806e50',2);
    const wave=Math.sin(phase*2)*1.6;
    curve(c,`M${poleX} ${-w*1.5} q9 ${-4+wave} 22 1 l-7 5 6 5 q-11 ${-4-wave} -21 0Z`,'#d88170','#a66a59',1);
    oval(c,poleX+6,-w*1.5+4,1.35,1.35,'#ffebba');
  }
  oval(c,0,0,w,spare?5:7,spare?'#87957a':'#87614b');
  oval(c,0,1,w-3,spare?2.8:4.7,spare?'#71836f':'#745c45');
  c.restore();
}
function basketFront(c,b,kind,progress) {
  const {x,y,width}=b,spare=kind==='spare',w=width/2;
  const bottom=spare?34:Math.min(48,w*.91);
  c.save();c.translate(x,y);
  if(!spare&&progress>0) makeEgg(c,-w*.35,-4,.65,-.3,'blue');
  if(!spare&&progress>1) makeEgg(c,w*.28,-3,.62,.3,'lilac');
  const body=`M${-w} 0 Q0 11 ${w} 0 L${w*.77} ${bottom*.84} Q${w*.74} ${bottom} 0 ${bottom+1} Q${-w*.74} ${bottom} ${-w*.78} ${bottom*.84}Z`;
  const shape=new Path2D(body);
  curve(c,body,spare?'#a9ae8d':'#d3a263',spare?'#859177':'#896849',spare?1.6:2);
  c.save();c.clip(shape);
  for(let i=-5;i<=5;i++){
    const xx=i*w*.21;
    curve(c,`M${xx} 2 Q${xx*.91} ${bottom*.52} ${xx*.77} ${bottom+2}`,null,spare?'#919c80':'#af804f',spare?1.6:2.2);
  }
  for(let i=1;i<=4;i++){
    const yy=bottom*i/5;
    curve(c,`M${-w} ${yy-3} Q0 ${yy+7} ${w} ${yy-3}`,null,spare?'#c0c2a0':'#ecc382',3.4);
    curve(c,`M${-w} ${yy-.3} Q0 ${yy+9} ${w} ${yy-.3}`,null,spare?'#909d81':'#b48655',1.2);
  }
  if(!spare) {
    curve(c,`M${-w} 4 Q-20 10 0 9 Q17 11 ${w} 4 L${w-4} 14 Q25 20 9 17 Q6 26 1 29 Q-5 24 -8 18 Q-28 21 ${-w+4} 14Z`,'#f4dbab','#b19b79',1);
    c.save();c.globalAlpha=.52;
    for(let i=-5;i<=5;i++) segment(c,i*9,7,i*9-1,16,'#bd917a',1.25);
    curve(c,`M${-w} 10 Q0 20 ${w} 10`,null,'#bc8f74',1.25);c.restore();
  }
  c.restore();
  curve(c,`M${-w} 0 Q0 11 ${w} 0`,null,spare?'#9aa68a':'#aa8156',spare?3:4.5);
  curve(c,`M${-w+1} -1 Q0 8 ${w-1} -1`,null,spare?'#cbd2a8':'#f1ca8b',spare?2:2.5);
  if(!spare) bow(c,w*.52,9,.73);
  c.restore();
}

function springStar(c,x,y,r,fill,outline) {
  const p=new Path2D();
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5-Math.PI/2;
    const d=i%2?r*.53:r;
    const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;
    if(i===0)p.moveTo(px,py);else p.lineTo(px,py);
  }
  p.closePath();c.fillStyle=fill;c.fill(p);
  if(outline){c.lineWidth=1.1;c.strokeStyle=outline;c.stroke(p);}
}
function spring(c,age) {
  const {x,y,width:w}=CUSHION;
  const dip=age>=0&&age<.42?Math.sin(age*24)*Math.exp(-age*7)*4.5:0;
  oval(c,x+w/2,F+1,w*.58,4,'#67835d4a');
  c.save();c.translate(x,y);
  for(const xx of [11,w*.5,w-11]){
    curve(c,`M${xx-7} ${6+dip} l12 3 -12 4 12 3 -9 3`,null,'#677c6a',2.4);
  }
  curve(c,`M-2 17 Q${w/2} 19 ${w+2} 17 L${w+3} 21 Q${w/2} 24 -3 21Z`,'#b78f67','#806d52',1.6);
  c.translate(0,dip);
  curve(c,`M3 0 Q${w*.5} -2 ${w-2} 0 Q${w+6} 0 ${w+3} 5 L${w-3} 9 Q${w*.5} 11 -1 9 Q-9 5 -2 1Z`,'#82b7a3','#536f60',1.9);
  curve(c,`M2 1 Q${w/2} -1 ${w-2} 1`,null,'#d2dec1',2.1);
  for(const xx of [12,27,w-25,w-10]) {
    segment(c,xx,2.6,xx-2.7,7.2,'#579787',2.5);
  }
  springStar(c,w*.5,5.1,4.7,'#ffe1a1','#a78d54');
  c.restore();
}
function wall(c) {
  const {x,y,width:w}=WALL,h=F-y;
  oval(c,x+w*.6,F+1,w*.9,4,'#63805b4a');
  c.save();c.translate(x,y);
  const wallPath=`M1 3 L${w-1} 1 L${w+2} ${h-1} L-1 ${h}Z`;
  curve(c,wallPath,'#bd9e85','#8d8571',1.8);
  const mask=new Path2D(wallPath);
  c.save();c.clip(mask);
  for(let row=0;row<9;row++){
    const yy=9+row*17;
    let xx=row%2?-14:-3;
    for(;xx<w;xx+=18){
      const shade=['#cbb293','#b69e88','#c2aa93','#d2b79a'][(row+Math.abs(xx))%4];
      curve(c,`M${xx} ${yy} q7 -1 16 0 l.7 13 q-8 2 -16 .9Z`,shade,'#d7c4a6',1.2);
      segment(c,xx+2,yy+2,xx+10,yy+1.8,'#ddc7aa',.95);
    }
  }
  c.restore();
  curve(c,`M-4 0 Q9 -3 ${w+4} -1 L${w+4} 6 L-3 7Z`,'#a6b487','#78876f',1.7);
  curve(c,'M3 5 Q12 17 7 29 T11 47 M6 16 Q0 24 -1 31',null,'#739575',1.7);
  for(const [xx,yy,ang] of [[5,13,.5],[8,20,-.8],[9,29,-.66],[7,37,.7],[1,25,-.5],[10,44,-.9]])
    oval(c,xx,yy,4.8,2.2,'#82a17a',ang);
  petal(c,9,18,2.5,'#f6d99b');
  c.restore();
}
function grassTuft(c,x,y,s) {
  place(c,x,y,s,()=>{
    curve(c,'M-8 -1 Q-9 -6 -11 -9 Q-4 -7 -2 -3 Q-5 -15 0 -21 Q4 -13 3 -5 Q6 -12 12 -14 Q12 -7 6 -2 L12 -5 L10 -1Z','#7a9c6c');
    curve(c,'M0 -16 L1 -5 M10 -11 L6 -4',null,'#a4bc7f',1);
  });
}
function backdrop(c, stage) {
  const transform = c.getTransform();
  const density=Math.max(1,Math.min(2,Math.ceil(Math.abs(transform.a)*2)/2));
  const key=`${stage}-${density}`;
  if(!scenery.has(key)){
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(Math.round(W*density),Math.round(H*density)):document.createElement('canvas');
    canvas.width=Math.round(W*density);canvas.height=Math.round(H*density);
    const painter=canvas.getContext('2d');
    painter.scale(density,density);background(painter,stage);
    if(stage===1) wall(painter);
    grassTuft(painter,0,F,1);grassTuft(painter,158,F+1,.51);grassTuft(painter,580,F-2,.45);grassTuft(painter,749,F-1,.9);
    if(stage===1)grassTuft(painter,WALL.x-1,F,.54);
    if(scenery.size>5)scenery.clear();
    scenery.set(key,canvas);
  }
  c.drawImage(scenery.get(key),0,0,W,H);
}
function butterfly(c,time) {
  // A small cabbage white above the flower bed lends life to an idle course.
  const x=225+Math.sin(time*.38)*10,y=307+Math.sin(time*.63)*6;
  const open=.7+.3*Math.cos(time*8.2);
  oval(c,x-1.9*open,y-1.4,3.6*open,1.8,'#fff1c5',.6);
  oval(c,x+1.9*open,y-1.5,3.5*open,1.8,'#fff0b7',-.7);
  curve(c,`M${x-1} ${y+1} l2 -2`,null,'#829673',.9);
}
function dots(c, points, hint, dragging) {
  if(!Array.isArray(points)||points.length<2)return;
  let last=points[0],distance=0;
  const spacing=hint?18:14;
  for(let i=1;i<points.length;i++){
    const next=points[i],dx=next.x-last.x,dy=next.y-last.y,len=Math.hypot(dx,dy);
    let at=spacing-distance;
    while(at<=len){
      const x=last.x+dx*at/len,y=last.y+dy*at/len;
      if(x>=0&&x<=W&&y>=0&&y<=F+6){
        if(hint){
          c.beginPath();c.arc(x,y,3,0,TAU);c.strokeStyle='#527e6b';c.lineWidth=1.4;c.stroke();
          oval(c,x,y,1.3,1.3,'#eaf3c9');
        }else{
          oval(c,x,y,dragging?3.25:2.95,dragging?3.25:2.95,'#fff1ce');
          oval(c,x,y,dragging?2.25:1.9,dragging?2.25:1.9,'#805d4e');
        }
      }
      at+=spacing;
    }
    distance=(distance+len)%spacing;last=next;
  }
}
function contact(c,e,age) {
  if(age<0)return;
  const cheer=e.type==='goal',spare=e.type==='spare',bank=e.type==='cushion';
  if(!cheer&&!spare&&!bank)return;
  const lifetime=cheer?.88:.44;
  if(age>lifetime)return;
  const p=age/lifetime;
  c.save();c.globalAlpha=Math.min(1,(1-p)*2);
  if(cheer){
    const palette=['#ca745d','#e4b454','#84ac99','#c491ae','#ffefd1'];
    for(let i=0;i<19;i++){
      const a=-Math.PI*.97+i*Math.PI*.95/18;
      const speed=44+(i*37%61);
      const x=e.x+Math.cos(a)*speed*age, y=e.y-8+Math.sin(a)*speed*age+48*age*age;
      c.save();c.translate(x,y);c.rotate(i+p*5);
      if(i%4===0)springStar(c,0,0,4.1,palette[i%5]);
      else {c.fillStyle=palette[i%5];c.fillRect(-1.7,-3.2,3.4,6.4);}
      c.restore();
    }
  }else{
    const col=bank?'#438c7c':'#c18e55';
    for(let i=0;i<5;i++){
      const a=-2.55+i*.49,dist=8+16*p;
      segment(c,e.x+Math.cos(a)*dist,e.y+Math.sin(a)*dist,e.x+Math.cos(a)*(dist+5),e.y+Math.sin(a)*(dist+5),col,2.2);
    }
  }
  c.restore();
}

/** Paint a frame in 760 × 500 world coordinates. The caller sets the canvas transform. */
export function drawScene(c,state) {
  const stage=Math.max(0,Math.min(2,state.stageIndex??0));
  const phase=state.phase??0, time=state.time??0;
  const shotTime=state.shotTime??0, shooting=!!state.shooting;
  let egg=state.egg??LAUNCH;
  const goals = state.goalsInStage ?? 0, rules = state.rulesVersion ?? 2;
  const target = basketAt(stage, phase, state.misses ?? 0, goals, rules);
  const spare = spareBasketAt(stage, goals, rules);
  const activeEvents=shooting&&Array.isArray(state.events)?state.events:[];
  const cushionHit=activeEvents.findLast(e=>e.type==='cushion'&&e.t<=shotTime);
  const goalHit=activeEvents.find(e=>e.type==='goal'&&e.t<=shotTime);
  const kind=stage===2?'cart':'stand';
  c.save();c.lineCap='round';c.lineJoin='round';
  backdrop(c,stage);
  butterfly(c,time);
  if(stage===2){
    const center = basketAt(stage, 0, 0, 0, rules).x;
    const trackStart = center - (rules === 1 ? 91 : 120);
    const trackEnd = center + (rules === 1 ? 86 : 120);
    curve(c,`M${trackStart} 423 Q${center} 426 ${trackEnd} 423`,null,'#8ea179',1.9);
    curve(c,`M${trackStart + 3} 427 Q${center} 430 ${trackEnd + 4} 427`,null,'#a4b584',1.3);
  }
  if(stage===1)spring(c,cushionHit?shotTime-cushionHit.t:-1);
  basketBack(c,spare,'spare',phase);
  basketBack(c,target,kind,phase);
  chick(c,stage===0?295:stage===1?526:target.x-78,F-1,time,!!goalHit);
  rabbit(c,time,shooting);
  nest(c);
  if(!shooting){
    dots(c,state.guide,true,false);
    dots(c,state.aim,false,!!state.dragging);
    if(state.dragging&&state.aim?.length>1) {
      const a=state.aim[0], b=state.aim[1], dt=b.t-a.t;
      if(dt>0) {
        const pullX=Math.max(0,Math.min(16,(b.x-a.x)/dt*.034));
        const pullY=Math.max(0,Math.min(10,(a.y-b.y)/dt*.020));
        egg={x:egg.x-pullX,y:egg.y+pullY};
        curve(c,`M${LAUNCH.x-11} ${LAUNCH.y+10} Q${egg.x} ${egg.y+14} ${LAUNCH.x+12} ${LAUNCH.y+10}`,null,'#a27753',2.4);
      }
    }
  }
  if(stage===1)springStar(c,target.x-target.width*.32,target.y-6,6,'#ffd685','#8b8459');
  const alt=Math.max(0,F-16-egg.y);
  if(shooting&&egg.x>=0&&egg.x<W){
    c.save();c.globalAlpha=Math.max(.07,.24-alt/570);
    oval(c,egg.x,F+1,Math.max(4,11-alt*.018),2.3,'#5c785d');c.restore();
  }
  const eggColor=['pink','blue','lilac'][(stage+goals)%3];
  const spin=shooting?Math.min(shotTime*3.7,13):Math.sin(time*1.65)*.042;
  // When at rest the decorated egg is clearly visible on its tee, even on a small phone.
  if(egg.x> -30&&egg.x<W+30&&egg.y> -30&&egg.y<H+30) makeEgg(c,egg.x,egg.y,shooting?.84:.89,spin,eggColor);
  basketFront(c,spare,'spare',0);
  basketFront(c,target,kind,state.progress??0);
  for(const event of activeEvents) contact(c,event,shotTime-event.t);
  if(!goalHit&&Number.isFinite(state.celebration)&&state.celebration>=0){
    contact(c,{type:'goal',x:target.x,y:target.y},state.celebration);
  }
  c.restore();
}

function background(c, stage) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const sky = c.createLinearGradient(0,0,0,330);
  const skyColors = [['#97cac1','#e1e8be','#ffebbc'],['#a2c8c9','#e6e4c1','#fbe5b9'],['#b0cdc6','#eee6bc','#f9dbb2']][stage];
  sky.addColorStop(0,skyColors[0]); sky.addColorStop(.57,skyColors[1]); sky.addColorStop(1,skyColors[2]);
  c.fillStyle=sky; c.fillRect(0,0,W,H);
  const sunX=510-stage*13, sunY=76+stage*4;
  oval(c,sunX,sunY,35,35,'#ffefbe37'); oval(c,sunX,sunY,28,28,'#fff1bd'); 
  cloud(c,111,111,.73); cloud(c,325,66,.61); cloud(c,673,106,.77);
  cloud(c,416,174,.37);
  curve(c,'M0 225 Q81 173 154 211 Q230 170 282 190 Q342 207 384 201 Q447 157 507 190 Q597 153 641 177 Q702 156 760 181 V329 H0Z','#bbcfae');
  curve(c,'M0 251 Q112 196 215 229 Q298 245 400 211 Q484 179 574 213 Q635 232 759 197 L760 322 H0Z','#a4c3a7');
  const rng = random(1462);
  for(let i=0;i<32;i++){
    const x=380+rng()*390,base=244+Math.sin(x*.014)*7;
    farTree(c,x,base,.22+rng()*.4,'#8eb49d');
  }
  curve(c,'M0 266 Q85 224 183 245 Q299 214 381 245 Q472 284 561 250 Q660 213 760 242 V360 H0Z','#b3cb9a');
  church(c);
  for(const [x,y,s] of [[518,257,.6],[625,257,.53],[647,253,.69],[672,252,.48],[479,266,.42]]) farTree(c,x,y,s,'#89a78c');
  curve(c,'M0 291 Q104 269 211 285 Q348 307 470 263 Q592 227 760 266 V365 H0Z','#c8d7a3');
  curve(c,'M274 305 Q438 285 496 258 Q566 239 615 243 Q525 243 470 271 Q410 293 274 305Z','#e6dfaf');
  curve(c,'M0 285 Q88 249 160 260 Q225 272 286 303 L218 331 H0Z','#a8c393');
  curve(c,'M0 309 Q128 284 249 310 Q381 338 507 288 Q607 263 760 295 V397 H0Z','#ded9a1');
  for(let i=0;i<7;i++){
    curve(c,`M${507+i*27} ${287+i*.25} Q${491+i*24} ${300+i*1.3} ${424+i*29} ${319+i*.45}`,null,'#bdca92',1.7);
  }
  curve(c,'M0 324 Q86 280 211 310 Q333 333 426 325 Q569 320 669 294 Q711 284 760 282 V418 H0Z','#a8c18c');
  // Uneven distant hedge and a timber meadow fence establish scale.
  for(const [x,y,s] of [[-8,316,.88],[23,313,.66],[51,314,.48],[74,315,.44],[218,321,.38],[244,325,.34],[676,305,.36],[704,299,.45],[732,294,.67],[764,293,.83]]) hedge(c,x,y,s,'#85aa84');
  c.save(); c.globalAlpha=.72;
  curve(c,'M139 311 Q304 347 422 325 T614 298',null,'#8c9c76',2.1);
  for(const [x,y] of [[145,313],[188,321],[229,327],[274,333],[319,333],[366,330],[419,326],[467,315],[517,306],[565,301],[610,299]]){
    segment(c,x,y-7,x-1,y+5,'#879975',2.5);
  }
  c.restore();
  curve(c,'M0 347 Q140 316 278 342 Q379 361 503 335 Q664 310 760 332 V430 H0Z','#b5cb8d');
  const meadow = c.createLinearGradient(0,319,0,427);
  meadow.addColorStop(0,'#c9d99d'); meadow.addColorStop(1,'#acc788');
  curve(c,'M0 358 Q138 331 280 351 Q401 372 556 345 Q655 326 760 344 V436 H0Z',meadow);
  curve(c,'M219 363 Q302 360 396 372 Q516 383 620 357 Q539 384 402 383 Q287 369 219 363Z','#e0dfa6');
  // Tiny impressions of meadow flowers recede with distance.
  for(let i=0;i<160;i++){
    const x=rng()*W,y=340+rng()*81, s=(y-330)/85;
    if(y<351+Math.sin(x*.013)*7) continue;
    if(i%4===0) {
      oval(c,x,y,1.4+s,1+s*.35,['#f9e9af','#f5dfa6','#ecc8a2'][i%3],-.2);
      segment(c,x-1,y+1,x-2,y+3,'#95ad77',.8);
    } else { segment(c,x,y,x+1+s*1.7,y-.8-s,'#96b781',.7+s*.35); }
  }
  // Soft lawn lip at the playable ground, with visible warm cut earth below.
  const turf = c.createLinearGradient(0,F-3,0,H); turf.addColorStop(0,'#91b27a'); turf.addColorStop(.45,'#7fa574'); turf.addColorStop(1,'#769d73');
  curve(c,'M0 419 Q100 413 178 418 Q278 422 357 418 Q501 410 595 418 Q697 423 760 416 V500 H0Z',turf);
  curve(c,'M0 426 Q99 419 194 425 Q269 428 363 425 Q501 417 606 425 Q701 430 760 421',null,'#bdd092',2.6);
  for(let i=0;i<132;i++){
    const x=rng()*W,y=425+rng()*78;
    if(i%4===0) {
      curve(c,`M${x-3} ${y-2} q3 1 4 4 q1 -4 4 -5`,null,'#69966e',1.7);
    } else if(i%3===0) { oval(c,x,y,2.7,1.2,'#a5bd82',-.18); }
    else { segment(c,x,y,x+2.9,y-.8,'#8daf7b',1.2); }
  }
  const flowers=[[9,452,6],[18,445,3],[39,483,6],[54,480,3],[144,455,2.7],[175,490,4],[186,487,3.5],[335,461,3],[354,488,5],[369,485,3.2],[495,454,3],[542,487,4.5],[551,485,3],[632,460,3.3],[680,491,6],[693,486,3],[740,457,6],[753,448,4]];
  flowers.forEach(([x,y,size],i)=> daisy(c,x,y,size,flowerColors[i%flowerColors.length],(rng()-.5)*.8));
  // Sun-bleached paper grain. Draw once into the cached illustrated backdrop.
  for(let i=0;i<5100;i++){
    const x=rng()*W,y=rng()*H;
    c.fillStyle=i%2?'#5b70550a':'#fffbee16';
    c.fillRect(x,y,.4+rng()*1.15,.5+rng()*.65);
  }
  bunting(c);
  // A few close leaves frame the skyline.
  curve(c,'M773 -4 Q745 21 712 27 Q700 31 687 32',null,'#779678',2.5);
  [[745,13,-.8],[734,19,.5],[719,24,-.8],[705,28,.5],[694,30,-.75]].forEach(([x,y,a],i)=>{
    oval(c,x,y+(i%2?4:-4),8,3.5,'#84a586',a);
  });
}
