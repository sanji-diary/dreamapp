import { MAP, createGame } from './engine.mjs';

const TAU = Math.PI * 2;
const PLAYER_COLORS = { p1: '#4470df', p2: '#e97456' };
const KOREAN_FONT = 'system-ui, "Malgun Gothic", sans-serif';

function oval(context, x, y, rx, ry, fill, rotation = 0) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, rotation, 0, TAU);
  context.fillStyle = fill;
  context.fill();
}

function rounded(context, x, y, width, height, radius, fill, outline) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (outline) {
    context.strokeStyle = outline;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function polygon(context, points, fill, outline, width = 1) {
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (outline) {
    context.strokeStyle = outline;
    context.lineWidth = width;
    context.stroke();
  }
}

function stroke(context, color, width, draw) {
  context.beginPath();
  draw(context);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function drawTree(context, x, y, scale, variant) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  oval(context, 6, 5, 35, 9, 'rgba(37,71,40,.16)');
  rounded(context, -5, -29, 12, 34, 4, '#89644c');
  const palettes = [
    ['#38775a', '#549167', '#78a86b'],
    ['#3b795d', '#5b9a77', '#82ae79'],
    ['#64783f', '#82964d', '#a2ac5d'],
  ];
  const [dark, mid, light] = palettes[variant % palettes.length];
  oval(context, 2, -34, 35, 25, dark, -0.17);
  oval(context, -14, -43, 22, 22, mid, -0.3);
  oval(context, 15, -54, 25, 28, mid, 0.22);
  oval(context, -3, -65, 25, 25, light, -0.22);
  oval(context, -13, -70, 12, 6, 'rgba(249,246,182,.23)', -0.4);
  stroke(context, 'rgba(205,222,151,.40)', 1.7, (path) => {
    path.moveTo(9, -69);
    path.quadraticCurveTo(17, -73, 23, -65);
    path.moveTo(-24, -45);
    path.quadraticCurveTo(-29, -43, -27, -37);
  });
  context.restore();
}

function drawChurch(context, x, y) {
  context.save();
  context.translate(x, y);
  context.scale(0.83, 0.83);
  oval(context, 14, 15, 96, 19, 'rgba(66,92,50,.22)', 0.1);
  oval(context, -1, 12, 77, 15, '#b0b267');
  polygon(context, [[38, -61], [69, -44], [69, 3], [38, 15]], '#c2a778', '#8a775d', 1.5);
  polygon(context, [[36, -89], [78, -61], [69, -40], [34, -57]], '#416c68', '#345951', 2);
  rounded(context, -51, -62, 91, 75, 4, '#f5e1b9', '#a08b6e');
  polygon(context, [[-58, -59], [-9, -96], [46, -59], [38, -51], [-5, -76], [-50, -50]], '#527e75', '#355f57', 2.6);
  stroke(context, '#7aa094', 2.4, (path) => {
    path.moveTo(-54, -59);
    path.lineTo(-9, -90);
    path.lineTo(41, -58);
  });
  stroke(context, '#e4d0a7', 2, (path) => {
    for (const row of [-39, -20, -2]) {
      path.moveTo(-48, row);
      path.lineTo(35, row);
    }
  });
  rounded(context, -37, -40, 14, 23, [7, 7, 2, 2], '#83a5a1', '#7e876c');
  rounded(context, 16, -40, 14, 23, [7, 7, 2, 2], '#83a5a1', '#7e876c');
  rounded(context, 50, -32, 12, 21, [6, 6, 2, 2], '#7b9a94', '#888467');
  stroke(context, '#f9eecb', 1.3, (path) => {
    for (const windowX of [-30, 23, 56]) {
      path.moveTo(windowX, -40);
      path.lineTo(windowX, -18);
      path.moveTo(windowX - 5, -28);
      path.lineTo(windowX + 5, -28);
    }
  });
  rounded(context, -17, -23, 23, 36, [11, 11, 3, 3], '#91634e', '#78604c');
  rounded(context, -12, -17, 13, 28, [7, 7, 2, 2], '#ad7957');
  oval(context, -1, 1, 1.8, 1.8, '#f3d786');
  oval(context, -6, -55, 7, 7, '#91b6a6');
  stroke(context, '#f8eaba', 1.4, (path) => {
    path.moveTo(-12, -55);
    path.lineTo(0, -55);
    path.moveTo(-6, -61);
    path.lineTo(-6, -49);
  });
  stroke(context, '#b07f47', 4.7, (path) => {
    path.moveTo(-8, -106);
    path.lineTo(-8, -85);
    path.moveTo(-15, -100);
    path.lineTo(-1, -100);
  });
  stroke(context, '#f6d88d', 2.3, (path) => {
    path.moveTo(-9, -106);
    path.lineTo(-9, -87);
    path.moveTo(-15, -100);
    path.lineTo(-2, -100);
  });
  rounded(context, -46, 14, 80, 5, 2.5, '#d8bd8f');
  rounded(context, -51, 19, 89, 5, 2.5, '#c5a77d');
  rounded(context, -65, -12, 18, 17, 4, '#be896b');
  rounded(context, 29, -12, 17, 17, 4, '#be896b');
  for (const plantX of [-58, 38]) {
    oval(context, plantX - 2, -15, 7, 8, '#668f59', -0.4);
    oval(context, plantX + 3, -19, 7, 8, '#87a65a', 0.4);
    oval(context, plantX + 3, -22, 3, 3, '#f4b486');
  }
  context.restore();
}

function drawFence(context, wall) {
  const { x, y, w, h } = wall;
  const middle = x + w / 2;
  rounded(context, x + 7, y + 6, w, h, 7, 'rgba(60,76,45,.17)');
  rounded(context, x + 2, y, w - 4, h, 5, '#ae8859');
  rounded(context, x + 4, y + 1, 7, h - 2, 3.5, '#e1ba83');
  rounded(context, x + w - 10, y + 2, 6, h - 4, 3, '#b88b55');
  for (let postY = y + 6; postY < y + h - 1; postY += 31) {
    rounded(context, middle - 12, postY - 5, 24, 10, 3, '#775d45');
    rounded(context, middle - 12, postY - 7, 24, 8, 3, '#dfa970');
    rounded(context, middle - 11, postY - 6, 19, 2.5, 1.2, '#efd0a0');
    oval(context, middle + 7, postY - 4, 1.1, 1.1, '#886143');
  }
  rounded(context, middle - 13, y + h - 9, 26, 10, 3, '#775d45');
  rounded(context, middle - 13, y + h - 11, 26, 8, 3, '#e4b27a');
}

function drawDaisy(context, x, y, size, tint) {
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * TAU / 5;
    oval(context, x + Math.cos(angle) * size * .57, y + Math.sin(angle) * size * .57,
      size * .57, size * .38, tint, angle);
  }
  oval(context, x, y, size * .39, size * .39, '#dba649');
}

