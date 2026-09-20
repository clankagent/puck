import { createGestureTune, defaultGestureTune } from '../../dist/index.js';
// Lab and library defaults enable every gesture family.
export const labModes = Object.freeze({pressMode:'auto',standaloneTilt:true});
export function presetOptions(tune, previous=labModes) {
 return {...tune.toOptions(),pressMode:previous.pressMode??'auto',standaloneTilt:previous.standaloneTilt??true};
}
export function applyFamilyTune(current, learned, family, options) {
 const base=current.toJSON(), next=learned.toJSON();
 const data=family==='standalone'?{...base,standaloneTilt:next.standaloneTilt}:family==='combined'?{...base,pressTilt:next.pressTilt}:{...base,rotation:next.rotation,push:next.push,pull:next.pull,timing:next.timing,dominance:next.dominance};
 const tune=createGestureTune(data);
 return {tune,options:{...options,...tune.toOptions(),...(family==='combined'?{pressMode:options.pressMode==='tilt'?'tilt':'auto'}:{}),...(family==='standalone'?{standaloneTilt:true}:{})}};
}
