
import {formatPrice, importSales, productKey, series, segments, csvCell} from './analytics.mjs';
let createClient;
const $=id=>document.getElementById(id);let client=null,products=[],favorites=new Set(),uid=null;const configKey='auren-supabase-config-v1';
function show(id,on){$(id).classList.toggle('hidden',!on)}function message(id,txt,error=false){$(id).textContent=txt;$(id).className='msg '+(error?'error':'success')}
function config(){try{return JSON.parse(localStorage.getItem(configKey)||'null')}catch{return null}}
async function initialize(c){if(!c||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url)||!/^sb_publishable_[\w-]+$/.test(c.key)){message('setupMsg','请输入有效的 Supabase Project URL 和 Publishable Key。',true);return}try{if(!createClient)({createClient}=await import('https://esm.sh/@supabase/supabase-js@2'));client=createClient(c.url.replace(/\/$/,''),c.key,{auth:{persistSession:true,autoRefreshToken:true}});show('setup',false);show('login',true);const {data:{session},error}=await client.auth.getSession();if(error)throw error;if(session)await onSignedIn(session.user);client.auth.onAuthStateChange((_event,session)=>{if(!session){uid=null;show('privateProducts',false);show('login',true);show('logout',false);$('account').textContent=''}})}catch(e){message('setupMsg',e.message,true);show('setup',true);show('login',false)}}
async function onSignedIn(user){try{const {data,error}=await client.rpc('is_app_admin');if(error)throw error;if(data!==true){await client.auth.signOut();throw new Error('这个账号不在 app_admins 管理员名单中。请确认 User UID 已加入数据库。')}uid=user.id;$('account').textContent=user.email||'Admin';show('login',false);show('logout',true);show('privateProducts',true);await load();await Promise.all([loadTrends(),loadCandidates()])}catch(e){message('loginMsg',e.message,true);show('privateProducts',false)}}
let loadVersion=0;
async function load(){if(!client||!uid)return;const version=++loadVersion;products=[];favorites=new Set();render();message('appMsg','读取中…');try{const [{data:p,error:pe},{data:w,error:we}]=await Promise.all([client.from('products').select('id,market,product_name,category,price,currency,image_url,product_url,shop_name').eq('market',$('market').value).order('created_at',{ascending:false}).limit(500),client.from('watchlist').select('product_id').eq('user_id',uid)]);if(version!==loadVersion)return;if(pe)throw pe;if(we)throw we;products=p||[];favorites=new Set((w||[]).map(x=>x.product_id));render();message('appMsg','已连接 Supabase · 数据为数据库实际返回结果')}catch(e){if(version===loadVersion)message('appMsg','读取失败：'+e.message,true)}}
function render(){const q=$('search').value.trim().toLowerCase(),filtered=products.filter(p=>[p.product_name,p.category,p.shop_name].some(v=>String(v||'').toLowerCase().includes(q)));$('marketStat').textContent=$('market').value;$('count').textContent=String(filtered.length);$('saved').textContent=String(favorites.size);const body=$('tbody');body.replaceChildren();show('empty',filtered.length===0);for(const p of filtered){const tr=document.createElement('tr');const cell=(txt)=>{const td=document.createElement('td');td.textContent=txt??'—';tr.append(td);return td};cell(p.product_name);cell(p.category);cell(formatPrice(p.price,p.currency));cell(p.shop_name);const link=cell('');if(p.product_url&&/^https?:\/\//i.test(p.product_url)){const a=document.createElement('a');a.href=p.product_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看';link.append(a)}else link.textContent='—';const fav=cell('');const b=document.createElement('button');b.className='secondary';b.textContent=favorites.has(p.id)?'♥ 已收藏':'♡ 收藏';b.onclick=async()=>{b.disabled=true;try{const res=favorites.has(p.id)?await client.from('watchlist').delete().eq('user_id',uid).eq('product_id',p.id):await client.from('watchlist').insert({user_id:uid,product_id:p.id});if(res.error)throw res.error;await load()}catch(e){message('appMsg','收藏操作失败：'+e.message,true)}finally{b.disabled=false}};fav.append(b);body.append(tr)}}
let trendRows=[],trendUpdatedAt=null;
async function loadTrends(){
  $('trendsMsg').textContent='正在读取每日趋势…';
  try{
    const response=await fetch('./data/trending_searches.json',{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.items)||!data.generated_at)throw new Error('数据格式不正确');
    trendRows=data.items.filter(x=>['US','MY'].includes(x.market)&&typeof x.keyword==='string');
    trendUpdatedAt=data.generated_at;
    renderTrends();
  }catch(e){
    trendRows=[];trendUpdatedAt=null;
    $('trendsBody').replaceChildren();
    $('trendUpdated').textContent='暂不可用';
    $('trendsMsg').textContent='趋势数据尚未生成或读取失败：'+e.message+'。请检查 GitHub Actions 运行结果。';
  }
}
function renderTrends(){
  const market=$('market').value;
  const search=$('trendSearch').value.trim().toLowerCase();
  const rows=trendRows.filter(x=>x.market===market&&x.keyword.toLowerCase().includes(search));
  const body=$('trendsBody');body.replaceChildren();
  $('trendUpdated').textContent=trendUpdatedAt?new Date(trendUpdatedAt).toLocaleString('zh-CN'):'未知';
  $('trendsMsg').textContent=rows.length?'当前显示 '+rows.length+' 个'+market+'搜索关键词（并非商品销量排名）':'当前筛选无趋势数据。';
  for(const item of rows){
    const tr=document.createElement('tr');
    const add=t=>{const td=document.createElement('td');td.textContent=t||'—';tr.append(td);return td;};
    add(item.keyword);
    add(item.approx_search_traffic);
    add(item.source_platform+(item.freshness==='stale'?'（旧数据；本次采集失败）':'')+(item.previous_approx_search_traffic?' · 上次量级 '+item.previous_approx_search_traffic:''));
    const td=add('');
    const a=document.createElement('a');
    const q=new URLSearchParams({q:item.keyword,geo:market});
    a.href='https://trends.google.com/trends/explore?'+q.toString();
    a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看 Google Trends';
    td.append(a);body.append(tr);
  }
}
let candidateRows=[],candidateLastUpdate=null,candidateSources=[];
async function loadCandidates(){
  $('candidateMsg').textContent='正在读取公开商品资料…';
  try{
    const response=await fetch('./data/product_candidates.json',{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const doc=await response.json();
    if(!Array.isArray(doc.products)||doc.data_type!=='open_catalog_product_records')throw new Error('候选商品数据格式错误');
    candidateRows=doc.products;
    candidateLastUpdate=doc.generated_at;
    candidateSources=doc.sources||[];
    renderCandidates();
  }catch(e){
    candidateRows=[];
    $('candidateBody').replaceChildren();
    $('candidateMeta').textContent='暂无可验证商品资料';
    $('candidateMsg').textContent='商品候选库还没完成首次采集或暂时读取失败：'+e.message+'。请查看每日自动采集任务。';
  }
}
let salesRows=[],page=1,activeProduct=null;
const pageSize=15;
function element(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function importedProducts(){
  const grouped=new Map();
  for(const row of salesRows){
    const key=productKey(row), old=grouped.get(key);
    grouped.set(key,{...row,id:key,salesKey:key,category:'订单商品',source_platform:row.source,market_tags:[row.market],last_seen_at:row.date,units:(old?.units||0)+row.units});
  }
  return [...grouped.values()];
}
function thumbnail(product,cls){
  const box=element('div','◇',cls);
  if(typeof product.image_url==='string'&&product.image_url.startsWith('https://')){
    const image=element('img');image.src=product.image_url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>image.remove();box.append(image);
  }
  return box;
}
function renderCandidates(){
  const scope=$('dataScope').value,market=$('market').value,category=$('candidateCategory').value,query=$('candidateQuery').value.trim().toLowerCase();
  const all=scope==='sales'?importedProducts().filter(p=>p.market===market):candidateRows;
  const matching=all.filter(p=>(!category||p.category===category)&&(!query||(p.product_name+' '+(p.brand||'')).toLowerCase().includes(query)));
  const sort=$('sortBy').value;
  matching.sort((a,b)=>sort==='name'?a.product_name.localeCompare(b.product_name):sort==='sales'?(b.units??-1)-(a.units??-1):Number((b.market_tags||[]).includes(market))-Number((a.market_tags||[]).includes(market))||(b.research_priority_score??-1)-(a.research_priority_score??-1));
  const pages=Math.max(1,Math.ceil(matching.length/pageSize));page=Math.min(page,pages);
  const body=$('candidateBody');body.replaceChildren();
  matching.slice((page-1)*pageSize,page*pageSize).forEach((p,index)=>{
    const tr=element('tr');const cell=(text,cls)=>{const td=element('td',text,cls);tr.append(td);return td;};
    cell(String((page-1)*pageSize+index+1),'muted');
    const product=element('div',null,'product-cell');const info=element('div');
    const name=element('button',p.product_name,'product-name');name.onclick=()=>openDetail(p);info.append(name,element('small',(p.brand||p.category)+' · '+(p.last_seen_at||'').slice(0,10)));
    product.append(thumbnail(p,'product-thumb'),info);cell().append(product);
    const price=cell(formatPrice(p.price,p.currency),'price');price.append(element('span',p.salesKey?'订单行标价 · '+p.date:'公开目录资料','subtext'));
    cell(p.units==null?'—':p.units.toLocaleString()).append(element('span',p.units==null?'暂无销量数据':'导入文件内合计','subtext'));
    const score=cell();if(p.research_priority_score!=null){const meter=element('progress');meter.max=100;meter.value=p.research_priority_score;meter.setAttribute('aria-label','研究优先级');const wrap=element('span',p.research_priority_score+' /100','score');wrap.append(meter);score.append(wrap);}else score.textContent='—';
    cell((p.market_tags||[]).includes(market)?market+(p.salesKey?' 订单':' 国家标签'):'市场待核实').append(element('span',p.source_platform+(p.freshness==='stale'?' · 旧记录':''),'subtext'));
    const button=element('button','查看详情','detail-button');button.onclick=()=>openDetail(p);cell().append(button);body.append(tr);
  });
  if(!matching.length){const row=element('tr'),cell=element('td',scope==='sales'?'当前市场暂无匹配的订单商品。请导入 CSV 或调整筛选。':'没有符合筛选条件的商品。','empty');cell.colSpan=7;row.append(cell);body.append(row);}
  $('catalogCount').textContent=String(candidateRows.length);$('jewelryCount').textContent=String(candidateRows.filter(p=>p.category==='Jewelry & Accessories').length);
  $('salesCount').textContent=String(importedProducts().length);
  $('coverage').textContent=salesRows.length?salesRows[0].date+' — '+salesRows.at(-1).date:'待导入';
  $('candidateMeta').textContent='共 '+matching.length+' 件商品 · '+(scope==='sales'?'当前会话导入数据':('最近采集 '+(candidateLastUpdate?new Date(candidateLastUpdate).toLocaleString('zh-CN'):'未知')));
  $('pageLabel').textContent=page+' / '+pages;$('prevPage').disabled=page===1;$('nextPage').disabled=page===pages;
  const failed=candidateSources.filter(x=>x.status==='error').map(x=>x.collection);
  $('candidateMsg').textContent=scope==='sales'?'销量为文件覆盖期间合计，不同商品覆盖天数可能不同。':(sort==='sales'?'开放目录没有销量数据，当前顺序不代表销量排名。':'研究优先级不代表销量排名。')+(failed.length?' 部分来源暂不可用：'+failed.join('、'):'');
}
function openDetail(product){
  activeProduct=product;$('detailTitle').textContent=product.product_name;$('detailCategory').textContent=product.category;
  $('detailSource').textContent=product.source_platform+' · '+(product.last_seen_at||'').slice(0,10)+(product.freshness==='stale'?' · 旧资料':'');
  $('detailImage').replaceChildren();const thumb=thumbnail(product,'detail-image');$('detailImage').append(thumb);
  $('detailPrice').textContent=formatPrice(product.price,product.currency);
  $('priceNote').textContent=product.salesKey?'导入记录中的订单行标价，未扣折扣':'来源未提供报价时保留未知';
  $('detailScore').textContent=product.research_priority_score==null?'—':product.research_priority_score+' /100';
  const link=$('detailLink');link.classList.toggle('hidden',!product.source_url?.startsWith('https://'));link.removeAttribute('href');if(product.source_url?.startsWith('https://'))link.href=product.source_url;
  renderChart();if(!$('productDetail').open)$('productDetail').showModal();
}
function renderChart(){
  const rows=activeProduct?.salesKey?series(salesRows,activeProduct.salesKey,Number($('chartDays').value)):[];
  const chart=$('salesChart');chart.replaceChildren();$('dailyBody').replaceChildren();$('dailyDetails').classList.toggle('hidden',!rows.length);
  $('detailUnits').textContent=rows.length?rows.reduce((n,r)=>n+r.units,0).toLocaleString():'—';
  $('chartPeriod').textContent=rows.length?rows[0].date+' 至 '+rows.at(-1).date+' · '+rows.length+' 个记录日':'等待真实销售记录';
  if(!rows.length){const empty=element('div',null,'chart-empty');const inner=element('div');inner.append(element('h3','暂无真实销量数据'),element('p','此商品还没有可用的历史销量。导入你自己的订单后，可在「我的订单数据」中查看对应商品曲线。'));empty.append(inner);chart.append(empty);return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 820 280');svg.setAttribute('role','img');svg.setAttribute('aria-label','每日已记录销量；缺失日期不补零');
  const make=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!=null)node.textContent=text;svg.append(node);return node;};
  const begin=Date.parse(rows[0].date),end=Date.parse(rows.at(-1).date),max=Math.max(1,...rows.map(r=>r.units));
  const x=r=>end===begin?425:55+(Date.parse(r.date)-begin)/(end-begin)*735,y=r=>235-r.units/max*205;
  for(let i=0;i<=4;i++){const value=max*i/4,yy=235-i/4*205;make('line',{x1:55,x2:790,y1:yy,y2:yy,stroke:'#eceef5'});make('text',{x:44,y:yy+4,'text-anchor':'end',fill:'#969baa','font-size':11},Number.isInteger(value)?value:value.toFixed(1));}
  for(const group of segments(rows))if(group.length>1)make('polyline',{points:group.map(r=>x(r)+','+y(r)).join(' '),fill:'none',stroke:'#7764e9','stroke-width':2.5});
  const tooltip=element('div','选择或悬停数据点查看日期与销量','chart-tooltip');
  for(const r of rows){const circle=make('circle',{cx:x(r),cy:y(r),r:4,fill:'#7764e9',stroke:'white','stroke-width':2,tabindex:0,'aria-label':r.date+'：'+r.units+' 件'});const title=document.createElementNS(ns,'title');title.textContent=r.date+'：'+r.units+' 件';circle.append(title);circle.onmouseenter=circle.onfocus=()=>{tooltip.textContent=title.textContent;};const tr=element('tr');tr.append(element('td',r.date),element('td',String(r.units)),element('td',formatPrice(r.price,r.currency)));$('dailyBody').append(tr);}
  make('text',{x:55,y:264,fill:'#969baa','font-size':11},rows[0].date);if(rows.length>1)make('text',{x:790,y:264,fill:'#969baa','font-size':11,'text-anchor':'end'},rows.at(-1).date);
  chart.append(svg,tooltip);
}
function download(text,name){const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}));const a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('salesFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>10*1024*1024)throw new Error('CSV 文件不能超过 10 MB');const imported=importSales(await file.text());salesRows=imported.rows;page=1;$('dataScope').value='sales';$('candidateCategory').value='';$('candidateQuery').value='';$('market').value=salesRows[0].market;$('sortBy').value='sales';renderCandidates();renderTrends();load();show('clearSales',true);if($('productDetail').open)$('productDetail').close();message('importMsg','已导入 '+salesRows.length+' 条每日记录，排除 '+imported.skipped+' 行。仅在当前浏览器会话使用；未上传订单或客户资料。');}
  catch(error){message('importMsg','导入失败：'+error.message+'。已有数据保持不变。',true);}finally{event.target.value='';}
};
$('clearSales').onclick=()=>{salesRows=[];$('dataScope').value='catalog';page=1;show('clearSales',false);if($('productDetail').open)$('productDetail').close();renderCandidates();message('importMsg','已清除本次导入的销售记录。');};
$('downloadTemplate').onclick=()=>download('date,product_id,product_name,market,currency,price,units,source\r\n','auren-daily-sales-template.csv');
$('prevPage').onclick=()=>{page--;renderCandidates();};$('nextPage').onclick=()=>{page++;renderCandidates();};
$('dataScope').onchange=()=>{page=1;$('candidateCategory').value='';renderCandidates();};$('sortBy').onchange=()=>{page=1;renderCandidates();};
$('closeDetail').onclick=()=>$('productDetail').close();$('chartDays').onchange=renderChart;
function calc(){if(['sell','cost','ship','fee'].some(id=>!$(id).validity.valid)){$('profit').textContent='请输入有效的非负金额和 0–100% 费率';return;}if(['sell','cost','ship','fee'].some(id=>$(id).value==='')){$('profit').textContent='填写实际报价与成本后计算';return;}const s=Number($('sell').value)||0,c=Number($('cost').value)||0,sh=Number($('ship').value)||0,f=Number($('fee').value)||0,p=s-c-sh-s*f/100;$('profit').textContent=`预计利润：${p.toFixed(2)}（利润率 ${s?(p/s*100).toFixed(1):'0.0'}%）`}
$('connect').onclick=async()=>{const c={url:$('url').value.trim(),key:$('key').value.trim()};if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url)||!/^sb_publishable_[\w-]+$/.test(c.key)){message('setupMsg','请检查 Project URL 和 Publishable Key。',true);return}localStorage.setItem(configKey,JSON.stringify(c));await initialize(c)};
$('reset').onclick=()=>{localStorage.removeItem(configKey);location.reload()};$('loginForm').onsubmit=async e=>{e.preventDefault();if(!client)return;message('loginMsg','正在登录…');const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){message('loginMsg',error.message,true);return}await onSignedIn(data.user)};$('logout').onclick=async()=>{await client.auth.signOut();location.reload()};$('market').onchange=()=>{page=1;load();renderTrends();renderCandidates()};$('trendSearch').oninput=renderTrends;$('candidateCategory').onchange=()=>{page=1;renderCandidates();};$('candidateQuery').oninput=()=>{page=1;renderCandidates();};$('search').oninput=render;$('reload').onclick=()=>{load();loadTrends();loadCandidates()};['sell','cost','ship','fee'].forEach(id=>$(id).oninput=calc);calc();$('export').onclick=()=>{const rows=[['market','product_name','category','price','currency','shop_name','product_url'],...products.map(p=>[p.market,p.product_name,p.category,p.price,p.currency,p.shop_name,p.product_url])];const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`auren-${$('market').value}-products.csv`;a.click();URL.revokeObjectURL(a.href)};const saved=config();if(saved){$('url').value=saved.url;$('key').value=saved.key;initialize(saved)}

Promise.all([loadCandidates(),loadTrends()]);

for(const link of document.querySelectorAll("nav a"))link.addEventListener("click",()=>{for(const item of document.querySelectorAll("nav a"))item.classList.toggle("active",item===link);});