function drawFlowerPatch(context, patch, index) {
  const random = seededRandom(41379 + index * 37);
  const span = Math.min(38, patch.radius * .46);
  oval(context, patch.x, patch.y, span * 1.24, span * .75, 'rgba(88,129,65,.30)', -.12);
  for (let i = 0; i < 16; i++) {
    const a = random() * TAU;
    const r = Math.sqrt(random()) * span;
    const x = patch.x + Math.cos(a) * r;
    const y = patch.y + Math.sin(a) * r * .68;
    const size = 2.8 + random() * 2.3;
    oval(context, x + 2, y + size, size * 1.2, size * .49, '#698e54', -.65);
    drawDaisy(context, x, y, size, i % 3 ? '#fff4d2' : '#eab19b');
  }
}

function drawTerrain(context) {
  const random = seededRandom(51243);
  const { width, height, walls, shepherd } = MAP;
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#c0cf7d');
  base.addColorStop(0.48, '#a5bd69');
  base.addColorStop(1, '#88aa63');
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const shade = context.createRadialGradient(510, 190, 80, 490, 225, 570);
  shade.addColorStop(0, 'rgba(244,231,139,.22)');
  shade.addColorStop(1, 'rgba(41,96,68,.25)');
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  for (const [x, y, rx, ry, angle] of [[108, 158, 135, 93, 0.31], [479, 46, 161, 86, -0.24], [460, 484, 213, 86, -0.18], [740, 456, 130, 82, -0.35], [98, 535, 168, 67, 0.18], [899, 172, 132, 74, 0.43]]) {
    oval(context, x, y, rx, ry, 'rgba(58,112,58,.105)', angle);
    oval(context, x - 14, y - 7, rx * 0.85, ry * 0.7, 'rgba(226,220,132,.12)', angle);
  }

  const route = (path) => {
    path.moveTo(124, 139);
    path.bezierCurveTo(111, 227, 136, 351, 226, 411);
    path.bezierCurveTo(324, 479, 415, 466, 452, 353);
    path.bezierCurveTo(485, 267, 463, 194, 522, 150);
    path.bezierCurveTo(600, 89, 678, 137, 725, 159);
    path.quadraticCurveTo(763, 174, shepherd.x, shepherd.y + 8);
  };
  stroke(context, 'rgba(111,120,62,.24)', 87, route);
  stroke(context, '#d0be83', 81, route);
  stroke(context, '#dec791', 67, route);
  stroke(context, 'rgba(240,213,157,.54)', 45, route);

  for (let index = 0; index < 2550; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.5 + random() * 1.5;
    const tint = index % 4 === 0 ? 'rgba(250,235,170,.30)' : 'rgba(68,112,59,.13)';
    oval(context, x, y, radius * 1.35, radius * 0.63, tint, random() * TAU);
  }

  for (const [originX, originY, range] of [[67, 261, 68], [229, 88, 61], [219, 291, 74], [378, 178, 60], [538, 312, 75], [547, 505, 88], [749, 269, 92], [801, 487, 126], [107, 527, 70]]) {
    for (let index = 0; index < 18; index += 1) {
      const x = originX + (random() - 0.5) * range;
      const y = originY + (random() - 0.5) * range;
      stroke(context, index % 2 ? '#759953' : '#8ba95c', 1.25, (path) => {
        path.moveTo(x - 3, y - 2);
        path.quadraticCurveTo(x - 0.5, y - 1, x, y + 2);
        path.moveTo(x, y + 2);
        path.quadraticCurveTo(x + 0.5, y - 2, x + 3, y - 4);
      });
      if (index % 5 === 0) {
        const flower = index % 2 ? '#f3df8d' : '#edd5ac';
        oval(context, x + 3, y - 5, 2.3, 2.3, flower);
        oval(context, x + 3, y - 5, 0.8, 0.8, '#cb9257');
      }
    }
  }

  for (const [x, y, size] of [[375, 92, 1.15], [682, 238, 0.9], [735, 299, 1.1], [877, 466, 1.2], [99, 404, 0.85], [185, 565, 0.7], [545, 64, 0.7], [316, 540, 0.6], [891, 326, 0.7]]) {
    oval(context, x + 3, y + 4, 13 * size, 6 * size, 'rgba(62,88,59,.19)');
    polygon(context, [[x - 12 * size, y + 2 * size], [x - 6 * size, y - 7 * size], [x + 6 * size, y - 8 * size], [x + 13 * size, y - 2 * size], [x + 11 * size, y + 6 * size], [x - 7 * size, y + 6 * size]], '#a9a87d');
    polygon(context, [[x - 9 * size, y], [x - 5 * size, y - 6 * size], [x + 6 * size, y - 7 * size], [x + 11 * size, y - 2 * size], [x - 1 * size, y + 1 * size]], '#c6bc8b');
  }

  const shoreline = (path) => {
    path.moveTo(990, 168);
    path.bezierCurveTo(965, 146, 931, 146, 921, 171);
    path.bezierCurveTo(905, 199, 942, 219, 931, 251);
    path.bezierCurveTo(915, 289, 925, 326, 964, 334);
    path.lineTo(990, 334);
  };
  stroke(context, '#729c63', 22, shoreline);
  stroke(context, '#e0d49b', 13, shoreline);
  context.beginPath();
  shoreline(context);
  context.closePath();
  const water = context.createLinearGradient(901, 150, 967, 340);
  water.addColorStop(0, '#9ad5c5');
  water.addColorStop(1, '#63aaa6');
  context.fillStyle = water;
  context.fill();

  (MAP.lures ?? []).forEach((patch, i) => drawFlowerPatch(context, patch, i));
  for (const wall of walls) drawFence(context, wall);
  for (const [x, y, scale, variant] of [[28, 98, 0.83, 0], [3, 144, 0.78, 1], [18, 343, 0.61, 2], [5, 365, 0.8, 0], [33, 564, 0.83, 1], [5, 603, 0.93, 0], [292, 599, 0.6, 1], [357, 34, 0.78, 0], [401, 20, 0.9, 1], [615, 33, 0.68, 2], [642, 39, 0.64, 1], [689, 12, 0.75, 0], [950, 115, 0.67, 2], [972, 129, 0.85, 1], [940, 562, 0.69, 2], [964, 582, 0.91, 0], [797, 611, 0.8, 1]]) {
    drawTree(context, x, y, scale, variant);
  }
  drawChurch(context, shepherd.x + 7, shepherd.y - 36);

  const outlines = context.createLinearGradient(0, 0, 0, 55);
  outlines.addColorStop(0, 'rgba(86,107,58,.25)');
  outlines.addColorStop(1, 'rgba(86,107,58,0)');
  context.fillStyle = outlines;
  context.fillRect(0, 0, width, 55);
}

