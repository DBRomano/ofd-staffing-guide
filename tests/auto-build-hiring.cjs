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

test('Auto-Build proposes no hires and approving clears earlier automatic ones', async () => {
  const run = planner(rescues, 4);
  run('state.hireMarks = ' + JSON.stringify([{ ...r12, source: 'auto' }]));
  await run('buildPlan()');
  assert.equal(run('autoRun.plan.length'), 1);
  assert.equal(run('autoRun.plan[0].legs[0].to'), 'Rescue 12');
  assert.equal(run('autoRun.marks.length'), 0);
  run("approvePlan(); $('approvalYes').onclick()");
  assert.equal(run('(state.hireMarks || []).length'), 0);
  run('state.hireMarks = ' + JSON.stringify([{ ...r12, source: 'auto' }]));
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

test('an assigned Engineer stays on their unit; a firefighter who can drive is counted and the seat left open', async () => {
  const run = planner([
    member('officer one', 'Tower 1', 'Lt', 'LM'),
    member('driver one', 'Tower 1', 'Eng', 'LT'),
    member('extra engineer', 'Tower 1', 'Eng', 'LT'),
    member('officer eight', 'Tower 8', 'Lt', 'LM'),
    member('relief FF', 'Tower 8', 'FF', 'LTP')
  ], 5);
  run("for (const r of Object.values(state.rules)) { r.min=2; r.team='' }");
  await run('buildPlan()');
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.from==='Tower 1' && l.to!=='Tower 1'))"), false);
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.rideUp))"), false);
  assert.ok(run("autoRun.remaining.some(x=>x.u==='Tower 8' && x.key==='driver' && x.ffDrives)"));
});

test('an Engineer without tower driver qualifications is not sent to a tower a firefighter can drive', async () => {
  const run = planner([
    member('rover', 'DIV1 Rovers', 'Eng', 'E'),
    member('officer', 'Tower 8', 'Lt', 'LM'),
    member('relief FF', 'Tower 8', 'FF', 'LT')
  ], 3);
  run("state.rules['Tower 8'].min=2;state.rules['Tower 8'].team=''");
  await run('buildPlan()');
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.to==='Tower 8'))"), false);
  assert.ok(run("autoRun.remaining.some(x=>x.u==='Tower 8' && x.key==='driver' && x.ffDrives)"));
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

test('the Openings board renders in the full-shift view', () => {
  const run = planner(rescues, 4);
  run("tab = 'Openings'; fullShift = true;");
  assert.match(run('deskOpenings()'), /Openings/);
});

test('pruning drops a move the finished plan does not need and keeps one it does', () => {
  const crew = [
    member('officer', 'Engine 1', 'Lt', 'M'), member('driver', 'Engine 1', 'Eng', ''),
    member('ff one', 'Engine 1', 'FF', ''), member('ff two', 'Engine 1', 'FF', ''),
    member('rover', 'DIV1 Rovers', 'FF', 'E')
  ];
  const move = { need: { u: 'Engine 1', key: 'seats', n: 1, start: 0, end: 1440 },
    legs: [{ id: 'rover', name: 'rover', from: 'DIV1 Rovers', to: 'Engine 1', role: 'FF', start: 0, end: 1440 }] };
  const full = planner(crew, 4);
  assert.equal(full('prunePlan(' + JSON.stringify([move]) + ', state).length'), 0);
  const short = planner(crew.filter(m => m.id !== 'ff two'), 4);
  assert.equal(short('prunePlan(' + JSON.stringify([move]) + ', state).length'), 1);
});

test('an open-seat search stops at once when nobody is spare', () => {
  const run = planner([
    member('officer', 'Engine 1', 'Lt', 'M'), member('driver', 'Engine 1', 'Eng', ''),
    member('ff', 'Engine 1', 'FF', ''),
    member('officer 2', 'Engine 2', 'Lt', 'M'), member('driver 2', 'Engine 2', 'Eng', ''),
    member('ff 2a', 'Engine 2', 'FF', ''), member('ff 2b', 'Engine 2', 'FF', '')
  ], 8);
  assert.equal(run('spareAt(result, state, 0)'), false);
  assert.equal(run("needPlans(result, state, {u: 'Engine 1', key: 'seats', n: 1, start: 0, end: 1440}).length"), 0);
});

