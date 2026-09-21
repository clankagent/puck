import { control } from './controls.js';
import type { Activation, CancelGesture, Ownership } from './controls.js';

export const motionDefaults = Object.freeze({ panSpeed: 1320, zoomSpeed: 1.5, translationSpeed: 600, rotationSpeed: Math.PI / 2, panDeadzone: .05, zoomDeadzone: .1, rotationDeadzone: .05, responseMs: 25, maxFrameMs: 50 });
export interface DirectionSelectionOptions {
  activation: 'push' | 'pull'; sectors?: number; deadzone?: number; hysteresis?: number;
  sticky?: boolean; cancel?: CancelGesture; ownership?: Ownership;
  enter?: number; leave?: number; holdMs?: number; releaseMs?: number;
}
export const recipes = Object.freeze({
  directionSelection({ activation, sectors = 8, deadzone = .12, hysteresis = .08, sticky = true, ...options }: DirectionSelectionOptions) {
    return control.interaction({ activation, value: control.continuous('tilt', { as: 'direction', sectors, deadzone, hysteresis, sticky }), requireValue: true, ...options });
  },
  heldValue(activation: Activation, value: 'twist' | 'tilt' | 'slide', options: { speed?: number; ownership?: Ownership } = {}) {
    return control.interaction({ activation, value: control.continuous(value, { as: 'velocity', speed: options.speed ?? (value === 'twist' ? 1 : 2) }), ownership: options.ownership });
  },
  panZoom(options: { panSpeed?: number; zoomSpeed?: number; panDeadzone?: number; zoomDeadzone?: number; responseMs?: number; zoomInput?: 'twist' | 'press' } = {}) {
    const o = { ...motionDefaults, ...options };
    return {
      pan: control.continuous('slide', { as: 'velocity', speed: o.panSpeed, deadzone: o.panDeadzone, responseMs: o.responseMs, scale: { x: -1, y: -1 } }),
      zoom: control.continuous(options.zoomInput === 'press' ? 'pressure' : 'twist', { as: 'velocity', speed: o.zoomSpeed, deadzone: o.zoomDeadzone, responseMs: o.responseMs }),
    };
  },
  sixAxis(options: { translationSpeed?: number; rotationSpeed?: number; panDeadzone?: number; rotationDeadzone?: number; responseMs?: number } = {}) {
    const o = { ...motionDefaults, ...options };
    return {
      translation: control.continuous('translation', { as: 'velocity', speed: o.translationSpeed, deadzone: o.panDeadzone, responseMs: o.responseMs, scale: { x: -1, y: -1 } }),
      rotation: control.continuous('rotation', { as: 'velocity', speed: o.rotationSpeed, deadzone: o.rotationDeadzone, responseMs: o.responseMs }),
    };
  },
});