function drawWaterRipples(context, time) {
  const ripples = [[940, 177, 12], [949, 194, 14], [949, 217, 7], [942, 258, 9], [943, 284, 7], [948, 299, 12], [954, 316, 10]];
  for (const [x, y, width] of ripples) {
    const drift = Math.sin(time / 1000 + y) * 3;
    stroke(context, 'rgba(228,249,224,.56)', 1.7, (path) => {
      path.moveTo(x + drift, y);
      path.quadraticCurveTo(x + drift + width * 0.45, y - 2.5, x + drift + width, y - 1);
    });
  }
}

function drawShepherdCall(context, state, time) {
  const { x, y, callRadius, safeRadius } = MAP.shepherd;
  const visibleSheep = state.sheep.some((sheep) => (
    sheep.mode === 'follow' || (sheep.mode !== 'safe' && Math.hypot(sheep.x - x, sheep.y - y) < callRadius)
  ));
  const glow = context.createRadialGradient(x, y, 10, x, y, callRadius);
  glow.addColorStop(0, 'rgba(255,240,171,.52)');
  glow.addColorStop(0.30, 'rgba(253,230,163,.30)');
  glow.addColorStop(1, 'rgba(253,231,166,.015)');
  oval(context, x, y, callRadius, callRadius, glow);

  context.save();
  context.setLineDash([4, 10]);
  stroke(context, visibleSheep ? 'rgba(255,246,196,.85)' : 'rgba(255,246,196,.56)', 2.2, (path) => {
    path.arc(x, y, callRadius, 0, TAU);
  });
  context.restore();

  const pulse = (Math.sin(time / 650) + 1) / 2;
  stroke(context, `rgba(255,249,201,${0.37 + pulse * 0.14})`, 2, (path) => {
    path.ellipse(x, y + 2, safeRadius + pulse * 5, safeRadius * 0.72 + pulse * 4, 0, 0, TAU);
  });
}

