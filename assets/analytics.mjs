// Only explicit source observations become chart points. Missing dates stay missing.
export function parseCSV(text) {
  const rows = []; let row = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || !value) quoted = !quoted;
      else throw new Error('CSV 引号格式不正确');
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(value); value = '';
      if (c !== ',') { if (row.some(x => x.trim())) rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; }
    } else value += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合');
  row.push(value); if (row.some(x => x.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 至少需要表头和一行真实记录');
  if (rows.length > 20001) throw new Error('每次最多导入 20,000 行');
  const headers = rows.shift().map(x => x.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV 存在重复列名');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`第 ${i+2} 行列数不一致`);
    return Object.fromEntries(headers.map((h,j) => [h, values[j].trim()]));
  });
}
function number(value, integer = false) {
  if (value === '' || value == null || !/^\d+(\.\d+)?$/.test(String(value))) throw new Error('价格和销量必须为非负数字；未知值请勿填写为 0');
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isSafeInteger(n))) throw new Error('销量必须为非负整数');
  return n;
}
function date(value) {
  const d = String(value || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d) throw new Error('日期必须为有效的 YYYY-MM-DD');
  return d;
}
export function importSales(text) {
  const raw = parseCSV(text), shopify = 'Lineitem quantity' in raw[0];
  const required = shopify ? ['Name','Created at','Currency','Financial Status','Lineitem quantity','Lineitem name','Lineitem price','Shipping Country','Cancelled at'] : ['date','product_id','product_name','market','currency','price','units','source'];
  for (const h of required) if (!(h in raw[0])) throw new Error('缺少 CSV 列：'+h);
  let skipped = 0; const normalized = []; const orders = new Map();
  for (const r of raw) {
    let item;
    if (shopify) {
      if (!r.Name) throw new Error('Shopify 每行必须包含订单 Name');
      if (r['Financial Status']) orders.set(r.Name, r);
      const order = orders.get(r.Name);
      if (!order) throw new Error('缺少订单状态；请导出包含完整订单的 CSV');
      const market = order['Shipping Country'];
      if (order['Financial Status'].toLowerCase() !== 'paid' || order['Cancelled at'] || !['US','MY'].includes(market)) { skipped++; continue; }
      item = {date:date(order['Created at']), product_id:r['Lineitem sku'] || r['Lineitem name'], product_name:r['Lineitem name'], market, currency:order.Currency.toUpperCase(), price:number(r['Lineitem price']), units:number(r['Lineitem quantity'],true), source:'Shopify 订单 CSV · 已付款且未取消订单行'};
    } else {
      item = {product_id:r.product_id,product_name:r.product_name,market:r.market,source:r.source,date:date(r.date),price:number(r.price),units:number(r.units,true),currency:r.currency.toUpperCase()};
    }
    if (!item.product_id || !item.product_name || !item.source || !['US','MY'].includes(item.market) || !/^[A-Z]{3}$/.test(item.currency)) throw new Error('商品编号、名称、来源、US/MY 市场及三字母币种不能为空或无效');
    normalized.push(item);
  }
  const daily = new Map();
  for (const r of normalized) {
    const key = JSON.stringify([r.product_id,r.market,r.currency,r.date]);
    if (daily.has(key) && !shopify) throw new Error('同一商品、市场、币种和日期有重复记录；请先汇总每日销量');
    const old = daily.get(key);
    daily.set(key, old ? {...r, units:old.units+r.units, price:r.price} : r);
  }
  if (!daily.size) throw new Error('没有符合条件的 US/MY 销量记录');
  return {rows:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)), skipped, shopify};
}
export const productKey = r => JSON.stringify([r.product_id,r.market,r.currency]);
export function series(rows, key, days) {
  let selected = rows.filter(r => productKey(r) === key).sort((a,b)=>a.date.localeCompare(b.date));
  if (selected.length && days) {
    const cutoff = Date.parse(selected.at(-1).date) - (days-1)*86400000;
    selected = selected.filter(r => Date.parse(r.date) >= cutoff);
  }
  return selected;
}
export function segments(rows) {
  const groups=[];
  for (const r of rows) {
    const group=groups.at(-1);
    if (!group || Date.parse(r.date)-Date.parse(group.at(-1).date)!==86400000) groups.push([r]);
    else group.push(r);
  }
  return groups;
}
export function formatPrice(value,currency) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value)<0) return '价格待核实';
  if (!/^[A-Z]{3}$/.test(currency || '')) return Number(value).toFixed(2)+' · 币种未知';
  return new Intl.NumberFormat('en',{style:'currency',currency,currencyDisplay:'code'}).format(Number(value));
}

export function csvCell(value) {
  let text=String(value??'');
  if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
