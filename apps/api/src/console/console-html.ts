// The genie test console — a single self-contained page served at GET /console.
// Vanilla JS; talks to this same API origin. Dev/testing aid only.

export const CONSOLE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>genie · test console</title>
<style>
  :root{
    --cyan:#33B6CE; --cyan-d:#2A93A8; --cyan-soft:#ECF8FB;
    --ink:#0F2E36; --ink-2:#526168; --muted:#6E7F86;
    --bg:#F1F5F7; --surface:#fff; --border:#E2E9EC; --ok:#16A46B; --err:#E5484D;
  }
  *{box-sizing:border-box} html,body{margin:0}
  body{font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
  a{color:var(--cyan-d)}
  header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.9);backdrop-filter:blur(6px);border-bottom:1px solid var(--border)}
  .bar{max-width:1100px;margin:auto;padding:12px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .brand{font-weight:700;font-size:18px;color:var(--cyan)}
  .who{font-size:13px;color:var(--muted);margin-left:auto}
  .who b{color:var(--ink)}
  main{max-width:1100px;margin:auto;padding:20px;display:grid;grid-template-columns:1fr;gap:16px}
  @media(min-width:900px){main{grid-template-columns:1fr 1fr}}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px}
  .card h2{margin:0 0 10px;font-size:15px;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
  .card.full{grid-column:1/-1}
  label{display:block;font-size:12px;color:var(--ink-2);margin:8px 0 3px}
  input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:9px;font:inherit;background:#fff}
  input:focus,select:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(51,182,206,.18)}
  .row{display:flex;gap:8px} .row>*{flex:1}
  button{cursor:pointer;border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:600;background:var(--cyan);color:#fff}
  button:hover{background:var(--cyan-d)} button.ghost{background:var(--cyan-soft);color:var(--cyan-d)}
  button.sm{padding:5px 10px;font-size:12px} button:disabled{opacity:.5;cursor:default}
  .tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
  .tabs button{background:#eef3f5;color:var(--ink-2);padding:6px 12px;font-size:13px}
  .tabs button.on{background:var(--cyan);color:#fff}
  .list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
  .item{border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px}
  .item .t{font-weight:600} .item .s{color:var(--muted);font-size:12px}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:var(--cyan-soft);color:var(--cyan-d)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}
  .prod{border:1px solid var(--border);border-radius:10px;overflow:hidden;font-size:12px}
  .prod img{width:100%;height:90px;object-fit:cover;display:block;background:#e8eef0}
  .prod .b{padding:8px}
  .msg{margin-top:8px;font-size:13px;padding:8px 10px;border-radius:8px;display:none}
  .msg.ok{display:block;background:#e7f6ef;color:var(--ok)} .msg.err{display:block;background:#fdecea;color:var(--err)}
  pre{background:#0f2e36;color:#d7ecf1;border-radius:10px;padding:12px;overflow:auto;font-size:12px;max-height:260px;margin:0}
  .log-row{border-bottom:1px solid #1d3a42;padding:4px 0}
  .log-row .m{color:#8fd3e0} .muted{color:var(--muted)}
  .hide{display:none}
  .kv{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed var(--border)}
</style>
</head>
<body>
<header><div class="bar">
  <span class="brand">genie</span><span class="muted">test console</span>
  <input id="apiBase" style="max-width:280px" />
  <span class="who" id="who">not signed in</span>
  <button class="sm ghost" id="logout">sign out</button>
</div></header>

<main>
  <!-- AUTH -->
  <section class="card" id="authCard">
    <h2>Account</h2>
    <div class="tabs">
      <button data-tab="celeb" class="on">Sign up · celebrant</button>
      <button data-tab="merch">Sign up · merchant</button>
      <button data-tab="signin">Sign in</button>
    </div>

    <div data-pane="celeb">
      <div class="row"><div><label>First name</label><input id="c_first" value="Ada"/></div>
        <div><label>Last name</label><input id="c_last" value="Obi"/></div></div>
      <label>Email</label><input id="c_email" placeholder="you@example.com"/>
      <div class="row"><div><label>Username</label><input id="c_user"/></div>
        <div><label>Phone</label><input id="c_phone" value="+2348012345678"/></div></div>
      <div class="row"><div><label>State</label><input id="c_state" value="Lagos"/></div>
        <div><label>Password</label><input id="c_pass" value="Abcdef1!"/></div></div>
      <label>Referral code (optional)</label><input id="c_ref"/>
      <div style="margin-top:12px"><button id="c_go">Create account &amp; verify</button></div>
    </div>

    <div data-pane="merch" class="hide">
      <label>Business name</label><input id="m_biz" value="Ada Cakes"/>
      <label>Merchant confirmation code</label><input id="m_code" placeholder="GENIE-XXXXXX"/>
      <div class="row"><div><label>Email</label><input id="m_email"/></div>
        <div><label>Username</label><input id="m_user"/></div></div>
      <div class="row"><div><label>Business phone</label><input id="m_phone" value="+2348011112222"/></div>
        <div><label>Business state</label><input id="m_state" value="Lagos"/></div></div>
      <div class="row"><div><label>Bank name</label><input id="m_bank" value="GTBank"/></div>
        <div><label>Account number</label><input id="m_acct" value="0123456789"/></div></div>
      <label>Password</label><input id="m_pass" value="Abcdef1!"/>
      <div style="margin-top:12px"><button id="m_go">Create merchant &amp; verify</button>
        <button class="ghost sm" id="m_invite">get a code</button></div>
    </div>

    <div data-pane="signin" class="hide">
      <label>Email or username</label><input id="s_id"/>
      <label>Password</label><input id="s_pass" value="Abcdef1!"/>
      <div style="margin-top:12px"><button id="s_go">Sign in</button></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Demo merchant: <code>demo-merchant@genieapps.co</code> / <code>Demo-merchant-2026!</code></p>
    </div>
    <div class="msg" id="authMsg"></div>
  </section>

  <!-- WALLET -->
  <section class="card" id="walletCard">
    <h2>Wallet</h2>
    <div class="kv"><span>Balance</span><b id="w_bal">—</b></div>
    <div class="kv"><span>Virtual account</span><span id="w_nuban" class="muted">—</span></div>
    <label>Add funds (₦)</label>
    <div class="row"><input id="w_amt" type="number" value="5000"/><button id="w_add" style="flex:0 0 auto">Add + settle</button></div>
    <div class="msg" id="walletMsg"></div>
  </section>

  <!-- EVENTS -->
  <section class="card" id="eventsCard">
    <h2>Events</h2>
    <label>Type</label>
    <select id="e_type"><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>Baby Shower</option><option>Graduation</option><option>Other</option></select>
    <label>Name</label><input id="e_name" placeholder="30th Birthday"/>
    <div class="row"><div><label>Event date</label><input id="e_date" type="date"/></div>
      <div><label>Wishlist name (optional)</label><input id="e_wl" value="Main list"/></div></div>
    <div style="margin-top:12px"><button id="e_go">Create event</button>
      <button class="ghost sm" id="e_dash">dashboard</button></div>
    <div class="list" id="e_list"></div>
    <div class="msg" id="eventsMsg"></div>
  </section>

  <!-- WISHLIST -->
  <section class="card" id="wlCard">
    <h2>Wishlist</h2>
    <label>Wishlist</label>
    <div class="row"><select id="wl_pick"></select><button class="sm ghost" style="flex:0 0 auto" id="wl_new">+ new</button></div>
    <div class="list" id="wl_items"></div>
    <div class="kv"><span>Items</span><b id="wl_count">0</b></div>
    <div class="kv"><span>Total value</span><b id="wl_total">—</b></div>
    <div style="margin-top:10px"><button id="wl_share" class="ghost">get share link</button></div>
    <div class="msg" id="wlMsg"></div>
  </section>

  <!-- CATALOG -->
  <section class="card full" id="catCard">
    <h2>Catalogue <span class="muted" style="font-size:12px;text-transform:none">— click a product to add it to the selected wishlist</span></h2>
    <select id="cat_filter" style="max-width:260px"><option value="">All categories</option></select>
    <div class="grid" id="cat_grid"></div>
  </section>

  <!-- MERCHANT -->
  <section class="card full hide" id="merchCard">
    <h2>My products (merchant)</h2>
    <div class="row">
      <div><label>Name</label><input id="mp_name"/></div>
      <div><label>Category</label><select id="mp_cat"></select></div>
      <div><label>Price (₦)</label><input id="mp_price" type="number" value="15000"/></div>
      <div><label>Stock</label><input id="mp_stock" type="number" value="10"/></div>
    </div>
    <label>Description</label><input id="mp_desc" value="A lovely thing."/>
    <div style="margin-top:10px"><button id="mp_go">Add product</button></div>
    <div class="list" id="mp_list"></div>
    <div class="msg" id="merchMsg"></div>
  </section>

  <!-- LOG -->
  <section class="card full">
    <h2>API log <button class="sm ghost" id="logClear" style="float:right">clear</button></h2>
    <pre id="log"></pre>
  </section>
</main>

<script>
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let API = localStorage.getItem('genie.api') || location.origin;
let TOKEN = localStorage.getItem('genie.token') || '';
let ME = null, EVENTS = [], WISHLIST = null, CATS = [];
$('#apiBase').value = API;
$('#apiBase').onchange = e => { API = e.target.value.replace(/\\/$/,''); localStorage.setItem('genie.api', API); };

const naira = k => '₦' + (Number(k)/100).toLocaleString('en-NG',{minimumFractionDigits:2});
const rnd = () => Math.random().toString(36).slice(2,8);

function logLine(method, path, status, body){
  const el = $('#log');
  const ok = status < 400;
  el.insertAdjacentHTML('afterbegin',
    '<div class="log-row"><span class="m">'+method+'</span> '+path+
    ' <b style="color:'+(ok?'#7fe0b0':'#f4a6a6')+'">'+status+'</b>'+
    '<div class="muted" style="font-size:11px;white-space:pre-wrap">'+
    (typeof body==='string'?body:JSON.stringify(body)).slice(0,600)+'</div></div>');
}

async function api(path, {method='GET', body, auth=true}={}){
  const headers = {'content-type':'application/json'};
  if(auth && TOKEN) headers.authorization = 'Bearer ' + TOKEN;
  let res, json;
  try{
    res = await fetch(API + path, {method, headers, body: body?JSON.stringify(body):undefined});
    json = await res.json().catch(()=>({}));
  }catch(e){
    logLine(method, path, 0, e.message);
    const err = new Error('Cannot reach the API at '+API+' — is it running?'); err.network = true; throw err;
  }
  logLine(method, path, res.status, json.error || json.data || json);
  if(!res.ok){ const err = new Error(json.error?.message || ('HTTP '+res.status)); err.status = res.status; throw err; }
  return json.data;
}

function msg(id, text, ok){ const el=$(id); el.textContent=text; el.className='msg '+(ok?'ok':'err'); if(!text) el.className='msg'; }
function device(){ let d = localStorage.getItem('genie.device'); if(!d){ d='console-'+rnd()+rnd(); localStorage.setItem('genie.device',d);} return d; }

function setSession(res){
  TOKEN = res.tokens.accessToken; ME = res.user;
  localStorage.setItem('genie.token', TOKEN);
  renderSession(); refreshAll();
}
function renderSession(){
  if(ME){
    $('#who').innerHTML = 'signed in as <b>'+ME.username+'</b> · '+ME.role.toLowerCase()+(ME.emailVerified?' ✓':' (unverified)');
    $('#authCard').classList.add('hide');
    $('#merchCard').classList.toggle('hide', ME.role!=='MERCHANT');
    $('#walletCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#eventsCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#wlCard').classList.toggle('hide', ME.role==='MERCHANT');
  } else {
    $('#who').textContent='not signed in'; $('#authCard').classList.remove('hide');
    ['merchCard'].forEach(x=>$('#'+x).classList.add('hide'));
  }
}
$('#logout').onclick = () => { TOKEN=''; ME=null; localStorage.removeItem('genie.token'); renderSession(); };
$('#logClear').onclick = () => $('#log').textContent='';

// tabs
$$('.tabs button[data-tab]').forEach(b => b.onclick = () => {
  $$('.tabs button[data-tab]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  $$('[data-pane]').forEach(p=>p.classList.toggle('hide', p.dataset.pane!==b.dataset.tab));
});

// ---- auth ----
async function verifyFlow(email, purpose='EMAIL_VERIFY'){
  // dev: pull the code straight from the API
  const peek = await api('/v1/auth/_dev/otp/'+encodeURIComponent(email)+'?purpose='+purpose, {auth:false});
  return peek.code;
}
$('#c_go').onclick = async () => {
  try{
    msg('#authMsg','',true);
    const email = $('#c_email').value || ('ada+'+rnd()+'@example.com');
    $('#c_email').value = email;
    const user = $('#c_user').value || ('ada_'+rnd());
    $('#c_user').value = user;
    await api('/v1/auth/register', {auth:false, method:'POST', body:{
      firstName:$('#c_first').value, lastName:$('#c_last').value, email, username:user,
      password:$('#c_pass').value, phone:$('#c_phone').value, stateOfResidence:$('#c_state').value,
      referralCode: $('#c_ref').value || undefined,
    }});
    const code = await verifyFlow(email);
    const res = await api('/v1/auth/verify-email', {auth:false, method:'POST', body:{ email, code, deviceId:device() }});
    setSession(res); msg('#authMsg','Signed in as '+res.user.username, true);
  }catch(e){ msg('#authMsg', e.message, false); }
};
$('#m_invite').onclick = async () => {
  // there's no public endpoint for this; hint the user
  msg('#authMsg','Run  npm run db:seed  — it prints 5 GENIE-XXXXXX invite codes.', false);
};
$('#m_go').onclick = async () => {
  try{
    msg('#authMsg','',true);
    const email = $('#m_email').value || ('cakes+'+rnd()+'@example.com'); $('#m_email').value=email;
    const user = $('#m_user').value || ('cakes_'+rnd()); $('#m_user').value=user;
    await api('/v1/auth/register/merchant', {auth:false, method:'POST', body:{
      businessName:$('#m_biz').value, confirmationCode:$('#m_code').value, email, username:user,
      businessPhone:$('#m_phone').value, businessState:$('#m_state').value,
      bankName:$('#m_bank').value, bankAccountNumber:$('#m_acct').value, password:$('#m_pass').value,
    }});
    const code = await verifyFlow(email);
    const res = await api('/v1/auth/verify-email', {auth:false, method:'POST', body:{ email, code, deviceId:device() }});
    setSession(res); msg('#authMsg','Signed in as merchant '+res.user.username, true);
  }catch(e){ msg('#authMsg', e.message, false); }
};
$('#s_go').onclick = async () => {
  try{
    const res = await api('/v1/auth/login', {auth:false, method:'POST', body:{
      identifier:$('#s_id').value, password:$('#s_pass').value, deviceId:device(),
    }});
    setSession(res); msg('#authMsg','Welcome back, '+res.user.username, true);
  }catch(e){ msg('#authMsg', e.message, false); }
};

// ---- wallet ----
async function loadWallet(){
  if(!ME || ME.role==='MERCHANT') return;
  try{
    const w = await api('/v1/payments/wallet');
    $('#w_bal').textContent = naira(w.balanceKobo);
    $('#w_nuban').textContent = w.virtualNuban || '—';
  }catch(e){}
}
$('#w_add').onclick = async () => {
  try{
    msg('#walletMsg','',true);
    const amountKobo = Math.round(Number($('#w_amt').value) * 100);
    const intent = await api('/v1/payments/add-funds', {method:'POST', body:{amountKobo}});
    await api('/v1/payments/_mock/settle', {auth:false, method:'POST', body:{reference:intent.reference}});
    await loadWallet(); msg('#walletMsg','Added '+naira(amountKobo)+' (mock settled).', true);
  }catch(e){ msg('#walletMsg', e.message, false); }
};

// ---- events ----
async function loadEvents(){
  if(!ME || ME.role==='MERCHANT') return;
  EVENTS = await api('/v1/events');
  $('#e_list').innerHTML = EVENTS.map(ev =>
    '<div class="item"><div class="t">'+ev.name+' <span class="pill">'+ev.type+'</span></div>'+
    '<div class="s">'+new Date(ev.eventDate).toDateString()+' · '+ev.wishlistCount+' wishlist(s) · '+ev.itemCount+' items · '+ev.fulfilmentPct+'% filled '+
    '<button class="sm ghost" data-del="'+ev.id+'">delete</button></div></div>').join('') || '<p class="muted">No events yet.</p>';
  $$('#e_list [data-del]').forEach(b => b.onclick = async () => {
    await api('/v1/events/'+b.dataset.del, {method:'DELETE'});
    await refreshAll();
  });
  loadWishlistPicker();
}
$('#e_go').onclick = async () => {
  try{
    msg('#eventsMsg','',true);
    const eventDate = new Date($('#e_date').value || Date.now()+86400000*30).toISOString();
    await api('/v1/events', {method:'POST', body:{
      type:$('#e_type').value, name:$('#e_name').value || ('Event '+rnd()),
      eventDate, wishlistName: $('#e_wl').value || undefined,
    }});
    $('#e_name').value=''; refreshAll(); msg('#eventsMsg','Event created.', true);
  }catch(e){ msg('#eventsMsg', e.message, false); }
};
$('#e_dash').onclick = async () => {
  try{ const d = await api('/v1/events/dashboard');
    msg('#eventsMsg', d.totalEvents+' events · '+d.activeEvents+' active · recent: '+d.recentEvents.map(e=>e.name+' ('+e.fulfilmentPct+'%)').join(', '), true);
  }catch(e){ msg('#eventsMsg', e.message, false); }
};

// ---- wishlists ----
function loadWishlistPicker(){
  // Wishlists come straight off the event summaries now.
  const opts = [];
  for(const ev of EVENTS){
    for(const w of (ev.wishlists||[])){
      opts.push({id:w.id, label:ev.name+' · '+w.name+' ('+w.itemCount+')'});
    }
  }
  const cur = $('#wl_pick').value;
  $('#wl_pick').innerHTML = opts.map(o=>'<option value="'+o.id+'">'+o.label+'</option>').join('')
    || '<option value="">— create an event with a wishlist —</option>';
  const keep = opts.find(o=>o.id===cur) ? cur : (opts[0] && opts[0].id);
  if(keep){ selectWishlist(keep); } else { WISHLIST=null; renderWishlist(); }
}
$('#wl_new').onclick = async () => {
  if(!EVENTS.length) return msg('#wlMsg','Create an event first.', false);
  const evName = prompt('Which event?  ('+EVENTS.map(e=>e.name).join(', ')+')', EVENTS[0].name);
  const ev = EVENTS.find(e => e.name.toLowerCase() === (evName||'').toLowerCase());
  if(!ev) return msg('#wlMsg','No event with that name.', false);
  const name = prompt('Wishlist name:', 'List '+rnd());
  try{
    const wl = await api('/v1/wishlists', {method:'POST', body:{eventId:ev.id, name}});
    await loadEvents(); selectWishlist(wl.id);
    msg('#wlMsg','Wishlist created.', true);
  }catch(e){ msg('#wlMsg', e.message, false); }
};
$('#wl_pick').onchange = e => selectWishlist(e.target.value);
async function selectWishlist(id){
  if(!id){ WISHLIST=null; renderWishlist(); return; }
  try{ WISHLIST = await api('/v1/wishlists/'+id); $('#wl_pick').value=id; renderWishlist(); }catch(e){}
}
function renderWishlist(){
  const w = WISHLIST;
  if(!w){ $('#wl_items').innerHTML='<p class="muted">No wishlist selected.</p>'; $('#wl_count').textContent='0'; $('#wl_total').textContent='—'; return; }
  $('#wl_items').innerHTML = w.items.map(i =>
    '<div class="item"><div class="t">'+i.productName+' ×'+i.quantityWanted+'</div>'+
    '<div class="s">'+naira(i.unitPriceKobo)+' · filled '+i.quantityFulfilled+' '+
    '<button class="sm ghost" data-rm="'+i.id+'">remove</button></div></div>').join('') || '<p class="muted">Empty — add products from the catalogue.</p>';
  $('#wl_count').textContent = w.itemCount + (w.isShareable?' (shareable)':' (need '+(2-w.itemCount)+' more to share)');
  $('#wl_total').textContent = naira(w.totalValueKobo);
  $$('#wl_items [data-rm]').forEach(b => b.onclick = async () => {
    WISHLIST = await api('/v1/wishlists/'+w.id+'/items/'+b.dataset.rm, {method:'DELETE'}); renderWishlist();
  });
}
$('#wl_share').onclick = async () => {
  if(!WISHLIST) return;
  try{
    const s = await api('/v1/wishlists/'+WISHLIST.id+'/share');
    if(!s.isShareable){ msg('#wlMsg','Add '+(2-s.itemCount)+' more item(s) first.', false); return; }
    const view = await api('/v1/public/wishlists/'+WISHLIST.id, {auth:false});
    msg('#wlMsg','Share: '+s.shareUrl+'  · public view OK ('+view.celebrantName+', '+view.items.length+' items)', true);
  }catch(e){ msg('#wlMsg', e.message, false); }
};

// ---- catalog ----
async function loadCatalog(){
  CATS = await api('/v1/categories', {auth:false});
  const opts = '<option value="">All categories</option>' + CATS.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  $('#cat_filter').innerHTML = opts;
  $('#mp_cat').innerHTML = CATS.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  await loadProducts();
}
$('#cat_filter').onchange = loadProducts;
async function loadProducts(){
  const cat = $('#cat_filter').value;
  const r = await api('/v1/products?pageSize=24'+(cat?'&category='+cat:''), {auth:false});
  $('#cat_grid').innerHTML = r.map(p =>
    '<div class="prod" data-add="'+p.id+'"><img src="'+(p.primaryImageUrl||'')+'" onerror="this.style.visibility=\\'hidden\\'"/>'+
    '<div class="b"><div style="font-weight:600">'+p.name+'</div><div class="muted">'+naira(p.priceKobo)+
    (p.availableStock!=null?' · '+p.availableStock+' in stock':'')+'</div></div></div>').join('') || '<p class="muted">No products.</p>';
  $$('#cat_grid [data-add]').forEach(el => el.onclick = async () => {
    if(!WISHLIST) return msg('#wlMsg','Select or create a wishlist first.', false);
    try{
      WISHLIST = await api('/v1/wishlists/'+WISHLIST.id+'/items', {method:'POST', body:{productId:el.dataset.add, quantityWanted:1}});
      renderWishlist(); msg('#wlMsg','Added to “'+WISHLIST.name+'”.', true);
    }catch(e){ msg('#wlMsg', e.message, false); }
  });
}

// ---- merchant ----
async function loadMyProducts(){
  if(!ME || ME.role!=='MERCHANT') return;
  const items = await api('/v1/merchant/products');
  $('#mp_list').innerHTML = items.map(p =>
    '<div class="item"><div class="t">'+p.name+'</div><div class="s">'+naira(p.priceKobo)+' · '+p.categoryName+
    ' · stock '+(p.availableStock??0)+' <button class="sm ghost" data-mpdel="'+p.id+'">delete</button></div></div>').join('') || '<p class="muted">No products yet.</p>';
  $$('#mp_list [data-mpdel]').forEach(b => b.onclick = async () => { await api('/v1/merchant/products/'+b.dataset.mpdel,{method:'DELETE'}); loadMyProducts(); loadProducts(); });
}
$('#mp_go').onclick = async () => {
  try{
    msg('#merchMsg','',true);
    await api('/v1/merchant/products', {method:'POST', body:{
      categoryId:$('#mp_cat').value, name:$('#mp_name').value||('Item '+rnd()), description:$('#mp_desc').value,
      priceKobo: Math.round(Number($('#mp_price').value)*100), quantity: Number($('#mp_stock').value),
      imageUrls: ['https://picsum.photos/seed/'+rnd()+'/400/300'],
    }});
    $('#mp_name').value=''; loadMyProducts(); loadProducts(); msg('#merchMsg','Product added.', true);
  }catch(e){ msg('#merchMsg', e.message, false); }
};

async function refreshAll(){
  renderSession();
  if(!ME) return;
  await Promise.all([loadWallet(), loadEvents(), loadCatalog(), loadMyProducts()]);
}

// boot
(async () => {
  $('#c_user').value = 'ada_' + rnd();
  $('#e_date').value = new Date(Date.now()+86400000*30).toISOString().slice(0,10);
  if(TOKEN){
    try{ ME = await api('/v1/me'); }
    catch(e){ if(e.status === 401){ TOKEN=''; localStorage.removeItem('genie.token'); } /* else: keep token, API may just be cold */ }
  }
  await refreshAll();
})();
</script>
</body>
</html>`;