function drawShepherd(context, time) {
  const { x, y } = MAP.shepherd;
  context.save();
  context.translate(x, y - 7);
  oval(context, 1, 12, 20, 7, 'rgba(61,80,51,.21)');
  oval(context, -7, 11, 5, 3, '#7e5b48');
  oval(context, 7, 11, 5, 3, '#7e5b48');
  polygon(context, [[-12, -19], [-18, 6], [-10, 12], [12, 12], [17, 6], [12, -20]], '#f9e9c8', '#b7a380', 1.8);
  polygon(context, [[3, -22], [-6, -8], [-4, 11], [7, 11], [4, -8], [10, -18]], '#429083');
  stroke(context, '#79b3a1', 1.7, (path) => {
    path.moveTo(6, -18);
    path.quadraticCurveTo(0, -7, 4, 8);
  });
  oval(context, 0, -31, 12, 14, '#725141');
  oval(context, 1, -29, 9, 10, '#d89d74');
  oval(context, 0, -36, 10, 5, '#785141', -0.15);
  oval(context, -3, -25, 3.9, 4, '#805445', -0.38);
  oval(context, 4, -24, 4.4, 3.5, '#805445', 0.4);
  oval(context, -3, -30, 1, 1.1, '#513a35');
  oval(context, 4, -30, 1, 1.1, '#513a35');
  stroke(context, '#8d6a49', 3.4, (path) => {
    path.moveTo(23, 11);
    path.lineTo(24, -30);
    path.bezierCurveTo(25, -42, 14, -42, 15, -34);
  });
  const handHeight = -9 + Math.sin(time / 520) * 3;
  stroke(context, '#f5e8ca', 7.5, (path) => {
    path.moveTo(-11, -15);
    path.quadraticCurveTo(-18, -4, -23, handHeight);
    path.moveTo(11, -15);
    path.lineTo(22, -13);
  });
  oval(context, -23, handHeight, 4, 3.7, '#d5a078');
  oval(context, 22, -13, 3.8, 3.7, '#d5a078');
  context.restore();
}

