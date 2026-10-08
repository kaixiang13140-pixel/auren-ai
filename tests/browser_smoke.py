"""Browser regression checks; all imported orders and auth responses are test fixtures."""
import functools
import http.server
from pathlib import Path
import shutil
import threading
from playwright.sync_api import sync_playwright

class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self, *args):
  pass

handler=functools.partial(QuietHandler,directory=str(Path(__file__).resolve().parents[1]))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda route:route.abort())
 page.goto(base,wait_until='networkidle')
 page.wait_for_function("document.querySelector('#catalogCount').textContent !== '—'")
 assert page.locator('#candidateBody tr').count()==15
 page.screenshot(path='/tmp/auren-desktop.png')
 page.locator('#candidateBody .detail-button').first.click()
 assert page.locator('#productDetail').is_visible()
 assert '暂无真实销量数据' in page.locator('#salesChart').inner_text()
 page.locator('#closeDetail').click()
 page.locator('#nextPage').click()
 assert page.locator('#pageLabel').inner_text().startswith('2 /')
 page.locator('#candidateQuery').fill('nonexistent__item')
 assert '没有符合筛选条件' in page.locator('#candidateBody').inner_text()
 csv='date,product_id,product_name,market,currency,price,units,source\n2026-10-01,p1,Test Ring,US,USD,25,2,Test fixture\n2026-10-02,p1,Test Ring,US,USD,25,3,Test fixture\n2026-10-04,p1,Test Ring,US,USD,26,1,Test fixture'
 page.locator('#salesFile').set_input_files({'name':'test.csv','mimeType':'text/csv','buffer':csv.encode()})
 page.wait_for_function("document.querySelector('#salesCount').textContent==='1'")
 assert 'USD 26.00' in page.locator('#candidateBody').inner_text().replace('\xa0',' ')
 page.locator('#candidateBody .detail-button').first.click()
 assert page.locator('#detailUnits').inner_text()=='6'
 assert page.locator('#salesChart circle').count()==3
 assert page.locator('#salesChart polyline').count()==1
 page.screenshot(path='/tmp/auren-detail.png')
 page.keyboard.press('Escape')
 page.locator('#clearSales').click()
 assert page.locator('#salesCount').inner_text()=='0'
 page.locator('#sell').fill('25');page.locator('#cost').fill('6');page.locator('#ship').fill('4');page.locator('#fee').fill('10')
 assert '12.50' in page.locator('#profit').inner_text()
 page.locator('#fee').fill('110')
 assert '有效' in page.locator('#profit').inner_text()
 page.set_viewport_size({'width':390,'height':844})
 page.evaluate('window.scrollTo(0,0)')
 page.screenshot(path='/tmp/auren-mobile.png')
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 # Mock the external Supabase SDK to exercise preserved private UI flows without credentials.
 sdk="""
 export function createClient(){
 let saved=false;
 return {
 auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},signInWithPassword:async()=>({data:{user:{id:'test-admin',email:'admin@example.test'}}}),signOut:async()=>({})},
 rpc:async()=>({data:true}),
 from:(table)=>{
 let op='select';
 const query={select(){return query},eq(){return query},order(){return query},limit(){return query},insert(){op='insert';return query},delete(){op='delete';return query},then(resolve){
 if(op==='insert')saved=true;if(op==='delete')saved=false;
 resolve({data:table==='products'?[{id:'p1',product_name:'Private test ring',price:25,currency:'USD',category:'Jewelry',shop_name:'Test shop',product_url:'https://example.test/product'}]:(saved?[{product_id:'p1'}]:[])});
 }};return query;
 }};
 }
 """
 page.route('https://esm.sh/**',lambda route:route.fulfill(status=200,content_type='application/javascript',body=sdk,headers={'Access-Control-Allow-Origin':'*'}))
 page.locator('#url').fill('https://test-project.supabase.co')
 page.locator('#key').fill('sb_publishable_test_fixture')
 page.locator('#connect').click()
 page.locator('#email').fill('admin@example.test')
 page.locator('#password').fill('test-only')
 page.locator('#loginForm button').click()
 page.wait_for_function("document.querySelector('#count').textContent==='1'")
 assert '25.00' in page.locator('#tbody').inner_text()
 page.locator('#tbody button').click()
 page.wait_for_function("document.querySelector('#saved').textContent==='1'")
 page.locator('#tbody button').click()
 page.wait_for_function("document.querySelector('#saved').textContent==='0'")
 with page.expect_download() as download:
  page.locator('#export').click()
 assert download.value.suggested_filename.endswith('.csv')
 assert not errors,errors
 print('PASS: desktop/mobile, public catalog, pagination, filtering, unknown sales, CSV import, price, chart gaps, clear data, profit validation. mocked private login/prices/favorites/export. No JS errors.')
 browser.close()

server.shutdown()
