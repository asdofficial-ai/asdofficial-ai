export function startOrb() {
  const canvas = document.getElementById('orb'), context = canvas.getContext('2d');
  const wave = document.getElementById('wave'), wc = wave.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previous = 0;
  function frame(time) {
    const interval = document.body.dataset.state === 'speaking' ? 1000 / 24 : 1000 / 12;
    if (document.hidden || time - previous < interval) { requestAnimationFrame(frame); return; } previous = time;
    const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    const x = width / 2, y = height * .48, radius = Math.min(width * .34, height * .365), rotation = reduce ? .5 : time * .00012;
    const speaking = document.body.dataset.state === 'speaking';
    const glow = context.createRadialGradient(x, y, radius * .1, x, y, radius * 1.6); glow.addColorStop(0, '#ff921010'); glow.addColorStop(.65, '#f69e1812'); glow.addColorStop(1, '#ffae0000'); context.fillStyle = glow; context.fillRect(0, 0, width, height);
    function project(lat, lon, r = radius) {
      const px = Math.cos(lat) * Math.cos(lon + rotation), pz = Math.cos(lat) * Math.sin(lon + rotation), py = Math.sin(lat);
      return [x + px * r, y + (py * .94 - pz * .27) * r, pz];
    }
    context.lineWidth = .6;
    for (let row = -8; row <= 8; row++) {
      const lat = row * Math.PI / 18; context.beginPath();
      for (let step = 0; step <= 96; step++) { const point = project(lat, step * Math.PI / 48); step ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1]); }
      context.strokeStyle = row % 2 ? '#d3cbc063' : '#ffc37490'; context.stroke();
    }
    for (let col = 0; col < 24; col++) {
      context.beginPath(); for (let step = 0; step <= 48; step++) { const point = project(-Math.PI / 2 + step * Math.PI / 48, col * Math.PI / 12); step ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1]); }
      context.strokeStyle = '#eeb86383'; context.stroke();
    }
    for (let row = -5; row < 5; row++) for (let col = 0; col < 18; col++) {
      const a = project(row * Math.PI / 12, col * Math.PI / 9), b = project((row + 1) * Math.PI / 12, (col + 1) * Math.PI / 9);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.strokeStyle = `rgba(255,200,126,${a[2] > 0 ? .35 : .09})`; context.stroke();
    }
    context.shadowColor = '#ffae23';
    for (let ring = 0; ring < 4; ring++) { context.beginPath(); context.ellipse(x, y, radius * (1.06 + ring * .055), radius * (1.06 + ring * .055), 0, 0, Math.PI * 2); context.strokeStyle = ring % 2 ? '#9a7b5366' : '#e5c6978a'; context.lineWidth = ring === 0 ? 1.8 : .6; context.stroke(); }
    for (let tick = 0; tick < 90; tick++) { const a = tick * Math.PI / 45; const r = radius * 1.21; context.beginPath(); context.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); context.lineTo(x + Math.cos(a) * (r + (tick % 5 ? 3 : 7)), y + Math.sin(a) * (r + (tick % 5 ? 3 : 7))); context.strokeStyle = tick % 5 ? '#6c7c8355' : '#edbb6288'; context.lineWidth = 1; context.stroke(); }
    for (let i = 0; i < 60; i++) { const point = project(Math.sin(i * 3.13) * 1.2, i * 2.4 + rotation * .4); if (point[2] < -.3) continue; context.beginPath(); context.arc(point[0], point[1], i % 6 ? 1.1 : 2.5, 0, Math.PI * 2); context.shadowBlur = i % 6 ? 4 : 14; context.fillStyle = i % 6 ? '#ffe4ad' : '#fff4d6'; context.fill(); }
    context.shadowBlur = 9; context.lineWidth = 1.6; context.strokeStyle = '#ffbc5e';
    for (let i = 0; i < 3; i++) {
      const t = reduce ? .5 : time * .001;
      const tilt = (i - 1) * .24 + (speaking && !reduce ? Math.sin(t * (1.1 + i * .35) + i * 2) * .42 : 0);
      const direction = i % 2 ? -1 : 1;
      const phase = reduce ? i * 2 : t * direction * (speaking ? 1.05 + i * .24 : .16) + i * 2;
      const rx = radius * (1.37 + (speaking && !reduce ? Math.sin(t * 2.3 + i) * .035 : 0)), ry = radius * (.23 + i * .018);
      context.save(); context.translate(x, y + (i - 1) * radius * .09); context.rotate(tilt);
      context.beginPath(); context.ellipse(0, 0, rx, ry, 0, phase, phase + Math.PI * 1.55); context.lineWidth = speaking ? 2.3 : 1.4; context.strokeStyle = speaking ? '#ffcf77' : '#ffbc5e'; context.stroke();
      for (const angle of [phase, phase + Math.PI * 1.55]) { const tipX = rx * Math.cos(angle), tipY = ry * Math.sin(angle); context.beginPath(); context.arc(tipX, tipY, speaking ? 4 : 2.4, 0, Math.PI * 2); context.shadowBlur = speaking ? 19 : 8; context.fillStyle = '#fff1cc'; context.fill(); }
      context.restore();
    }
    context.shadowBlur = 0;
    const baseY = y + radius * 1.38; for (let i = 0; i < 3; i++) { context.beginPath(); context.ellipse(x, baseY + i * 7, radius * .53, radius * .12, 0, 0, Math.PI * 2); context.strokeStyle = i === 0 ? '#faba5a' : '#9c773c'; context.lineWidth = i === 0 ? 2 : 1; context.stroke(); }
    wc.clearRect(0, 0, wave.width, wave.height);
    const active = ['speaking', 'listening', 'thinking', 'transcribing'].includes(document.body.dataset.state);
    for (let line = 0; line < 4; line++) { wc.beginPath(); for (let px = 0; px <= wave.width; px += 2) { const envelope = Math.sin(px / wave.width * Math.PI) ** 2; const value = Math.sin(px * .04 + rotation * (active ? 25 : 6) + line * .6) * (active ? 13 : 7) * envelope; px ? wc.lineTo(px, 21 + value) : wc.moveTo(px, 21 + value); } wc.strokeStyle = line === 0 ? '#ffc15b' : '#f7a82955'; wc.stroke(); }
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const network = document.getElementById('network'), nc = network.getContext('2d');
  const dots = Array.from({ length: 30 }, (_, i) => [12 + (i * 71 % 430), 10 + (i * 33 % 60)]);
  dots.forEach((point, index) => { dots.slice(index + 1).forEach(other => { if (Math.hypot(point[0] - other[0], point[1] - other[1]) < 95) { nc.beginPath(); nc.moveTo(...point); nc.lineTo(...other); nc.strokeStyle = '#b6bba653'; nc.stroke(); } }); nc.beginPath(); nc.arc(...point, index % 4 ? 1.5 : 3, 0, Math.PI * 2); nc.fillStyle = index % 4 ? '#c8d1d5' : '#ffb435'; nc.fill(); });
}
