/* Wheel and touchpad zoom that follows the input frame by frame, around
 * the cursor. Leaflet's own scroll wheel zoom collects events into
 * rounded, animated steps and drops input while a step animates, which
 * makes a touchpad swipe zoom in jerky stages.
 *
 *   map.addHandler('smoothWheelZoom', SmoothWheelZoom);
 *   map.smoothWheelZoom.enable();   // with scrollWheelZoom: false
 *
 * Each wheel event moves a target zoom; the map eases towards it and
 * redraws like a touch pinch (old tiles scaled, new ones loaded at the end). */

// zoom levels per pixel of wheel movement; a mouse wheel notch is ~100px
const LEVELS_PER_PIXEL = 1 / 100;
// touchpad pinches arrive as ctrl+wheel with small deltas
const PINCH_LEVELS_PER_PIXEL = 1 / 50;
// share of the remaining distance covered each frame
const EASING = 0.3;

export const SmoothWheelZoom = L.Handler.extend({
  addHooks() {
    L.DomEvent.on(this._map.getContainer(), 'wheel', this._onWheel, this);
  },

  removeHooks() {
    L.DomEvent.off(this._map.getContainer(), 'wheel', this._onWheel, this);
    this._finish();
  },

  _onWheel(event) {
    L.DomEvent.stop(event);
    const map = this._map;
    const rate = event.ctrlKey ? PINCH_LEVELS_PER_PIXEL : LEVELS_PER_PIXEL;
    const start = this._target ?? map.getZoom();
    this._target = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(),
      start + L.DomEvent.getWheelDelta(event) * rate));
    // keep the spot under the cursor in place
    this._aroundPoint = map.mouseEventToContainerPoint(event);
    this._aroundLatLng = map.containerPointToLatLng(this._aroundPoint);

    if (!this._frame) {
      map._stop();
      map._moveStart(true, false);
      this._frame = L.Util.requestAnimFrame(this._step, this);
    }
  },

  _step() {
    const map = this._map;
    const remaining = this._target - map.getZoom();
    const zoom = Math.abs(remaining) < 0.001 ? this._target : map.getZoom() + remaining * EASING;
    const offset = this._aroundPoint.subtract(map.getSize().divideBy(2));
    const center = map.unproject(map.project(this._aroundLatLng, zoom).subtract(offset), zoom);
    map._move(center, zoom, { pinch: true, round: false });

    if (zoom === this._target) {
      this._finish();
    } else {
      this._frame = L.Util.requestAnimFrame(this._step, this);
    }
  },

  _finish() {
    if (!this._frame) {
      return;
    }
    L.Util.cancelAnimFrame(this._frame);
    this._frame = null;
    this._target = null;
    this._map._moveEnd(true);
  },
});