// Shift trades (STW) and Kelly swaps (KSON) may be placed where they fit best.
const tradeCrew = code => [
  member('officer one', 'Engine 1', 'Lt', 'M'), member('trade engineer', 'Engine 1', 'Eng', 'M', code),
  member('assigned engineer', 'Engine 1', 'Eng', ''), member('ff one', 'Engine 1', 'FF', ''),
  member('ff two', 'Engine 1', 'FF', ''),
  member('officer two', 'Engine 2', 'Lt', 'M'), member('ff three', 'Engine 2', 'FF', ''),
  member('ff four', 'Engine 2', 'FF', ''), member('ff five', 'Engine 2', 'FF', '')
];
const moved = id => `autoRun.plan.some(p=>p.legs.some(l=>l.id==='${id}' && l.from!==l.to))`;

test('a trade or Kelly swap Engineer with a confirmed rank moves to a unit that needs a driver', async () => {
  for (const code of ['STW', 'KSON']) {
    const run = planner(tradeCrew(code), 8);
    run("for (const r of Object.values(state.rules)) r.team=''; setRank('trade engineer', 'Eng')");
    await run('buildPlan()');
    assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='trade engineer' && l.to==='Engine 2' && l.role==='Eng'))"), code);
    assert.equal(run(moved('assigned engineer')), false, code);
  }
});

test('a trade Engineer whose rank is not confirmed is listed for review instead of moved', async () => {
  const run = planner(tradeCrew('STW'), 8);
  run("for (const r of Object.values(state.rules)) r.team=''");
  await run('buildPlan()');
  assert.equal(run(moved('trade engineer')), false);
  assert.equal(run(moved('assigned engineer')), false);
  assert.ok(run("[...autoRun.rankReviews.values()].some(l=>l.id==='trade engineer')"));
});

test('a trade or Kelly swap firefighter moves to a unit with an open seat', async () => {
  for (const code of ['STW', 'KSON']) {
    const run = planner([
      member('officer one', 'Engine 1', 'Lt', 'M'), member('driver one', 'Engine 1', 'Eng', ''),
      member('ff one', 'Engine 1', 'FF', ''), member('ff two', 'Engine 1', 'FF', ''),
      member('trade ff', 'Engine 1', 'FF', 'E', code),
      member('officer two', 'Engine 2', 'Lt', 'M'), member('driver two', 'Engine 2', 'Eng', ''),
      member('ff three', 'Engine 2', 'FF', '')
    ], 8);
    run("for (const r of Object.values(state.rules)) r.team=''");
    await run('buildPlan()');
    assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.to==='Engine 2' && l.from==='Engine 1'))"), code);
  }
});

test('on the October example no trade member takes an officer seat or rides up before their rank is confirmed', async () => {
  const run = planner([member('x', 'Engine 1', 'FF', '')], 141);
  run("data = parseRows(examples['3'].rows, examples['3'].date); state = {rules: rulesFor(data), log: [], locks: [], skip: [], pass: 2, minimum: 141}; draw();");
  await run('buildPlan()');
  const unconfirmed = `autoRun.plan.flatMap(p => p.legs.filter(l => awaitingRank({...p, legs: [l]}, result, state)).map(l => l.name))`;
  assert.equal(run('JSON.stringify(' + unconfirmed + ')'), '[]');
  assert.ok(run('autoRun.rankReviews.size'));
  run("for (const r of result.recs) if (swapKind(r)) setRank(r.id, rosterRank(r.id));");
  await run('buildPlan()');
  assert.ok(run("autoRun.plan.some(p => p.legs.some(l => l.id === '124' && l.role === 'Lt'))"));
});

test('a rover Engineer still fills an Engineer seat that a firefighter on the crew could drive', async () => {
  const run = planner([
    member('officer', 'Engine 2', 'Lt', 'M'), member('ff driver', 'Engine 2', 'FF', 'E'),
    member('ff', 'Engine 2', 'FF', ''), member('rover', 'Eng Rovers', 'Eng', 'E')
  ], 4);
  run("for (const r of Object.values(state.rules)) { r.min=4; r.team='' }");
  await run('buildPlan()');
  assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rover' && l.to==='Engine 2' && l.role==='Eng'))"));
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.rideUp))"), false);
});

