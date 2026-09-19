import test from 'node:test';
import assert from 'node:assert/strict';
import {presetOptions,applyFamilyTune} from '../examples/gestures/settings.js';
import {defaultGestureTune,gesturePresets,createGestures,neutralInput} from '../dist/index.js';
test('lab starts with tilt families on and preserves intentional modes across presets and calibration',()=>{
 const options=presetOptions(defaultGestureTune);assert.equal(options.pressMode,'auto');assert.equal(options.standaloneTilt,true);
 const changed=presetOptions(gesturePresets.soft,options);assert.equal(changed.pressMode,'auto');assert.equal(changed.standaloneTilt,true);
 const off=presetOptions(gesturePresets.hard,{pressMode:'simple',standaloneTilt:false});assert.equal(off.pressMode,'simple');assert.equal(off.standaloneTilt,false);
 const combined=applyFamilyTune(defaultGestureTune,gesturePresets.soft,'combined',options);
 const standalone=applyFamilyTune(combined.tune,gesturePresets.hard,'standalone',combined.options);
 assert.deepEqual(standalone.tune.pressTilt,combined.tune.pressTilt);assert.equal(standalone.options.pressMode,'auto');assert.equal(standalone.options.standaloneTilt,true);
 assert.equal(createGestures().state.phase,'blocked');assert.equal(defaultGestureTune.toOptions().standaloneTilt,undefined);
});
test('lab defaults deliver plain lift, standalone tilt and lift-plus-tilt results',()=>{
 for(const [input,tilt,expected] of [[{z:-.4},null,['pull',undefined]],[{rx:.5},null,['rx+',undefined]],[{z:-.4},{z:-.2,rx:.5},['pull','rx+']]]){
  const g=createGestures(presetOptions(defaultGestureTune));let events=[];
  events.push(...g.update(neutralInput,0),...g.update({...neutralInput,...input},100));
  if(tilt)events.push(...g.update({...neutralInput,...tilt},180));
  events.push(...g.update(neutralInput,300),...g.advance(1000));
  assert.deepEqual(events.map(e=>[e.direction,e.tilt]),[expected]);
 }
});