const sheepFaces = ['#a38370', '#7c6860', '#b28f70', '#937a67', '#b5937d', '#806d64'];
const sheepWool = ['#fff7e4', '#f5e9d1', '#fff5da', '#f9f1e1', '#fff5e9', '#f4ebd9'];

function drawSheep(context, sheep, pose, scale) {
  const { x, y, mode } = sheep;
  const variety = (Number(sheep.id.slice(1)) - 1) % 6;
  const time = pose.time + variety * 830;
  const size = scale * [1.04, .94, 1, 1.06, .95, 1.02][variety];
  const stride = Math.min(1, pose.speed / 20);
  const gallop = Math.min(1, Math.max(0, (pose.speed - 25) / 31));
  const wave = Math.sin(pose.phase);
  const lift = Math.max(0, wave) ** 2 * gallop * 3.8 + Math.abs(wave) * stride * .85;
  const chewing = pose.grazing * (.5 + .5 * Math.sin(time / 187));
  oval(context, x + 1, y + 5, (16 - lift * .35) * size, (8 - lift * .22) * size, 'rgba(65,86,52,.23)');
  context.save();
  context.translate(x, y - 3 - lift * size);
  context.scale(size, size);
  context.rotate(pose.heading);

  const woolFill = mode === 'safe' ? '#fff4d4' : sheepWool[variety];
  const face = sheepFaces[variety];
  for (const [legX, legY, diagonal] of [[-9, -8, 1], [-8, 8, -1], [7, -8, -1], [8, 8, 1]]) {
    const walking = wave * diagonal * stride * 3.5;
    const running = Math.sin(pose.phase + (legY > 0 ? .42 : 0)) * Math.sign(legX) * 5.6;
    const reach = walking * (1 - gallop) + running * gallop;
    oval(context, legX + reach, legY, 4.4, 2.6, '#736552', -.1 * reach);
  }
  oval(context, -2, 0, 14.2, 10.5, '#d8caa5');
  oval(context, -4, -1, 13.4, 10.1, woolFill);
  for (const [woolX, woolY, size] of [[-13, 0, 4.4], [-11, -6.5, 4.4], [-5, -9, 4.6], [2, -8, 4.8], [7, -5, 3.9], [-10, 6.7, 4], [-2, 7.7, 4.5], [5, 6.8, 4.1]]) {
    oval(context, woolX, woolY, size, size * 0.88, woolFill);
  }
  stroke(context, '#e8dcbb', 1.2, (path) => {
    path.moveTo(-7, -3);
    path.quadraticCurveTo(-3, -6, 0, -2);
    path.moveTo(-7, 4);
    path.quadraticCurveTo(-3, 1, 1, 4);
  });
  const looking = mode === 'confused' ? Math.sin(time / 230) * .63 : 0;
  context.translate(9, 0);
  context.rotate(looking + pose.grazing * Math.sin(time / 520) * .13);
  context.translate(-8 + pose.grazing * 2.4 + chewing * 1.6, pose.grazing * 1.5);
  const earPitch = .48 + chewing * .2 - gallop * .5;
  oval(context, 12.7 - gallop * 2.3, -5.9, 4.6, 2.4, face, -earPitch);
  oval(context, 12.7 - gallop * 2.3, 5.9, 4.6, 2.4, face, earPitch);
  oval(context, 13.8, 0, 7.5, 6, face);
  oval(context, 17.8, 0.4, 4.5, 3.5, '#dec0a1');
  oval(context, 15.6, -2.8, 1.15, 1.1, '#473a35');
  oval(context, 15.6, 2.9, 1.15, 1.1, '#473a35');
  oval(context, 20.7, 0.15, 1.8, 1.1, '#72534c');
  if (pose.grazing > .45) {
    stroke(context, '#618143', 1.8, (path) => {
      path.moveTo(20.8, .9);
      path.quadraticCurveTo(24.7, 1.1, 25.6 + chewing * 1.5, -3);
      path.moveTo(23, .4);
      path.lineTo(26.3, 2 + chewing);
    });
  }
  context.restore();
}

