import test from 'node:test';
import assert from 'node:assert/strict';
import { control, createPuck, recipes, neutralInput, replayPuck, EventOverflowError } from '../dist/index.js';
import { gestures, sequence } from '../examples/playground/model.js';
import { createControlGraph } from '../dist/graph.js';
const input = axes => ({ ...neutralInput, ...axes });
function setup(controls, options = {}) {
  const p = createPuck({ controls, clock: () => 0, ...options }), events = p.events();
  p.feed(neutralInput, 0);
  return { p, events, feed: (t, axes = {}) => p.feed(input(axes), t) };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('continuous read has typed physical shapes; isolated instances and immutable handles', () => {
  const c = { slide: control.continuous('slide', { deadzone: 0 }), axes: control.continuous('axes', { deadzone: 0 }) };
  const a = setup(c), b = setup(c); a.feed(10, { x: .4, z: -.6 });
  assert.deepEqual(a.p.read(c.slide), [.4, 0]); assert.deepEqual(b.p.read(c.slide), [0, 0]);
  assert.equal(a.p.read(c.axes).z, -.6); assert.ok(Object.isFrozen(c.slide));
  assert.throws(() => a.p.read(control.continuous('slide')), /registered/);
  assert.throws(() => createPuck({ controls: { a: c.slide, b: c.slide } }), /twice/);
});
test('velocity integrates report boundaries and immutable frame results', () => {
  const move = control.continuous('slide', { as: 'velocity', speed: 2, deadzone: 0, responseMs: 0 });
  const { p, feed } = setup({ move }); p.frame(0); feed(10, { x: 1 }); feed(15); const f = p.frame(20);
  assert.deepEqual(p.read(move), [0, 0]); close(f.integrate(move)[0], .01);
  assert.equal(f.integrate(move), f.integrate(move)); assert.deepEqual(p.frame(20).integrate(move), [0, 0]);
});
test('motion before interruption contributes only through its timestamp, with fresh-neutral rearm', () => {
  const move = control.continuous('pressure', { as: 'velocity', speed: 1, deadzone: 0, responseMs: 0 });
  const { p, feed } = setup({ move }); p.frame(0); feed(10, { z: 1 }); p.interrupt('blur', 15);
  close(p.frame(20).integrate(move), .005); p.advance(30); feed(40, { z: 1 }); assert.equal(p.read(move), 0);
  feed(50); feed(60, { z: 1 }); assert.equal(p.read(move), 1);
});
test('all six axes, separate speed units, neutral stop, frame caps and rate independence', () => {
  for (const hz of [30, 60, 144]) {
    const c = control.continuous('axes', { as: 'velocity', speed: { translation: 2, rotation: 3 }, deadzone: 0, responseMs: 0 });
    const { p, feed } = setup({ c }); feed(0, { x: 1, y: 1, z: 1, rx: 1, ry: 1, rz: 1 }); p.frame(0);
    let total = 0; for (let i = 1; i <= hz; i++) total += p.frame(i * 1000 / hz).integrate(c).x;
    close(total, 2); close(p.read(c).rz, 3);
    feed(1000); assert.equal(p.read(c).rz, 0);
  }
  const c = control.continuous('pressure', { as: 'velocity', speed: 1, deadzone: 0, responseMs: 0 });
  const { p, feed } = setup({ c }); feed(0, { z: 1 }); p.frame(0); close(p.frame(1000).integrate(c), .05);
});
test('single and double controls reuse recognition; cursor and subscription see same occurrences', () => {
  const c = { single: control.gesture('push'), double: control.gesture('push', { count: 2 }) };
  const { p, feed, events } = setup(c), received = []; p.on(c.double, e => received.push(e));
  feed(50, { z: .8 }); feed(150); feed(250, { z: .8 }); feed(350); p.advance(900);
  const result = events.drain(); assert.equal(result.length, 1); assert.equal(result[0].control, c.double); assert.equal(result[0], received[0]);
});
for (const activation of ['push', 'pull']) {
  const z = activation === 'push' ? .8 : -.8;
  test(`${activation}: immediate begin, changing vector, release qualification, exactly one commit`, () => {
    const c = control.interaction({ activation, value: 'tilt' }); const { p, feed, events } = setup({ c });
    feed(10, { z }); feed(20, { z, rx: .8 }); feed(30, { z, ry: .7 });
    feed(40, { ry: .7 }); p.advance(64); assert.equal(p.read(c).status, 'active'); p.advance(65);
    const all = events.drain(); assert.deepEqual(all.map(e => e.type), ['begin', 'update', 'update', 'commit']);
    assert.equal(all.at(-1).timestamp, 65); assert.equal(p.read(c).status, 'inactive');
    p.advance(500); assert.equal(events.drain().length, 0);
  });
  test(`${activation}: sticky selection resets per session, supports diagonals and no-selection cancellation`, () => {
    const c = recipes.directionSelection({ activation }); const { p, feed, events } = setup({ c });
    feed(10, { z }); assert.equal(p.read(c).value, null); feed(20, { z, rx: .8, ry: .8 }); assert.equal(p.read(c).value, 3);
    feed(30, { z }); assert.equal(p.read(c).value, 3); feed(40); p.advance(65); assert.equal(events.drain().at(-1).value, 3);
    feed(80); feed(90, { z }); assert.equal(p.read(c).value, null); feed(100); p.advance(125);
    assert.equal(events.drain().at(-1).reason, 'no-selection');
  });
  test(`${activation}: single twist cancel suppresses subsequent release`, () => {
    const c = recipes.directionSelection({ activation, cancel: { input: 'twist', direction: 'either' } }); const { p, feed, events } = setup({ c });
    feed(10, { z }); feed(20, { z, rz: .8, rx: .6 }); feed(100, { z }); p.advance(125); feed(150); p.advance(900);
    const all = events.drain(); assert.equal(all.filter(e => e.type === 'cancel').length, 1); assert.equal(all.at(-1).reason, 'gesture'); assert.ok(!all.some(e => e.type === 'commit'));
  });
  test(`${activation}: same-direction double cancel works while pressure remains held`, () => {
    const c = control.interaction({ activation, value: 'tilt', cancel: { input: 'twist', direction: 'same', count: 2 } }); const { p, feed, events } = setup({ c });
    feed(10, { z }); feed(30, { z, rz: -.8 }); feed(100, { z }); p.advance(130);
    assert.equal(p.read(c).status, 'active'); feed(180, { z, rz: -.8 }); feed(250, { z }); p.advance(280);
    assert.equal(events.drain().at(-1).reason, 'gesture');
  });
  test(`${activation}: long holds survive report silence; cancellation on interruption never commits`, () => {
    const c = control.interaction({ activation, value: 'twist', holdMs: 250 }); const { p, feed, events } = setup({ c });
    feed(10, { z, rz: .7 }); p.advance(259); assert.equal(p.read(c).status, 'inactive'); p.advance(260); assert.equal(p.read(c).status, 'active');
    p.advance(100000); p.interrupt('disconnect', 100010); const all = events.drain(); assert.deepEqual(all.map(e => e.type), ['begin', 'cancel']);
    feed(100020, { z }); assert.equal(p.read(c).status, 'inactive'); feed(100030); feed(100040, { z }); p.advance(100290); assert.equal(p.read(c).status, 'active');
  });
}
test('opposite pressure menus can coexist but reversal cannot open the other until neutral', () => {
  const c = { a: recipes.directionSelection({ activation: 'pull' }), b: recipes.directionSelection({ activation: 'push' }) };
  const { p, feed, events } = setup(c); feed(10, { z: -.8, rx: .5 }); feed(20, { z: .8, rx: .5 });
  assert.equal(p.read(c.b).status, 'inactive'); assert.equal(events.drain().at(-1).reason, 'reversal');
  feed(30); feed(40, { z: .8 }); assert.equal(p.read(c.b).status, 'active');
});
test('ownership is explicit; capturing cancels pending commands and motion requires neutral rearm', () => {
  const c = { motion: control.continuous('axes', { as: 'velocity', responseMs: 0 }), command: control.gesture('pull'), choose: recipes.directionSelection({ activation: 'pull', ownership: { mode: 'exclusive', channels: 'all' } }) };
  assert.throws(() => createPuck({ controls: c }), /conflict/);
  const { p, feed, events } = setup(c, { conflicts: [{ prefer: c.choose, over: [c.motion, c.command] }] });
  feed(10, { z: -.8, rx: .8, x: .8 }); assert.equal(p.read(c.motion).x, 0); feed(20, { x: .8 }); p.advance(45);
  assert.equal(p.read(c.motion).x, 0); feed(60); feed(70, { x: .8 }); assert.ok(p.read(c.motion).x > 0); p.advance(1000);
  assert.ok(events.drain().every(e => e.control !== c.command));
});
test('contexts preserve handles and terminal reasons; settings are portable and changes cancel', () => {
  const a = control.interaction({ activation: 'push', value: 'tilt' }), b = control.interaction({ activation: 'push', value: 'twist' });
  const { p, feed, events } = setup({}, { contexts: { a: { a }, b: { b } }, context: 'a' });
  feed(10, { z: .8 }); p.setContext('b', 20); assert.equal(events.drain().at(-1).reason, 'context-change');
  assert.equal(p.read(b).status, 'inactive'); feed(30); feed(40, { z: .8 }); assert.equal(p.read(b).status, 'active');
  p.configure(b, { enter: .4 }, 50); assert.equal(events.drain().at(-1).reason, 'configuration-change');
  const saved = JSON.parse(JSON.stringify(p.settings())); p.restoreSettings(saved, 60); assert.equal(p.settings().controls['contexts.b.b'].enter, .4);
});
test('independent cursors, bounded retention, unsubscribe, callbacks and disposal', () => {
  const c = control.interaction({ activation: 'push', value: 'tilt' }); const { p, feed, events } = setup({ c }, { eventLimit: 2 });
  const other = p.events(), seen = []; const off = p.on(c, e => seen.push(e));
  feed(10, { z: .8 }); assert.equal(other.drain()[0].type, 'begin'); feed(20, { z: .8, rx: .5 }); feed(30); p.advance(55);
  assert.throws(() => events.drain(), EventOverflowError); assert.equal(events.drain().length, 2); assert.equal(other.drain().length, 2); assert.equal(seen.length, 3);
  off(); p.dispose(60); assert.throws(() => p.read(c), /disposed/);
});
test('record/replay includes frames, configuration, context and interruption with bounded trace', () => {
  const c = { choose: recipes.directionSelection({ activation: 'pull' }), move: control.continuous('slide', { as: 'velocity', speed: 2, responseMs: 0 }) };
  const { p, feed, events } = setup(c, { record: true, trace: true }); p.frame(0); feed(10, { z: -.8, rx: .5 }); feed(20); p.advance(45);
  p.configure(c.move, { speed: 4 }, 50); feed(60); feed(70, { x: 1 }); const frame = p.frame(80); p.interrupt('blur', 90);
  const original = events.drain(), r = replayPuck(JSON.parse(JSON.stringify(p.recording())));
  assert.deepEqual(r.events.map(({ control, ...e }) => e), original.map(({ control, ...e }) => e));
  assert.deepEqual(r.frames.at(-1).integrate(r.controls.move), frame.integrate(c.move)); assert.equal(p.explain(original[0]).status, 'retained');
});
test('invalid input, timestamps, unknown sources, cycles and structural settings fail clearly', () => {
  assert.throws(() => control.continuous('constructor'), /Unknown/); assert.throws(() => control.continuous('tilt', { speed: NaN }), /speed/);
  const a = control.interaction({ activation: 'push', value: 'tilt' }), b = control.gesture('push');
  assert.throws(() => createPuck({ controls: { a, b }, conflicts: [{ prefer: a, over: [b] }, { prefer: b, over: [a] }] }), /Cyclic/);
  const { p, feed } = setup({ a }); assert.throws(() => p.feed({ z: 1 }, 0), /six/); feed(10); assert.throws(() => feed(9), /monotonic/);
  assert.throws(() => p.configure(a, { activation: 'pull' }, 11), /Structural/);
});
test('an interruption at a release deadline cancels before committing', () => {
  const c = control.interaction({ activation: 'pull', value: 'tilt' }); const { p, feed, events } = setup({ c });
  feed(10, { z: -.8 }); feed(20); p.interrupt('blur', 45); assert.deepEqual(events.drain().map(e => e.type), ['begin', 'cancel']);
});
test('all 28 discrete catalog outcomes remain available through typed control declarations', () => {
  for (const g of gestures.filter(g => g.kind !== 'holdstart')) {
    const short = d => d === 'clockwise' ? 'cw' : d === 'counterclockwise' ? 'ccw' : d;
    const input = g.rotation ? { pressure:g.direction,twist:short(g.rotation) } : g.tilt ? { pressure:g.direction,tilt:g.tilt } : short(g.direction);
    const c = control.gesture(input,{count:g.kind==='double'?2:1}), {p,events} = setup({c});
    for(const row of sequence(g))p.feed(row.input,row.t);
    p.advance(1200);const found=events.drain();assert.equal(found.length,1,JSON.stringify(g));assert.equal(found[0].gesture.kind,g.kind);
  }
});
test('pair-held policy releases on value neutral; activation-held policy permits value neutral and reversal', () => {
  for(const activation of ['push','pull'])for(const lifetime of ['activation','combination']) {
    const c=control.interaction({activation,value:'twist',lifetime,releaseMs:0}),{p,feed,events}=setup({c}),z=activation==='push'?.8:-.8;
    feed(10,{z});assert.equal(p.read(c).status,lifetime==='activation'?'active':'inactive');feed(20,{z,rz:.8});assert.equal(p.read(c).status,'active');
    feed(30,{z});assert.equal(p.read(c).status,lifetime==='activation'?'active':'inactive');
    if(lifetime==='activation'){feed(40,{z,rz:-.8});assert.ok(p.read(c).value<0);}
    assert.equal(events.drain().filter(e=>e.type==='begin').length,1);
  }
});
test('selection freezes the candidate on release, rejects stale cancel evidence and survives chatter',()=>{
  const c=recipes.directionSelection({activation:'pull',cancel:{input:'twist',count:2,direction:'same'}}),{p,feed,events}=setup({c});
  feed(10,{rz:.8});feed(80);p.advance(110);feed(120,{z:-.8});feed(140,{z:-.8,rx:.8});feed(160,{z:-.8,rx:.8,rz:.8});feed(220,{z:-.8,rx:.8});p.advance(250);assert.equal(p.read(c).status,'active');
  feed(260,{ry:.8});feed(270,{z:-.8,rx:.8});assert.equal(p.read(c).status,'active');feed(280,{ry:.8});p.advance(305);assert.equal(events.drain().at(-1).value,2);
});
test('speed changes apply during movement; rate smoothing has an analytic frame-independent integral',()=>{
  const c=control.continuous('pressure',{as:'velocity',speed:2,deadzone:0,responseMs:25}),{p,feed}=setup({c});feed(0,{z:1});p.frame(0);
  close(p.frame(20).integrate(c),2*(20-25*(1-Math.exp(-20/25)))/1000);
  p.configure(c,{speed:4,responseMs:0},20);close(p.read(c),4);close(p.frame(40).integrate(c),.08);
});
test('settings validation is atomic; unknown options and structural nested changes are rejected',()=>{
  const a=control.continuous('slide'),b=control.interaction({activation:'pull',value:'tilt'}),{p}=setup({a,b});
  assert.throws(()=>control.continuous('slide',{speeed:2}),/option/);assert.throws(()=>control.gesture('push',{bogus:1}),/option/);
  assert.throws(()=>p.configure(b,{valueOptions:{as:'velocity'}},1),/option/);
  const saved=JSON.parse(JSON.stringify(p.settings()));saved.controls['controls.a'].deadzone=.2;saved.controls['controls.b'].enter=-1;
  assert.throws(()=>p.restoreSettings(saved,1),/enter/);assert.equal(p.settings().controls['controls.a'].deadzone,.05);
});
test('callbacks can cancel safely after the current batch; errors do not steal other subscribers',()=>{
  const c=control.interaction({activation:'pull',value:'tilt'}),errors=[],{p,feed,events}=setup({c},{clock:()=>10,onError:e=>errors.push(e)}),seen=[];
  p.on(c,e=>{if(e.type==='begin'){p.cancel(c,10);throw Error('consumer');}});p.on(c,e=>seen.push(e.type));feed(10,{z:-.8});
  assert.deepEqual(seen,['begin','cancel']);assert.deepEqual(events.drain().map(e=>e.type),seen);assert.equal(errors.length,1);
});
test('renderer-neutral graphs expose axes, events, settings changes and actual integrated movement',()=>{
  const c={move:control.continuous('slide',{as:'velocity',responseMs:0}),choose:recipes.directionSelection({activation:'push'})},{p,feed}=setup(c,{record:true});
  p.frame(0);feed(10,{x:1,z:.8,rx:.8});feed(20);p.advance(45);p.frame(50);
  const graph=createControlGraph(p.recording());assert.equal(graph.axes.length,6);assert.equal(graph.events.at(-1).type,'commit');assert.ok(graph.movement[0].intervals.at(-1).delta[0]>0);
});
test('queued tuning patches compose; disposal from a subscriber delivers one cancellation',()=>{
  const c={move:control.continuous('slide',{as:'velocity'}),hold:control.interaction({activation:'pull',value:'tilt'})},{p,feed}=setup(c,{clock:()=>10}),seen=[];
  p.on(c.hold,e=>{seen.push(e.type);if(e.type==='begin'){p.configure(c.move,{speed:3},10);p.configure(c.move,{responseMs:0},10);}});
  feed(10,{z:-.8});assert.equal(p.settings().controls['controls.move'].speed,3);assert.equal(p.settings().controls['controls.move'].responseMs,0);
  p.on(c.hold,e=>{if(e.type==='update')p.dispose(20);});feed(20,{z:-.8,rx:.8});assert.deepEqual(seen,['begin','update','cancel']);assert.throws(()=>p.read(c.hold),/disposed/);
});

test('physical tilt directions map consistently through SDK values, rates and menu recipes; raw axes stay raw',()=>{
 const cases=[{name:'left',sample:{ry:.8},vector:[-.8,0],sector:4},{name:'right',sample:{ry:-.8},vector:[.8,0],sector:0},{name:'up',sample:{rx:-.8},vector:[0,-.8],sector:6},{name:'down',sample:{rx:.8},vector:[0,.8],sector:2}];
 for(const row of cases){
  const c={tilt:control.continuous('tilt',{deadzone:0}),rate:control.continuous('tilt',{as:'velocity',deadzone:0,responseMs:0}),direction:control.continuous('tilt',{as:'direction',deadzone:0}),raw:control.continuous('axes',{deadzone:0}),rotation:control.continuous('rotation',{deadzone:0})};
  const {p,feed}=setup(c);feed(10,row.sample);assert.deepEqual(p.read(c.tilt),row.vector,row.name);assert.deepEqual(p.read(c.rate),row.vector,row.name);assert.equal(p.read(c.direction),row.sector,row.name);assert.equal(p.read(c.raw).rx,row.sample.rx??0);assert.equal(p.read(c.raw).ry,row.sample.ry??0);assert.deepEqual(p.read(c.rotation),[row.sample.rx??0,row.sample.ry??0,0]);p.frame(10);const delta=p.frame(30).integrate(c.rate);delta.forEach((v,i)=>close(v,row.vector[i]*.02));
  for(const activation of ['push','pull']){const menu=recipes.directionSelection({activation});const x=setup({menu});x.feed(10,{z:activation==='push'?.8:-.8});x.feed(20,{z:activation==='push'?.8:-.8,...row.sample});assert.equal(x.p.read(menu).value,row.sector,row.name);x.feed(30);x.p.advance(60);assert.equal(x.events.drain().at(-1).value,row.sector);}
 }
});

test('cancel diagnostics expose a twist awaiting return to neutral; cancellation never commits afterward',()=>{
 const menu=recipes.directionSelection({activation:'pull',cancel:{input:'twist'}}),{p,feed,events}=setup({menu});
 feed(10,{z:-.8});feed(30,{z:-.8,ry:.5,rz:.7});assert.equal(p.inspect(menu).controls[0].cancellation.phase,'active');feed(110,{z:-.8,ry:.5});p.advance(150);assert.equal(events.drain().at(-1).reason,'gesture');feed(180);p.advance(600);assert.equal(events.drain().length,0);
});

test('2D palette owns twist without stealing pan; a context change cancels without applying',()=>{
 const panzoom=recipes.panZoom({responseMs:0});const menu=recipes.directionSelection({activation:'pull',cancel:{input:'twist'},ownership:{mode:'exclusive',channels:['z','rx','ry','rz']}});
 const p=createPuck({controls:panzoom,contexts:{view:{},edit:{menu}},context:'edit',conflicts:[{prefer:menu,over:Object.values(panzoom)}],clock:()=>0});const events=p.events();p.feed(neutralInput,0);p.feed(input({z:-.8,ry:.6,x:.5,rz:.2}),20);assert.notEqual(p.read(panzoom.pan)[0],0);assert.equal(p.read(panzoom.zoom),0);assert.equal(p.read(menu).value,4);p.setContext('view',30);assert.equal(events.drain().at(-1).reason,'context-change');p.feed(neutralInput,40);p.feed(input({z:-.8,rz:.6}),50);assert.equal(p.read(menu).status,'inactive');assert.notEqual(p.read(panzoom.zoom),0);
});

test('a modal 2D palette locks pan and zoom until neutral rearming, for push and pull',()=>{
 for(const activation of ['push','pull']){
  const panzoom=recipes.panZoom({responseMs:0});const menu=recipes.directionSelection({activation,ownership:{mode:'exclusive',channels:'all'}});
  const p=createPuck({controls:{...panzoom,menu},conflicts:[{prefer:menu,over:Object.values(panzoom)}],clock:()=>0});const events=p.events();
  p.feed(neutralInput,0);p.frame(0);p.feed(input({z:activation==='pull'?-.8:.8,rx:-.6,x:.4,y:.3,rz:.2}),20);
  assert.deepEqual(p.read(panzoom.pan),[0,0]);assert.equal(p.read(panzoom.zoom),0);assert.deepEqual(p.frame(40).integrate(panzoom.pan),[0,0]);
  p.cancel(menu,50);assert.equal(events.drain().at(-1).type,'cancel');
  p.feed(neutralInput,60);p.feed(input({x:.4,rz:.5}),80);assert.notEqual(p.read(panzoom.pan)[0],0);assert.notEqual(p.read(panzoom.zoom),0);
 }
});
