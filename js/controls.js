/* Map UI controls. They stay on the map across map switches and are
 * updated with set*() calls instead of being recreated. */

function stopMapEvents(element) {
  L.DomEvent.disableClickPropagation(element);
  L.DomEvent.disableScrollPropagation(element);
}

export const MousePosition = L.Control.extend({
  options: { position: 'bottomleft' },

  onAdd() {
    this._div = L.DomUtil.create('div', 'mouseposition');
    this.setPosition([0, 0]);
    return this._div;
  },

  setPosition([x, y]) {
    this._div.innerHTML = `X: ${x} ; Y: ${y}`;
  },
});

export const ColorPicker = L.Control.extend({
  options: { position: 'topleft' },

  initialize(onInput, options) {
    L.setOptions(this, options);
    this._onInput = onInput;
  },

  onAdd() {
    const container = L.DomUtil.create('div', 'colors');
    container.innerHTML = '<input type="color" value="#8adeff">';
    container.firstChild.addEventListener('input', (event) => this._onInput(event.target.value));
    stopMapEvents(container);
    return container;
  },
});