function drawSheepHelpers(context, sheep, time, scale) {
  const { x, y, helpers = 0, mode } = sheep;
  const shepherd = MAP.shepherd;
  if (mode === 'tempted' || mode === 'confused') {
    context.save();
    context.translate(x + 10 * scale, y - 25 * scale);
    context.scale(scale, scale);
    polygon(context, [[-7, 5], [-7, 11], [-1, 6]], '#fff8e1');
    rounded(context, -10, -9, 20, 17, 7, '#fff8e1', '#8c8e68');
    if (mode === 'tempted') {
      drawDaisy(context, 0, -.6, 5, '#d99480');
    } else {
      stroke(context, '#735e4c', 2, (path) => {
        path.moveTo(-3.3,-3.5);
        path.bezierCurveTo(-2,-8,5,-6,3.1,-1.8);
        path.quadraticCurveTo(.1,.1,.1,1.2);
      });
      oval(context,0,4.3,1,1,'#735e4c');
    }
    context.restore();
    return;
  }
  if (mode === 'safe' || mode === 'follow' || helpers === 3 || Math.hypot(x - shepherd.x, y - shepherd.y) > shepherd.callRadius) return;

  const badgeY = y - 23 * scale + Math.sin(time / 380 + x) * 1.1;
  context.save();
  context.translate(x, badgeY);
  context.scale(scale, scale);
  rounded(context, -12, -5.5, 24, 11, 5.5, '#fff8db', '#787a55');
  oval(context, -5, 0, 3.3, 3.3, helpers & 1 ? '#d7ceae' : PLAYER_COLORS.p1);
  oval(context, 5, 0, 3.3, 3.3, helpers & 2 ? '#d7ceae' : PLAYER_COLORS.p2);
  context.restore();
}