test('an Engineer rides up to Lieutenant only when no Engineer seat is open for them', async () => {
  const needsLt = [member('driver', 'Engine 1', 'Eng', 'E'), member('ff a', 'Engine 1', 'FF', ''),
    member('ff b', 'Engine 1', 'FF', ''), member('rover', 'Eng Rovers', 'Eng', 'EM')];
  const needsDriver = [member('officer', 'Engine 2', 'Lt', 'M'), member('ff c', 'Engine 2', 'FF', ''),
    member('ff d', 'Engine 2', 'FF', '')];
  const both = planner([...needsLt, ...needsDriver], 7);
  both("for (const r of Object.values(state.rules)) { r.min=4; r.team='' }");
  await both('buildPlan()');
  assert.ok(both("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rover' && l.to==='Engine 2' && l.role==='Eng'))"));
  assert.equal(both("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rover' && l.role==='Lt'))"), false);
  const onlyLt = planner(needsLt, 4);
  onlyLt("for (const r of Object.values(state.rules)) { r.min=4; r.team='' }");
  await onlyLt('buildPlan()');
  assert.ok(onlyLt("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rover' && l.to==='Engine 1' && l.role==='Lt'))"));
});

test('a rover who starts part-way through the shift covers the rest of an opening', async () => {
  const run = planner([
    member('driver', 'Engine 8', 'Eng', 'M'), member('ff', 'Engine 8', 'FF', ''),
    { ...member('late rover', 'DIV1 Rovers', 'Lt', 'M'), start: 720, end: 1440 }
  ], 3);
  run("for (const r of Object.values(state.rules)) { r.min=3; r.team='' }");
  await run('buildPlan()');
  assert.ok(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='late rover' && l.to==='Engine 8' && l.role==='Lt' && l.start===720 && l.end===1440))"));
  assert.ok(run("autoRun.remaining.some(x=>x.u==='Engine 8' && x.key==='officer' && x.start===0 && x.end===720)"));
});

test("the Engineer driving a station's rescue moves to that station's engine when it needs an Engineer", async () => {
  const crew = [
    member('officer', 'Engine 6', 'Lt', 'M'), member('ff a', 'Engine 6', 'FF', 'E'), member('ff b', 'Engine 6', 'FF', ''),
    member('rescue engineer', 'Rescue 6', 'Eng', ''), member('rescue ff', 'Rescue 6', 'FF', 'EM')
  ];
  const station = (run, rescueStation) => run(`for (const r of Object.values(state.rules)) r.team=''; state.rules['Engine 6'].min=4; state.rules['Rescue 6'].min=2;
    data.units['Engine 6'].station='Station 6'; data.units['Rescue 6'].station='${rescueStation}'; draw();`);
  const same = planner(crew, 6);
  station(same, 'Station 6');
  await same('buildPlan()');
  assert.ok(same("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rescue engineer' && l.from==='Rescue 6' && l.to==='Engine 6' && l.role==='Eng'))"));
  assert.ok(same("autoRun.remaining.some(x=>x.u==='Rescue 6' && x.key==='seats')"));
  const other = planner(crew, 6);
  station(other, 'Station 9');
  await other('buildPlan()');
  assert.equal(other("autoRun.plan.some(p=>p.legs.some(l=>l.id==='rescue engineer' && l.from!==l.to))"), false);
});

test("an engine's Engineer is not moved to the station's rescue", async () => {
  const run = planner([
    member('officer', 'Engine 6', 'Lt', 'M'), member('engine engineer', 'Engine 6', 'Eng', ''),
    member('ff a', 'Engine 6', 'FF', ''), member('ff b', 'Engine 6', 'FF', ''), member('ff c', 'Engine 6', 'FF', ''),
    member('rescue ff', 'Rescue 6', 'FF', 'M')
  ], 6);
  run(`for (const r of Object.values(state.rules)) r.team=''; state.rules['Engine 6'].min=4; state.rules['Rescue 6'].min=2;
    data.units['Engine 6'].station='Station 6'; data.units['Rescue 6'].station='Station 6'; draw();`);
  await run('buildPlan()');
  assert.equal(run("autoRun.plan.some(p=>p.legs.some(l=>l.id==='engine engineer' && l.from!==l.to))"), false);
});
