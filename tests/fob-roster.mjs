import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFOB} from '../fob-roster.mjs';

const cell=(x,y,s)=>({x,y,s});
const header=cell(18,30,'City of Orlando Fire Department Roster: 11/5/2026');
const section=(y,title)=>cell(18,y,title);
const person=(y,code,name,qual='')=>[cell(18,y,code),cell(46,y,name),cell(118,y,qual)].filter(t=>t.s);

test('separate command, DIV1 and ORSA; EMS rank and promotion letters stay independent',()=>{
 const pdf=parseFOB([[header,section(55,'AC1'),...person(70,'ACPM','A Chief'),section(85,'DIV1'),
  ...person(100,'ENG','B Engineer','P'),...person(115,'ENP','C Medic','h'),section(130,'ORSA'),
  ...person(145,'FFP','D Unavailable'),section(160,'R012 - District 2'),...person(175,'ENE','E Driver'),
  ...person(190,'FFE','F Smith','E'),...person(205,'LTP','G Officer'),...person(220,'LTE','H Jones')]]);
 assert.deepEqual(pdf.fob.rovers,['B Engineer','C Medic']);
 assert.deepEqual(pdf.fob.excluded,['D Unavailable']);
 assert.equal(pdf.records.some(r=>r.name==='D Unavailable'),false);
 assert.equal(pdf.records[0].unit,'Division 1');
 assert.deepEqual(pdf.records.slice(1).map(r=>[r.rank,r.qual.includes('M'),r.qual.includes('P')]),[
  ['Eng',false,true],['Eng',true,false],['Eng',false,false],['FF',false,false],['Lt',true,false],['Lt',false,false]]);
});

test('apply complementary partial trades and carry unit over column break',()=>{
 const pdf=parseFOB([[header,section(55,'R001 - District 1'),...person(80,'FFE','A Relief'),
   cell(26,95,'TS+'),cell(62,95,'8:00'),cell(100,95,'20:00'),
   ...person(60,'FFP','B Regular','P').map(t=>({...t,x:t.x+360})),
   cell(551,60,'8:00'),cell(574,60,'20:00'),cell(600,60,'TS-')]]);
 assert.deepEqual(pdf.records.filter(r=>r.code!=='STO').map(r=>[r.unit,r.code,r.start,r.end]),[
   ['Rescue 1','STW',0,720],['Rescue 1','REG',720,1440]]);
 assert.deepEqual(pdf.records.at(-1).qual,['P','M']);
});