function updateAnimalPose(poses, actor, frameTime, strideLength) {
  let pose = poses.get(actor.id);
  const dt = pose ? (frameTime - pose.time) / 1000 : 0;
  const distance = pose ? Math.hypot(actor.x - pose.x, actor.y - pose.y) : 0;
  const headDown = actor.mode === 'graze' || actor.mode === 'tempted' || actor.mode === 'safe' ? 1 : 0;
  if (!pose || dt < 0 || dt > .25 || distance > 48) {
    pose = { heading: actor.heading, phase: 0, speed: 0, grazing: headDown };
    poses.set(actor.id, pose);
  } else if (dt > 0) {
    const turn = actor.heading - pose.heading;
    const shortestTurn = Math.atan2(Math.sin(turn), Math.cos(turn));
    pose.heading += shortestTurn * -Math.expm1(-18 * dt);
    const travel = Math.min(distance, 160 * dt);
    pose.phase = (pose.phase + travel * TAU / strideLength) % TAU;
    pose.speed += (travel / dt - pose.speed) * -Math.expm1(-16 * dt);
    const dip = headDown * Math.max(0, 1 - pose.speed / 15);
    pose.grazing += (dip - pose.grazing) * -Math.expm1(-7 * dt);
  }
  pose.x = actor.x;
  pose.y = actor.y;
  pose.time = frameTime;
  return pose;
}

function drawDog(context, dog, playerId, time, pose, scale) {
  const { x, y, id } = dog;
  const color = PLAYER_COLORS[id];
  const own = id === playerId;
  const barkAge = time - dog.barkAt;
  const barking = dog.barkAt > 0 && barkAge >= -40 && barkAge < 330;
  const trot = Math.min(1, pose.speed / 78);
  const stride = Math.sin(pose.phase) * trot;

  if (own) {
    stroke(context, 'rgba(249,249,221,.89)', 4.1, (path) => path.ellipse(x, y + 4, 21 * scale, 13 * scale, 0, 0, TAU));
    stroke(context, color, 2.2, (path) => path.ellipse(x, y + 4, 21 * scale, 13 * scale, 0, 0, TAU));
  }
  oval(context, x + 1, y + 5, 18 * scale, 8 * scale, 'rgba(48,65,48,.22)');
  context.save();
  context.translate(x, y - 3 - Math.abs(stride) * 1.35);
  context.scale(scale, scale);
  context.rotate(pose.heading);

  const [fur, shadedFur, cream] = id === 'p1' ? ['#b4794b', '#775644', '#f2d4a0'] : ['#6d665b', '#575248', '#f2d8ae'];
  const restingWag = Math.sin(pose.time / 190 + (id === 'p1' ? 0 : 3));
  const tailswing = restingWag * .55 * (1 - trot) + Math.sin(pose.phase - .6) * trot;
  stroke(context, shadedFur, 6.2, (path) => {
    path.moveTo(-11, -1);
    path.quadraticCurveTo(-20, tailswing * 3.5, -22, -6 + tailswing * 6);
  });
  stroke(context, cream, 4.2, (path) => {
    path.moveTo(-20, -3 + tailswing * 5.3);
    path.lineTo(-22, -6 + tailswing * 6);
  });

  for (const [legX, legY, direction] of [[-8, -10, 1], [-8, 10, -1], [7, -9, -1], [7, 9, 1]]) {
    oval(context, legX + stride * direction * 4.2, legY, 5, 3.2, cream);
  }
  oval(context, -3, 0, 15, 9.4, fur);
  oval(context, -10, -2, 7.5, 6.2, shadedFur, 0.22);
  oval(context, 9, 0, 5.4, 9.2, cream);
  polygon(context, [[5, -8.1], [11, -9], [13, 7], [7, 8.6]], color);
  polygon(context, [[6, -5], [-4, -7], [2, 1]], color);

  const earSwing = Math.cos(pose.phase * 2) * trot * .11;
  oval(context, 14, -7.8, 7.2, 4.5, shadedFur, -.26 - earSwing);
  oval(context, 14, 7.5, 7.2, 4.5, shadedFur, .24 + earSwing);
  oval(context, 16, 0, 10.2, 7.6, fur);
  oval(context, 20.5, 0, 6.6, barking ? 5.7 : 4.7, cream);
  oval(context, 18.7, -3.9, 1.35, 1.35, '#342f2a');
  oval(context, 18.7, 3.9, 1.35, 1.35, '#342f2a');
  if (barking) oval(context, 23.8, 0, 3, 2.7, '#754742');
  oval(context, 26.2, -0.3, 2.2, 1.9, '#453a35');
  context.restore();
}

