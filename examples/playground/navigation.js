// Application camera: SDK deltas arrive in device coordinates (X right,
// Y forward, Z vertical). Rendering uses X right, Y up, Z toward the viewer.
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
export function quaternion(a, b) {
  const [x, y, z, w] = a,
    [X, Y, Z, W] = b;
  return [
    w * X + x * W + y * Z - z * Y,
    w * Y - x * Z + y * W + z * X,
    w * Z + x * Y - y * X + z * W,
    w * W - x * X - y * Y - z * Z,
  ];
}
export function rotate(v, q) {
  return quaternion(quaternion(q, [...v, 0]), [
    -q[0],
    -q[1],
    -q[2],
    q[3],
  ]).slice(0, 3);
}
const rotation = (v) => {
  const angle = Math.hypot(...v);
  return angle
    ? [...mul(v, Math.sin(angle / 2) / angle), Math.cos(angle / 2)]
    : [0, 0, 0, 1];
};
export function cameraHome() {
  return {
    target: [0, 55, 0],
    orientation: quaternion(rotation([-0.28, 0, 0]), rotation([0, 0.5, 0])),
    distance: 450,
  };
}
export function moveCamera(camera, translation, angular) {
  // Screen-relative pan, forward/back dolly, and local orbit about a stable pivot.
  camera.target = add(
    camera.target,
    rotate([-translation[0], translation[2], 0], camera.orientation),
  );
  camera.distance = Math.max(
    90,
    Math.min(5000, camera.distance + translation[1]),
  );
  const q = quaternion(
    camera.orientation,
    rotation([-angular[0], -angular[2], -angular[1]]),
  );
  const norm = Math.hypot(...q);
  camera.orientation = q.map((v) => v / norm);
}
export function projection(point, camera, width, height) {
  const q = camera.orientation,
    v = rotate(
      point.map((x, i) => x - camera.target[i]),
      [-q[0], -q[1], -q[2], q[3]],
    );
  const depth = camera.distance - v[2];
  if (depth < 5) return null;
  const scale = (height * 0.95) / depth;
  return [width / 2 + v[0] * scale, height / 2 - v[1] * scale, depth];
}
export function drawScene(canvas, camera, style = 0) {
  const w = canvas.clientWidth || 800,
    h = canvas.clientHeight || 460,
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#edf2f6";
  ctx.fillRect(0, 0, w, h);
  const line = (a, b, color, width = 1) => {
    a = projection(a, camera, w, h);
    b = projection(b, camera, w, h);
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(...a.slice(0, 2));
    ctx.lineTo(...b.slice(0, 2));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  if (style !== 5)
    for (let i = -500; i <= 500; i += 50) {
      line([i, 0, -500], [i, 0, 500], i === 0 ? "#9caebb" : "#cfd9e1");
      line([-500, 0, i], [500, 0, i], i === 0 ? "#9caebb" : "#cfd9e1");
    }
  const faces = [];
  function box(center, size, color) {
    const p = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map((v) => v.map((n, i) => center[i] + (n * size[i]) / 2));
    for (const ids of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ]) {
      const pts = ids.map((i) => projection(p[i], camera, w, h));
      if (pts.some((p) => !p)) continue;
      faces.push({ pts, depth: pts.reduce((a, p) => a + p[2], 0) / 4, color });
    }
  }
  // A stepped mechanical assembly makes front/back, scale and occlusion legible.
  box([0, 10, 0], [240, 20, 180], "#537a94");
  box([-85, 70, 0], [25, 100, 120], "#7899af");
  box([85, 70, 0], [25, 100, 120], "#7899af");
  box([0, 120, 0], [195, 22, 120], "#adc2cf");
  box([0, 53, 0], [70, 65, 75], "#d89c4d");
  box([0, 92, 0], [28, 16, 95], "#c48434");
  for (const x of [-85, 85])
    for (const z of [-65, 65]) box([x, 24, z], [16, 8, 16], "#263f52");
  faces.sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach((p, i) =>
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
    );
    ctx.closePath();
    ctx.fillStyle =
      style === 2
        ? "#d2b48a"
        : style === 3
          ? "#f2f5f7"
          : style === 4
            ? "#324b62"
            : style === 6
              ? "#578b74"
              : style === 7
                ? "#8b739a"
                : f.color;
    if (style !== 1) ctx.fill();
    ctx.strokeStyle = style === 4 ? "#abc0cf" : "#3b5668";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  line([0, 1, 0], [160, 1, 0], "#b7473e", 2);
  line([0, 1, 0], [0, 160, 0], "#2c795c", 2);
  line([0, 1, 0], [0, 1, 160], "#3268bd", 2);
  const pivot = projection(camera.target, camera, w, h);
  ctx.strokeStyle = "#253a4e";
  ctx.beginPath();
  ctx.arc(pivot[0], pivot[1], 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#253a4e";
  ctx.font = "13px system-ui";
  ctx.fillText("Orbit pivot · crosshair", 16, h - 18);
  ctx.fillText("X red · Y green · Z blue", 16, 24);
}
