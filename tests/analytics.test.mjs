import test from 'node:test';
import assert from 'node:assert/strict';
import {importSales,parseCSV,formatPrice,series,segments,productKey,csvCell} from '../assets/analytics.mjs';
const header='date,product_id,product_name,market,currency,price,units,source\n';
test('unknown price is not displayed as zero',()=>{
  assert.equal(formatPrice(null,'USD'),'价格待核实');
  assert.match(formatPrice(0,'USD'),/0\.00/);
  assert.match(formatPrice('12.50','MYR'),/12\.50/);
});
test('CSV quoted commas and line breaks',()=>{
  assert.deepEqual(parseCSV('a,b\n"one,two","three\nfour"'),[{a:'one,two',b:'three\nfour'}]);
});
test('gaps in observations are never filled with invented zero sales',()=>{
  const {rows}=importSales(header+'2026-10-01,p1,Ring,US,USD,25,2,shop report\n2026-10-03,p1,Ring,US,USD,25,0,shop report');
  assert.equal(segments(rows).length,2);
  assert.equal(series(rows,productKey(rows[0]),30).length,2);
});
test('duplicate dates and missing observations rejected',()=>{
  const row='2026-10-01,p1,Ring,US,USD,25,2,shop report';
  assert.throws(()=>importSales(header+row+'\n'+row),/重复/);
  assert.throws(()=>importSales(header+'2026-10-01,p1,Ring,US,USD,25,,shop report'),/非负数字/);
  assert.throws(()=>importSales(header+'2026-02-30,p1,Ring,US,USD,25,1,shop report'),/日期/);
});
test('Shopify continuation lines inherit order metadata and exclude refunds',()=>{
 const csv='Name,Created at,Currency,Financial Status,Lineitem quantity,Lineitem name,Lineitem price,Shipping Country,Cancelled at,Lineitem sku\n#1,2026-10-01 10:00:00 +0800,MYR,paid,2,Ring,25,MY,,r1\n#1,,,,1,Ring,25,,,r1\n#2,2026-10-02,MYR,refunded,1,Ring,25,MY,,r1';
 const result=importSales(csv);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].units,3);
 assert.equal(result.skipped,1);
 assert.equal(result.rows[0].price,25);
 assert.equal(result.rows[0].market,'MY');
});
test('markets and currencies stay separate',()=>{
 const {rows}=importSales(header+'2026-10-01,p1,Ring,US,USD,25,2,report\n2026-10-01,p1,Ring,MY,MYR,99,3,report');
 assert.equal(series(rows,productKey(rows[0]),30).length,1);
});

test('CSV export neutralizes spreadsheet formulas',()=>{
 assert.equal(csvCell('=1+1'), '"\'=1+1"');
 assert.equal(csvCell('Ring'), '"Ring"');
});
test('customer metadata is not retained from imported daily summaries',()=>{
 const result=importSales(header.trim()+',email\n2026-10-01,p1,Ring,US,USD,25,1,report,private@example.com');
 assert.equal('email' in result.rows[0],false);
});
