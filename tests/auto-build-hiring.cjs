const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const startup = script.lastIndexOf("start(parseRows(examples[");
assert.ok(startup > 0);

function planner(records, minimum) {
  const elements = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
      return elements.get(id);
    }
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, performance, setTimeout, records, minimum });
  const run = source => vm.runInContext(source, context);
  run(script.slice(0, startup));
  run(`data = {records, units: Object.fromEntries(records.map(r => [r.unit, {district: '1'}]))};
       state = {rules: rulesFor(data), log: [], locks: [], skip: [], pass: 2, minimum};
       draw = () => { result = suggestions(data, state); };
       note = message => { if (message.startsWith('Auto-build stopped')) throw Error(message); };
       draw();`);
  return run;
}

function member(id, unit, rank, letters, code = 'REG') {
  return { id, name: id, unit, rank, qual: [...letters], code, start: 0, end: 1440 };
}

const rescues = [
  member('assigned medic', 'Rescue 1', 'FF', 'M'),
  member('assigned EMT', 'Rescue 12', 'FF', ''),
  member('rover', 'Eng Rovers', 'Eng', 'M'),
  member('absent driver', 'Rescue 12', 'Eng', '', 'KD')
];
const r12 = { u: 'Rescue 12', key: 'seats', start: 0, end: 1440 };

test('relocate an automatic hire after review and keep both crews in station', async () => {
  const run = planner(rescues, 4);
  run('state.hireMarks = ' + JSON.stringify([{ ...r12, source: 'auto' }]));
  await run('buildPlan()');
  assert.equal(run('autoRun.plan.length'), 1);
  assert.equal(run('autoRun.plan[0].legs[0].to'), 'Rescue 12');
  assert.equal(run('state.hireMarks[0].u'), 'Rescue 12');
  run("approvePlan(); $('approvalYes').onclick()");
  assert.equal(run('state.hireMarks[0].u'), 'Rescue 1');
  assert.equal(run('state.hireMarks[0].source'), 'auto');
  await run('buildPlan()');
  run("approvePlan(); $('approvalYes').onclick()");
  assert.equal(run('state.hireMarks.length'), 1);
  run('commitHireMark(0)');
  assert.equal(run('state.hireMarks[0].source'), 'chief');
});

test('preserve both explicit and older untagged hiring holds', async () => {
  for (const mark of [r12, { ...r12, source: 'chief' }]) {
    const run = planner(rescues, 4);
    run('state.hireMarks = ' + JSON.stringify([mark]));
    await run('buildPlan()');
    assert.equal(run("autoRun.plan.flatMap(p => p.legs).some(l => l.to === 'Rescue 12' && l.role === 'Eng')"), false);
    assert.equal(run("autoRun.balance.seats.some(s => s.unit === 'Rescue 12' && s.role === 'Eng' && s.held)"), true);
  }
});

test('trade ride-up waits for confirmation of the imported rank', async () => {
  for (const code of ['STW', 'KSON']) {
    const run = planner([
      member('firefighter', 'Engine 2', 'FF', 'M'),
      member('driver', 'Engine 2', 'Eng', ''),
      member('trade', 'Eng Rovers', 'Eng', 'MP', code)
    ], 3);
    run("state.rules['Engine 2'].min = 3");
    await run('buildPlan()');
    assert.ok(run('autoRun.rankReviews.size'));
    assert.equal(run("autoRun.plan.flatMap(p => p.legs).some(l => l.id === 'trade' && l.rideUp)"), false);
    run("setRank('trade', 'Eng')");
    await run('buildPlan()');
    assert.equal(run("autoRun.plan.flatMap(p => p.legs).some(l => l.id === 'trade' && l.role === 'Lt')"), true);
  }
});

test('an extra qualified Engineer can cover another tower without taking its assigned driver', async () => {
  const run = planner([
    member('officer one', 'Tower 1', 'Lt', 'LM'),
    member('driver one', 'Tower 1', 'Eng', 'LT'),
    member('extra engineer', 'Tower 1', 'Eng', 'LT'),
    member('officer eight', 'Tower 8', 'Lt', 'LM'),
    member('relief FF', 'Tower 8', 'FF', 'LTP')
  ], 5);
  run("for (const r of Object.values(state.rules)) { r.min=2; r.team='' }");
  await run('buildPlan()');
  assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.from==='Tower 1' && l.to==='Tower 8' && l.role==='Eng' && !l.rideUp))"));
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='relief FF' && l.rideUp))"), false);
});

test('an Engineer without tower driver qualifications does not block a qualified FF from driving', async () => {
  const run = planner([
    member('rover', 'DIV1 Rovers', 'Eng', 'E'),
    member('officer', 'Tower 8', 'Lt', 'LM'),
    member('relief FF', 'Tower 8', 'FF', 'LT')
  ], 3);
  run("state.rules['Tower 8'].min=2;state.rules['Tower 8'].team=''");
  await run('buildPlan()');
  assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='relief FF' && l.rideUp))"));
});

test('keep an eligible rover out of a second driver position when a different tower needs a driver', () => {
  const run = planner([
    member('officer one', 'Tower 1', 'Lt', 'LM'), member('driver one', 'Tower 1', 'Eng', 'LT'),
    member('relief medic', 'Tower 1', 'FF', 'ELM'), member('rover', 'DIV1 Rovers', 'Eng', 'LT'),
    member('EMT', 'Rescue 1', 'FF', ''), member('officer eight', 'Tower 8', 'Lt', 'LM')
  ], 6);
  run("for(const rule of Object.values(state.rules)) rule.team='';state.rules['Tower 1'].min=3;state.rules['Tower 8'].min=2");
  run(`const sim={...state,pass:3,preferEngineers:true};
       const snap=exchangeSnapshot(data,sim,result,0);
       const linked=[{id:'relief medic',from:'Tower 1',to:'Rescue 1',role:'Eng',rideUp:true},
                     {id:'rover',from:'DIV1 Rovers',to:'Tower 1',role:'Eng'}];`);
  assert.ok(run("exchangeCheck(snap,{...sim,preferEngineers:false},'Rescue 1',linked,'driver')"));
  assert.equal(run("exchangeCheck(snap,sim,'Rescue 1',linked,'driver')"),null);
});

test('reserve overtime in rank order before riding members up', async () => {
  const run=planner([
    member('driver','Engine 2','Eng','M'),member('relief','Engine 2','FF','EP'),
    member('officer','Engine 3','Lt','M'),member('second relief','Engine 3','FF','EP'),
    member('officer four','Engine 4','Lt','M'),member('driver four','Engine 4','Eng','')
  ],9);
  run("for(const rule of Object.values(state.rules))rule.min=3");
  await run('buildPlan()');
  assert.equal(run("autoRun.plan.flatMap(p=>p.legs).filter(l=>l.rideUp).length"),0);
  assert.equal(run("autoRun.marks.map(m=>m.roles[0]).join(',')"),'Lt,Eng,FF');
});

test('allow a necessary ride-up after a partial-shift OT shortage ends', async () => {
  const run=planner([
    member('officer','Engine 3','Lt','M'),member('relief','Engine 3','FF','EP'),
    {...member('extra','DIV1 Rovers','FF',''),start:720}
  ],3);
  run("state.rules['Engine 3'].min=3");
  await run('buildPlan()');
  assert.ok(run("autoRun.marks.some(m=>m.roles[0]==='Eng'&&m.start===0&&m.end===720)"));
  assert.ok(run("autoRun.plan.flatMap(p=>p.legs).some(l=>l.id==='relief'&&l.rideUp&&l.start===720&&l.end===1440)"));
});