function drawBark(context, dog, time) {
  const age = time - dog.barkAt;
  if (dog.barkAt <= 0 || age < -40 || age > 640) return;
  const progress = Math.max(0, age / 640);
  const radius = 18 + (MAP.barkRadius - 18) * (1 - (1 - progress) ** 2);
  const opacity = (1 - progress) * 0.7;
  const color = PLAYER_COLORS[dog.id];
  context.save();
  context.globalAlpha = opacity;
  stroke(context, '#ffebaf', 6, (path) => path.arc(dog.x, dog.y, radius, 0, TAU));
  stroke(context, color, 2.8, (path) => path.arc(dog.x, dog.y, radius, 0, TAU));
  if (progress < 0.75) {
    const labelY = dog.y - 30 - progress * 16;
    rounded(context, dog.x - 21, labelY - 13, 43, 24, 9, '#fff5d4', color);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 14px ${KOREAN_FONT}`;
    context.fillStyle = '#554638';
    context.fillText('멍!', dog.x + 0.5, labelY - 0.5);
  }
  context.restore();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const terrain = document.createElement('canvas');
  const terrainScale = 1.5;
  terrain.width = MAP.width * terrainScale;
  terrain.height = MAP.height * terrainScale;
  const terrainContext = terrain.getContext('2d');
  terrainContext.scale(terrainScale, terrainScale);
  drawTerrain(terrainContext);
  const initial = createGame(0);
  const poses = new Map();
  let start, round;

  function draw(state = initial, playerId, now = Date.now()) {
    const snapshot = state ?? initial;
    const frameTime = performance.now();
    if (snapshot.startedAt !== start || snapshot.round !== round) {
      poses.clear();
      start = snapshot.startedAt;
      round = snapshot.round;
    }
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth || MAP.width;
    const animalScale = cssWidth < 500 ? 1.24 : 1;
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round((canvas.clientHeight || MAP.height) * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(pixelWidth / MAP.width, 0, 0, pixelHeight / MAP.height, 0, 0);
    context.drawImage(terrain, 0, 0, MAP.width, MAP.height);
    drawWaterRipples(context, now);
    drawShepherdCall(context, snapshot, now);

    const actors = [...snapshot.sheep, ...snapshot.players, { ...MAP.shepherd, id: 'shepherd' }];
    actors.sort((first, second) => first.y - second.y);
    for (const actor of actors) {
      if (actor.id === 'shepherd') {
        drawShepherd(context, now);
      } else if (actor.id === 'p1' || actor.id === 'p2') {
        drawDog(context, actor, playerId, now, updateAnimalPose(poses, actor, frameTime, 40), animalScale);
      } else {
        drawSheep(context, actor, updateAnimalPose(poses, actor, frameTime, 27), animalScale);
      }
    }

    for (const dog of snapshot.players) drawBark(context, dog, now);
    for (const sheep of snapshot.sheep) drawSheepHelpers(context, sheep, now, animalScale);
  }

  return { draw };
}
