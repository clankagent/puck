/** A renderer-owned camera. Coordinates are screen-pixel offsets from world origin. */
export function applyMotion(camera, delta, anchor, minZoom = .1, maxZoom = 5) {
  const zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * delta.zoomFactor));
  const ratio = zoom / camera.zoom;
  return {
    x: anchor.x + (camera.x - anchor.x) * ratio + delta.panX,
    y: anchor.y + (camera.y - anchor.y) * ratio + delta.panY,
    zoom,
  };
}
