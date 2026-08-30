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
    /* --cyan* keep their names for churn's sake; the brand is now deep violet. */
    --cyan:#6D28D9; --cyan-d:#5A20B0; --cyan-soft:#F4F1FE;
    --ink:#1B1330; --ink-2:#544D63; --muted:#716A81;
    --bg:#F3F1F8; --surface:#fff; --border:#E6E2EE; --ok:#16A46B; --err:#E5484D;
  }
  *{box-sizing:border-box} html,body{margin:0}
  body{font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
  a{color:var(--cyan-d)}
  header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.9);backdrop-filter:blur(6px);border-bottom:1px solid var(--border)}
  .bar{max-width:1100px;margin:auto;padding:12px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .brand{font-weight:700;font-size:18px;color:var(--cyan)}
  .who{font-size:13px;color:var(--muted);margin-left:auto}
  .who b{color:var(--ink)}
  main{max-width:1100px;margin:auto;padding:20px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
  @media(min-width:900px){main{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;min-width:0}
  .card h2{margin:0 0 10px;font-size:15px;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
  .card.full{grid-column:1/-1}
  label{display:block;font-size:12px;color:var(--ink-2);margin:8px 0 3px}
  input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:9px;font:inherit;background:#fff}
  input:focus,select:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(109,40,217,.18)}
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
  pre{background:#1b1330;color:#e6ddf7;border-radius:10px;padding:12px;overflow:auto;font-size:12px;max-height:260px;margin:0;max-width:100%}
  .log-row .muted{white-space:pre-wrap;word-break:break-word}
  .log-row{border-bottom:1px solid #33285a;padding:4px 0}
  .log-row .m{color:#c4a9f0} .muted{color:var(--muted)}
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

  <!-- GIFTING -->
  <section class="card" id="giftCard">
    <h2>Gifting</h2>
    <p class="muted" style="font-size:12px;margin:0 0 6px">Sign in as a second account, paste a wishlist item ID (shown on each item in the Wishlist card), and send a gift. You can't gift your own list.</p>
    <label>Wishlist item ID</label><input id="g_item" placeholder="clxxxx…"/>
    <div class="row">
      <div><label>Qty</label><input id="g_qty" type="number" value="1" min="1"/></div>
      <div><label>Method</label><select id="g_method"><option value="WALLET">Wallet</option><option value="BANK_TRANSFER">Bank transfer</option></select></div>
      <div><label>Anonymous</label><select id="g_anon"><option value="no">No</option><option value="yes">Yes</option></select></div>
    </div>
    <label>Message (optional)</label><input id="g_msg" placeholder="Happy birthday!"/>
    <div style="margin-top:10px"><button id="g_quote" class="ghost">Quote</button> <button id="g_pay">Send gift</button>
      <button id="g_cart" class="ghost">Add to cart</button></div>
    <div class="msg" id="giftMsg"></div>
    <div class="tabs" style="margin-top:12px">
      <button data-gtab="recv" class="on">Received</button>
      <button data-gtab="given">Given</button>
      <button data-gtab="orders">My orders</button>
    </div>
    <div class="list" id="g_recv" data-gpane="recv"></div>
    <div class="list hide" id="g_given" data-gpane="given"></div>
    <div class="list hide" id="g_orders" data-gpane="orders"></div>
  </section>

  <!-- MERCHANT ORDERS & PAYOUT -->
  <section class="card hide" id="moCard">
    <h2>Orders &amp; settlement (merchant)</h2>
    <div class="kv"><span>Wallet balance</span><b id="mo_bal">—</b></div>
    <div class="row">
      <div><label>Settlement bank</label><input id="po_bank" value="GTBank"/></div>
      <div><label>Account no.</label><input id="po_acct" value="0123456789"/></div>
    </div>
    <label>Account name</label><input id="po_name" value="Ada Cakes Ltd"/>
    <div style="margin-top:8px"><button class="ghost sm" id="po_save">Save account</button>
      <button class="sm" id="po_wd">Withdraw ₦<span id="po_wdamt">all</span></button></div>
    <div class="msg" id="moMsg"></div>
    <div class="list" id="mo_list" style="margin-top:12px"></div>
  </section>

  <!-- FRIENDS -->
  <section class="card hide" id="friendsCard">
    <h2>Friends</h2>
    <label>Add by username</label>
    <div class="row"><input id="fr_user" placeholder="celebrant_xxxx"/><button style="flex:0 0 auto" id="fr_add">Send request</button></div>
    <div class="msg" id="friendsMsg"></div>
    <div class="tabs" style="margin-top:12px">
      <button data-ftab="list" class="on">Friends</button>
      <button data-ftab="reqs">Requests</button>
      <button data-ftab="blocked">Blocked</button>
      <button data-ftab="contacts">Contacts</button>
    </div>
    <div class="list" id="fr_list" data-fpane="list"></div>
    <div class="list hide" id="fr_reqs" data-fpane="reqs"></div>
    <div class="list hide" id="fr_blocked" data-fpane="blocked"></div>
    <div data-fpane="contacts" class="hide">
      <label>Paste contacts — one per line, <code>Name, +234…</code></label>
      <textarea id="fr_contacts" rows="4" placeholder="Ada, 08030001111&#10;Tunde, +2348030002222"></textarea>
      <div style="margin-top:8px"><button class="ghost sm" id="fr_import">Match contacts</button></div>
      <div class="list" id="fr_matches"></div>
    </div>
  </section>

  <!-- NOTIFICATIONS -->
  <section class="card hide" id="notifCard">
    <h2>Notifications <span class="pill" id="n_badge" style="display:none">0</span>
      <button class="sm ghost" id="n_read" style="float:right">mark all read</button></h2>
    <div class="row" style="align-items:flex-end">
      <div><label>Register a (fake) push token</label><input id="n_tok" placeholder="tok-console-xxxx"/></div>
      <button class="sm ghost" style="flex:0 0 auto" id="n_reg">register</button>
    </div>
    <div id="n_prefs" style="margin-top:10px;font-size:12px"></div>
    <div class="list" id="n_list" style="margin-top:10px"></div>
  </section>

  <!-- REFERRALS -->
  <section class="card hide" id="refCard">
    <h2>Referrals</h2>
    <div class="kv"><span>Your code</span><b id="rf_code">—</b></div>
    <label>Share link</label>
    <div class="row"><input id="rf_link" readonly/><button class="sm ghost" style="flex:0 0 auto" id="rf_copy">copy</button></div>
    <div class="kv"><span>Referred / signed up / rewarded</span><b id="rf_counts">—</b></div>
    <div class="kv"><span>Earned</span><b id="rf_earned">—</b></div>
    <div class="list" id="rf_list"></div>
    <p class="muted" style="font-size:12px;margin-top:8px">To test: copy your code, sign up a new celebrant with it in the "Referral code" field, then have that account fund a wallet and send a gift.</p>
  </section>

  <!-- ACTIVITY -->
  <section class="card hide" id="actCard">
    <h2>Activity <select id="ac_cat" style="width:auto;float:right;font-size:12px;padding:3px 6px">
      <option value="">all</option><option>ACCOUNT</option><option>EVENT</option><option>TRANSACTION</option><option>APP</option>
    </select></h2>
    <div class="list" id="ac_list"></div>
  </section>

  <!-- KYC -->
  <section class="card hide" id="kycCard">
    <h2>Identity (KYC) <span class="pill" id="kyc_badge">—</span></h2>
    <div class="row">
      <div><label>ID type</label><select id="kyc_type"><option>NIN</option><option>DRIVERS_LICENSE</option><option>PASSPORT</option><option>VOTERS_CARD</option></select></div>
      <div><label>BVN (11 digits — end 0000 to fail, 9999 to hold)</label><input id="kyc_bvn" value="22222222222"/></div>
    </div>
    <div class="row">
      <div><label>Selfie</label><input id="kyc_selfie" type="file" accept="image/*"/></div>
      <div><label>ID document</label><input id="kyc_doc" type="file" accept="image/*"/></div>
    </div>
    <div style="margin-top:10px"><button id="kyc_go">Submit for verification</button>
      <button class="ghost sm" id="kyc_fake">use test images</button></div>
    <div class="msg" id="kycMsg"></div>
  </section>

  <!-- SETTINGS -->
  <section class="card hide" id="setCard">
    <h2>Settings</h2>
    <div class="tabs">
      <button data-stab="profile" class="on">Profile</button>
      <button data-stab="sessions">Sessions</button>
      <button data-stab="danger">Delete account</button>
    </div>
    <div data-spane="profile">
      <div class="row"><div><label>Date of birth</label><input id="st_dob" type="date"/></div>
        <div><label>State</label><input id="st_state"/></div></div>
      <div class="row"><div><label>Address line</label><input id="st_addr"/></div>
        <div><label>City</label><input id="st_city"/></div></div>
      <div style="margin-top:8px"><button class="sm" id="st_save">Save profile</button></div>
    </div>
    <div data-spane="sessions" class="hide">
      <div class="list" id="st_sessions"></div>
      <button class="ghost sm" id="st_revokeothers" style="margin-top:8px">sign out other devices</button>
    </div>
    <div data-spane="danger" class="hide">
      <p class="muted" style="font-size:12px">Wallet must be empty. A 6-digit code is emailed (shown here in local mode).</p>
      <button class="sm" id="st_delreq" style="background:var(--err)">Request deletion code</button>
      <div class="row" style="margin-top:8px"><input id="st_delcode" placeholder="6-digit code"/><button class="sm" style="flex:0 0 auto;background:var(--err)" id="st_delconfirm">Confirm delete</button></div>
    </div>
    <div class="msg" id="setMsg"></div>
  </section>

  <!-- SUPPORT -->
  <section class="card hide" id="supCard">
    <h2>Talk to us</h2>
    <div class="row"><input id="sup_subj" placeholder="Subject (optional)"/></div>
    <label>Message</label><textarea id="sup_msg" rows="2" placeholder="How can we help?"></textarea>
    <div style="margin-top:8px"><button class="sm" id="sup_go">Start conversation</button></div>
    <div class="list" id="sup_list"></div>
    <div class="msg" id="supMsg"></div>
  </section>

  <!-- CART -->
  <section class="card hide" id="cartCard">
    <h2>Gift cart <span class="pill" id="cart_total">₦0.00</span></h2>
    <p class="muted" style="font-size:12px;margin:0 0 6px">Use "Add to cart" in the Gifting card, then check out here — one payment, many gifts.</p>
    <div class="list" id="cart_items"></div>
    <div style="margin-top:10px">
      <select id="cart_method" style="width:auto"><option value="WALLET">Wallet</option><option value="BANK_TRANSFER">Bank transfer</option></select>
      <button id="cart_checkout">Check out</button>
      <button class="ghost sm" id="cart_clear">clear</button>
    </div>
    <div class="msg" id="cartMsg"></div>
  </section>

  <!-- MESSAGES -->
  <section class="card hide" id="msgCard">
    <h2>Messages <span class="pill" id="msg_badge" style="display:none">0</span></h2>
    <div class="row"><input id="msg_to" placeholder="friend username"/><button style="flex:0 0 auto" id="msg_start">Open chat</button></div>
    <div class="list" id="msg_threads"></div>
    <div id="msg_open" class="hide" style="margin-top:10px">
      <div class="s muted" id="msg_with"></div>
      <div class="list" id="msg_log" style="max-height:200px;overflow:auto"></div>
      <div class="row" style="margin-top:6px"><input id="msg_text" placeholder="Message…"/><button style="flex:0 0 auto" id="msg_send">Send</button></div>
    </div>
    <div class="msg" id="msgMsg"></div>
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
    $('#moCard').classList.toggle('hide', ME.role!=='MERCHANT');
    $('#walletCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#eventsCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#wlCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#giftCard').classList.remove('hide');
    $('#friendsCard').classList.remove('hide');
    $('#notifCard').classList.remove('hide');
    $('#refCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#actCard').classList.remove('hide');
    $('#kycCard').classList.remove('hide');
    $('#setCard').classList.remove('hide');
    $('#supCard').classList.remove('hide');
    $('#cartCard').classList.toggle('hide', ME.role==='MERCHANT');
    $('#msgCard').classList.remove('hide');
  } else {
    $('#who').textContent='not signed in'; $('#authCard').classList.remove('hide');
    ['merchCard','moCard','giftCard','friendsCard','notifCard','refCard','actCard','kycCard','setCard','supCard','cartCard','msgCard'].forEach(x=>$('#'+x).classList.add('hide'));
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
    '<div class="s">'+naira(i.unitPriceKobo)+' · filled '+i.quantityFulfilled+'/'+i.quantityWanted+' '+
    '<button class="sm ghost" data-rm="'+i.id+'">remove</button></div>'+
    '<div class="s" style="font-family:ui-monospace,monospace;font-size:11px">item id: '+i.id+
    ' <button class="sm ghost" data-gift="'+i.id+'">gift this</button></div></div>').join('') || '<p class="muted">Empty — add products from the catalogue.</p>';
  $('#wl_count').textContent = w.itemCount + (w.isShareable?' (shareable)':' (need '+(2-w.itemCount)+' more to share)');
  $('#wl_total').textContent = naira(w.totalValueKobo);
  $$('#wl_items [data-rm]').forEach(b => b.onclick = async () => {
    WISHLIST = await api('/v1/wishlists/'+w.id+'/items/'+b.dataset.rm, {method:'DELETE'}); renderWishlist();
  });
  $$('#wl_items [data-gift]').forEach(b => b.onclick = () => {
    $('#g_item').value = b.dataset.gift;
    $('#giftCard').scrollIntoView({behavior:'smooth'});
    msg('#giftMsg','Item ID copied into the gifting form. Sign in as another account to send it.', true);
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

// ---- gifting ----
$$('.tabs button[data-gtab]').forEach(b => b.onclick = () => {
  $$('.tabs button[data-gtab]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  $$('[data-gpane]').forEach(p=>p.classList.toggle('hide', p.dataset.gpane!==b.dataset.gtab));
});
function giftBody(){
  return {
    wishlistItemId: $('#g_item').value.trim(),
    quantity: Number($('#g_qty').value)||1,
    isAnonymous: $('#g_anon').value==='yes',
    message: $('#g_msg').value || undefined,
    method: $('#g_method').value,
  };
}
$('#g_quote').onclick = async () => {
  try{
    msg('#giftMsg','',true);
    const b = giftBody();
    const q = await api('/v1/gifts/quote', {method:'POST', body:{wishlistItemId:b.wishlistItemId, quantity:b.quantity}});
    msg('#giftMsg', q.productName+' ×'+q.quantity+'  —  subtotal '+naira(q.subtotalKobo)+
      ' + txn fee '+naira(q.transactionFeeKobo)+' + logistics '+naira(q.logisticsFeeKobo)+
      '  =  you pay '+naira(q.gifterPaysKobo)+'   (merchant gets '+naira(q.merchantReceivesKobo)+
      ', genie keeps '+naira(q.genieRetainsKobo)+')', true);
  }catch(e){ msg('#giftMsg', e.message, false); }
};
$('#g_pay').onclick = async () => {
  try{
    msg('#giftMsg','',true);
    const res = await api('/v1/gifts', {method:'POST', body:giftBody()});
    if(res.status==='PENDING'){
      await api('/v1/payments/_mock/settle', {auth:false, method:'POST', body:{reference:res.reference}});
      msg('#giftMsg','Bank transfer of '+naira(res.charge.gifterPaysKobo)+' mock-settled — gift is paid.', true);
    } else {
      msg('#giftMsg','Gift paid from wallet · order '+res.orderNumber, true);
    }
    $('#g_item').value=''; $('#g_msg').value='';
    await refreshAll();
  }catch(e){ msg('#giftMsg', e.message, false); }
};
$('#g_cart').onclick = async () => {
  try{
    const b = giftBody();
    await api('/v1/cart/items', {method:'POST', body:{wishlistItemId:b.wishlistItemId, quantity:b.quantity, isAnonymous:b.isAnonymous, message:b.message}});
    msg('#giftMsg','Added to your gift cart.', true);
    $('#g_item').value=''; loadCart();
  }catch(e){ msg('#giftMsg', e.message, false); }
};

// ---- cart ----
$('#cart_clear').onclick = async () => { try{ await api('/v1/cart', {method:'DELETE'}); loadCart(); }catch(e){} };
$('#cart_checkout').onclick = async () => {
  try{
    msg('#cartMsg','',true);
    const res = await api('/v1/cart/checkout', {method:'POST', body:{method:$('#cart_method').value}});
    if(res.status==='PENDING'){
      await api('/v1/payments/_mock/settle', {auth:false, method:'POST', body:{reference:res.reference}});
      msg('#cartMsg','Bank transfer of '+naira(res.totalKobo)+' mock-settled — '+(res.gifts?res.gifts.length:'all')+' gifts paid.', true);
    } else {
      msg('#cartMsg','Checked out — '+res.gifts.length+' gifts, '+naira(res.totalKobo)+' from wallet.', true);
    }
    await refreshAll();
  }catch(e){ msg('#cartMsg', e.message, false); }
};
async function loadCart(){
  if(!ME || ME.role==='MERCHANT') return;
  try{
    const c = await api('/v1/cart');
    $('#cart_total').textContent = naira(c.totalKobo);
    $('#cart_items').innerHTML = c.items.map(i =>
      '<div class="item" style="'+(i.giftable?'':'opacity:.5')+'"><div class="t">'+i.productName+' ×'+i.quantity+' <span class="pill">for '+i.forWhom+'</span></div>'+
      '<div class="s">'+naira(i.lineTotalKobo)+(i.isAnonymous?' · anon':'')+(i.reason?(' · '+i.reason):'')+
      ' <button class="sm ghost" data-cdel="'+i.id+'">remove</button></div></div>').join('') || '<p class="muted">Cart is empty.</p>';
    $('#cart_checkout').disabled = c.itemCount===0 || !c.allGiftable;
    $$('#cart_items [data-cdel]').forEach(b => b.onclick = async () => { await api('/v1/cart/items/'+b.dataset.cdel, {method:'DELETE'}); loadCart(); });
  }catch(e){}
}

// ---- messages ----
let MSG_THREAD = null;
$('#msg_start').onclick = async () => {
  try{
    const t = await api('/v1/messages/threads', {method:'POST', body:{username:$('#msg_to').value.trim()}});
    $('#msg_to').value=''; openThread(t.id, t.withUser.username); loadThreads();
  }catch(e){ msg('#msgMsg', e.message, false); }
};
$('#msg_send').onclick = async () => {
  if(!MSG_THREAD || !$('#msg_text').value.trim()) return;
  try{
    const t = await api('/v1/messages/threads/'+MSG_THREAD+'/messages', {method:'POST', body:{body:$('#msg_text').value}});
    $('#msg_text').value=''; renderThread(t); loadThreads();
  }catch(e){ msg('#msgMsg', e.message, false); }
};
function renderThread(t){
  $('#msg_with').textContent = 'with @'+t.withUser.username;
  $('#msg_log').innerHTML = t.messages.map(m =>
    '<div class="item" style="'+(m.mine?'background:var(--cyan-soft)':'')+'"><div class="s">'+(m.mine?'you':'@'+t.withUser.username)+' · '+new Date(m.createdAt).toLocaleTimeString()+'</div>'+m.body+'</div>').join('') || '<p class="muted">No messages yet.</p>';
  $('#msg_log').scrollTop = $('#msg_log').scrollHeight;
}
async function openThread(id){
  MSG_THREAD = id;
  $('#msg_open').classList.remove('hide');
  try{ renderThread(await api('/v1/messages/threads/'+id)); loadThreads(); loadNotifs(); }catch(e){}
}
async function loadThreads(){
  if(!ME) return;
  try{
    const [res, count] = await Promise.all([api('/v1/messages/threads'), api('/v1/messages/unread-count')]);
    const n = count.count||0;
    const badge = $('#msg_badge'); badge.textContent = n; badge.style.display = n>0?'inline-block':'none';
    $('#msg_threads').innerHTML = (res.data||res).map(t =>
      '<div class="item"><div class="t">@'+t.withUser.username+(t.unreadCount?' <span class="pill">'+t.unreadCount+' new</span>':'')+'</div>'+
      '<div class="s">'+(t.lastMessage||'—')+' <button class="sm ghost" data-open="'+t.id+'">open</button></div></div>').join('') || '<p class="muted">No conversations.</p>';
    $$('#msg_threads [data-open]').forEach(b => b.onclick = () => openThread(b.dataset.open));
  }catch(e){}
}

async function loadGifts(){
  if(!ME) return;
  try{
    const recv = await api('/v1/gifts/received');
    $('#g_recv').innerHTML = recv.map(g =>
      '<div class="item"><div class="t">'+g.productName+' <span class="pill">'+g.status+'</span></div>'+
      '<div class="s">'+g.eventName+' · '+naira(g.amountKobo)+' · from '+(g.from||'🎁 hidden')+
      (g.message?(' · “'+g.message+'”'):'')+' '+
      (g.canReveal?'<button class="sm" data-reveal="'+g.id+'">reveal</button>':'')+'</div></div>').join('')
      || '<p class="muted">No gifts received yet.</p>';
    $$('#g_recv [data-reveal]').forEach(b => b.onclick = async () => {
      try{ const r = await api('/v1/gifts/'+b.dataset.reveal+'/reveal', {method:'POST'});
        msg('#giftMsg','Revealed: '+r.from+(r.message?(' — “'+r.message+'”'):''), true); loadGifts();
      }catch(e){ msg('#giftMsg', e.message, false); }
    });
    const given = await api('/v1/gifts');
    $('#g_given').innerHTML = given.map(g =>
      '<div class="item"><div class="t">'+g.productName+' <span class="pill">'+g.status+'</span></div>'+
      '<div class="s">'+g.eventName+' · '+naira(g.amountKobo)+(g.isAnonymous?' · anonymous':'')+' · '+(g.orderStatus||'')+'</div></div>').join('')
      || '<p class="muted">No gifts sent yet.</p>';
    const orders = await api('/v1/orders');
    $('#g_orders').innerHTML = orders.map(o =>
      '<div class="item"><div class="t">'+o.orderNumber+' <span class="pill">'+o.status+'</span></div>'+
      '<div class="s">'+o.merchantName+' · '+naira(o.totalKobo)+' · delivery '+(o.deliveryStatus||'—')+'</div></div>').join('')
      || '<p class="muted">No orders.</p>';
  }catch(e){}
}

// ---- merchant orders & settlement ----
$('#po_save').onclick = async () => {
  try{
    await api('/v1/payouts/account', {method:'PUT', body:{
      bankName:$('#po_bank').value, accountNumber:$('#po_acct').value, accountName:$('#po_name').value,
    }});
    msg('#moMsg','Settlement account saved.', true);
  }catch(e){ msg('#moMsg', e.message, false); }
};
$('#po_wd').onclick = async () => {
  try{
    const w = await api('/v1/payments/wallet');
    const amountKobo = Number(w.balanceKobo);
    if(amountKobo < 10000){ msg('#moMsg','Balance below the ₦100 minimum withdrawal.', false); return; }
    const res = await api('/v1/payments/withdraw', {method:'POST', body:{
      amountKobo, bankName:$('#po_bank').value, accountNumber:$('#po_acct').value, accountName:$('#po_name').value,
    }});
    msg('#moMsg','Withdrawal '+res.status+' · '+naira(res.netAmountKobo), true);
    loadMerchantOrders();
  }catch(e){ msg('#moMsg', e.message, false); }
};
async function loadMerchantOrders(){
  if(!ME || ME.role!=='MERCHANT') return;
  try{
    const w = await api('/v1/payments/wallet');
    $('#mo_bal').textContent = naira(w.balanceKobo);
    $('#po_wdamt').textContent = (Number(w.balanceKobo)/100).toLocaleString();
    const orders = await api('/v1/merchant/orders');
    $('#mo_list').innerHTML = orders.map(o => {
      const d = o.delivery ? o.delivery.status : 'PENDING';
      const next = d==='PENDING' ? 'DISPATCHED' : (d==='DISPATCHED'||d==='IN_TRANSIT' ? 'DELIVERED' : null);
      return '<div class="item"><div class="t">'+o.orderNumber+' <span class="pill">'+o.status+'</span>'+(o.isGift?' <span class="pill">gift</span>':'')+'</div>'+
        '<div class="s">'+o.items.map(i=>i.description+' ×'+i.quantity).join(', ')+' · proceeds '+naira(o.proceedsKobo)+' · delivery '+d+' '+
        (next?'<button class="sm" data-adv="'+o.id+'" data-to="'+next+'">mark '+next.toLowerCase()+'</button>':'')+'</div></div>';
    }).join('') || '<p class="muted">No orders yet.</p>';
    $$('#mo_list [data-adv]').forEach(b => b.onclick = async () => {
      try{
        await api('/v1/merchant/orders/'+b.dataset.adv+'/delivery', {method:'PATCH', body:{status:b.dataset.to, courierName:'GIG Logistics'}});
        msg('#moMsg','Delivery → '+b.dataset.to, true); loadMerchantOrders();
      }catch(e){ msg('#moMsg', e.message, false); }
    });
  }catch(e){}
}

// ---- friends ----
$$('.tabs button[data-ftab]').forEach(b => b.onclick = () => {
  $$('.tabs button[data-ftab]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  $$('[data-fpane]').forEach(p=>p.classList.toggle('hide', p.dataset.fpane!==b.dataset.ftab));
});
$('#fr_add').onclick = async () => {
  try{
    msg('#friendsMsg','',true);
    const r = await api('/v1/friends/requests', {method:'POST', body:{username:$('#fr_user').value.trim()}});
    msg('#friendsMsg', r.status==='accepted' ? 'You are now friends!' : 'Request sent.', true);
    $('#fr_user').value=''; loadFriends();
  }catch(e){ msg('#friendsMsg', e.message, false); }
};
$('#fr_import').onclick = async () => {
  const contacts = $('#fr_contacts').value.split('\\n').map(l=>l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf(','); return i<0 ? {phone:l} : {name:l.slice(0,i).trim(), phone:l.slice(i+1).trim()};
  });
  if(!contacts.length) return;
  try{
    const r = await api('/v1/friends/import-contacts', {method:'POST', body:{contacts}});
    $('#fr_matches').innerHTML = '<div class="item s">'+r.matched+' of '+r.contactsProcessed+' contacts are on genie</div>' +
      r.matches.map(m => '<div class="item"><div class="t">'+m.firstName+' '+m.lastName+' <span class="pill">@'+m.username+'</span></div>'+
      '<div class="s">'+(m.contactName?('saved as '+m.contactName+' · '):'')+m.friendStatus+
      (m.friendStatus==='none'?' <button class="sm" data-fadd="'+m.username+'">add</button>':'')+'</div></div>').join('');
    $$('#fr_matches [data-fadd]').forEach(b => b.onclick = async () => {
      try{ await api('/v1/friends/requests', {method:'POST', body:{username:b.dataset.fadd}}); msg('#friendsMsg','Request sent.', true); loadFriends(); }
      catch(e){ msg('#friendsMsg', e.message, false); }
    });
  }catch(e){ msg('#friendsMsg', e.message, false); }
};
async function loadFriends(){
  if(!ME) return;
  try{
    const [friends, reqs, blocked] = await Promise.all([
      api('/v1/friends'), api('/v1/friends/requests'), api('/v1/friends/blocked'),
    ]);
    $('#fr_list').innerHTML = friends.map(f =>
      '<div class="item"><div class="t">'+f.firstName+' '+f.lastName+' <span class="pill">@'+f.username+'</span></div>'+
      '<div class="s"><button class="sm ghost" data-unfriend="'+f.userId+'">unfriend</button> '+
      '<button class="sm ghost" data-block="'+f.userId+'">block</button></div></div>').join('') || '<p class="muted">No friends yet.</p>';
    $('#fr_reqs').innerHTML = reqs.map(r =>
      '<div class="item"><div class="t">@'+r.user.username+' <span class="pill">'+r.direction+'</span></div>'+
      '<div class="s">'+(r.direction==='incoming'
        ? '<button class="sm" data-acc="'+r.id+'">accept</button> <button class="sm ghost" data-dec="'+r.id+'">decline</button>'
        : '<button class="sm ghost" data-cancel="'+r.id+'">cancel</button>')+'</div></div>').join('') || '<p class="muted">No pending requests.</p>';
    $('#fr_blocked').innerHTML = blocked.map(b =>
      '<div class="item"><div class="t">@'+b.username+'</div><div class="s"><button class="sm ghost" data-unblock="'+b.userId+'">unblock</button></div></div>').join('')
      || '<p class="muted">Nobody blocked.</p>';
    const wire = (sel, fn) => $$(sel).forEach(b => b.onclick = async () => { try{ await fn(b); loadFriends(); loadNotifs(); }catch(e){ msg('#friendsMsg', e.message, false); } });
    wire('#fr_reqs [data-acc]', b => api('/v1/friends/requests/'+b.dataset.acc+'/accept', {method:'POST'}));
    wire('#fr_reqs [data-dec]', b => api('/v1/friends/requests/'+b.dataset.dec+'/decline', {method:'POST'}));
    wire('#fr_reqs [data-cancel]', b => api('/v1/friends/requests/'+b.dataset.cancel, {method:'DELETE'}));
    wire('#fr_list [data-unfriend]', b => api('/v1/friends/'+b.dataset.unfriend, {method:'DELETE'}));
    wire('#fr_list [data-block]', b => api('/v1/friends/'+b.dataset.block+'/block', {method:'POST'}));
    wire('#fr_blocked [data-unblock]', b => api('/v1/friends/'+b.dataset.unblock+'/block', {method:'DELETE'}));
  }catch(e){}
}

// ---- notifications ----
$('#n_read').onclick = async () => { try{ await api('/v1/notifications/read', {method:'POST', body:{all:true}}); loadNotifs(); }catch(e){} };
$('#n_reg').onclick = async () => {
  const fcmToken = $('#n_tok').value.trim() || ('tok-console-'+rnd()+rnd());
  try{ await api('/v1/devices', {method:'POST', body:{fcmToken, platform:'ANDROID'}}); msg('#friendsMsg','Device registered — pushes now log server-side.', true); $('#n_tok').value=''; }
  catch(e){ msg('#friendsMsg', e.message, false); }
};
async function loadNotifs(){
  if(!ME) return;
  try{
    const [list, count] = await Promise.all([
      api('/v1/notifications?pageSize=15'), api('/v1/notifications/unread-count'),
    ]);
    const n = count.count || 0;
    const badge = $('#n_badge'); badge.textContent = n; badge.style.display = n>0 ? 'inline-block' : 'none';
    $('#n_list').innerHTML = list.map(x =>
      '<div class="item" style="'+(x.read?'opacity:.55':'')+'"><div class="t">'+x.title+' <span class="pill">'+x.category+'</span></div>'+
      '<div class="s">'+x.body+' · '+new Date(x.createdAt).toLocaleTimeString()+'</div></div>').join('') || '<p class="muted">Nothing yet.</p>';
    const prefs = await api('/v1/notifications/preferences');
    $('#n_prefs').innerHTML = prefs.map(p =>
      '<label style="display:inline-flex;gap:4px;align-items:center;margin-right:12px">'+
      '<input type="checkbox" style="width:auto" data-pref="'+p.category+'" '+(p.push?'checked':'')+'/> '+p.category.toLowerCase()+' push</label>').join('');
    $$('#n_prefs [data-pref]').forEach(cb => cb.onchange = async () => {
      try{ await api('/v1/notifications/preferences', {method:'PUT', body:{preferences:[{category:cb.dataset.pref, push:cb.checked}]}}); }catch(e){}
    });
  }catch(e){}
}

// ---- referrals ----
$('#rf_copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#rf_link').value); msg('#friendsMsg','Referral link copied.', true); };
async function loadReferrals(){
  if(!ME || ME.role==='MERCHANT') return;
  try{
    const r = await api('/v1/referrals');
    $('#rf_code').textContent = r.code;
    $('#rf_link').value = r.link;
    $('#rf_counts').textContent = r.totalReferred+' / '+r.signedUp+' / '+r.rewarded;
    $('#rf_earned').textContent = naira(r.totalEarnedKobo)+' (pending '+naira(r.pendingRewardKobo)+')';
    $('#rf_list').innerHTML = r.referees.map(f =>
      '<div class="item"><div class="t">'+f.firstName+' <span class="pill">@'+f.username+'</span></div>'+
      '<div class="s">'+f.status+(f.status==='REWARDED'?(' · '+naira(f.rewardKobo)):'')+' · joined '+new Date(f.joinedAt).toLocaleDateString()+'</div></div>').join('')
      || '<p class="muted">No referrals yet.</p>';
  }catch(e){}
}

// ---- activity ----
$('#ac_cat').onchange = loadActivity;
async function loadActivity(){
  if(!ME) return;
  try{
    const cat = $('#ac_cat').value;
    const rows = await api('/v1/activities?pageSize=25'+(cat?'&category='+cat:''));
    $('#ac_list').innerHTML = rows.map(a =>
      '<div class="item"><div class="t">'+a.title+' <span class="pill">'+a.category+'</span></div>'+
      '<div class="s">'+a.action+' · '+new Date(a.createdAt).toLocaleString()+'</div></div>').join('') || '<p class="muted">No activity yet.</p>';
  }catch(e){}
}

// ---- KYC ----
function testImage(name){
  const b = new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0]);
  return new File([b], name, {type:'image/jpeg'});
}
$('#kyc_fake').onclick = () => { $('#kycMsg').textContent = 'Test images will be used on submit.'; $('#kycMsg').className='msg ok'; $('#kyc_selfie').dataset.fake='1'; };
$('#kyc_go').onclick = async () => {
  try{
    msg('#kycMsg','',true);
    const fd = new FormData();
    fd.append('idDocType', $('#kyc_type').value);
    if($('#kyc_bvn').value) fd.append('bvn', $('#kyc_bvn').value.trim());
    const sf = $('#kyc_selfie').files[0] || ($('#kyc_selfie').dataset.fake ? testImage('selfie.jpg') : null);
    const df = $('#kyc_doc').files[0] || ($('#kyc_selfie').dataset.fake ? testImage('id.jpg') : null);
    if(!sf || !df) return msg('#kycMsg','Pick a selfie and an ID image (or click "use test images").', false);
    fd.append('selfie', sf); fd.append('idDoc', df);
    const res = await fetch(API+'/v1/kyc/level-1', {method:'POST', headers:{authorization:'Bearer '+TOKEN}, body:fd});
    const j = await res.json();
    logLine('POST','/v1/kyc/level-1', res.status, j.error||j.data);
    if(!res.ok) throw new Error(j.error && j.error.message || 'failed');
    msg('#kycMsg','Verification: '+j.data.status+(j.data.rejectionReason?(' — '+j.data.rejectionReason):''), j.data.status!=='REJECTED');
    loadKyc(); loadActivity(); loadNotifs();
  }catch(e){ msg('#kycMsg', e.message, false); }
};
async function loadKyc(){
  if(!ME) return;
  try{
    const k = await api('/v1/kyc');
    const badge = $('#kyc_badge'); badge.textContent = k.status;
    badge.style.background = k.status==='APPROVED' ? '#e7f6ef' : k.status==='REJECTED' ? '#fdecea' : 'var(--cyan-soft)';
  }catch(e){}
}

// ---- settings ----
$$('.tabs button[data-stab]').forEach(b => b.onclick = () => {
  $$('.tabs button[data-stab]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  $$('[data-spane]').forEach(p=>p.classList.toggle('hide', p.dataset.spane!==b.dataset.stab));
});
$('#st_save').onclick = async () => {
  try{
    const b = {};
    if($('#st_dob').value) b.dateOfBirth = new Date($('#st_dob').value).toISOString();
    if($('#st_state').value) b.stateOfResidence = $('#st_state').value;
    if($('#st_addr').value) b.addressLine = $('#st_addr').value;
    if($('#st_city').value) b.city = $('#st_city').value;
    if(!Object.keys(b).length) return;
    await api('/v1/me/profile', {method:'PATCH', body:b});
    msg('#setMsg','Profile saved.', true); loadActivity();
  }catch(e){ msg('#setMsg', e.message, false); }
};
$('#st_revokeothers').onclick = async () => {
  try{ const r = await api('/v1/me/sessions/revoke-others', {method:'POST', body:{deviceId:device()}}); msg('#setMsg','Signed out '+r.revoked+' other device(s).', true); loadSessions(); }
  catch(e){ msg('#setMsg', e.message, false); }
};
$('#st_delreq').onclick = async () => {
  try{
    await api('/v1/me/delete/request', {method:'POST'});
    const peek = await api('/v1/auth/_dev/otp/'+encodeURIComponent(ME.email)+'?purpose=ACCOUNT_DELETE', {auth:false}).catch(()=>null);
    msg('#setMsg','Code sent'+(peek?(' — '+peek.code):'')+'.', true);
    if(peek) $('#st_delcode').value = peek.code;
  }catch(e){ msg('#setMsg', e.message, false); }
};
$('#st_delconfirm').onclick = async () => {
  if(!confirm('Permanently delete this account?')) return;
  try{
    await api('/v1/me/delete/confirm', {method:'POST', body:{code:$('#st_delcode').value.trim()}});
    msg('#setMsg','Account deleted.', true);
    TOKEN=''; ME=null; localStorage.removeItem('genie.token'); renderSession();
  }catch(e){ msg('#setMsg', e.message, false); }
};
async function loadSessions(){
  if(!ME) return;
  try{
    const rows = await api('/v1/me/sessions?deviceId='+encodeURIComponent(device()));
    $('#st_sessions').innerHTML = rows.map(s =>
      '<div class="item"><div class="t">'+(s.deviceName||s.deviceId)+(s.current?' <span class="pill">this device</span>':'')+'</div>'+
      '<div class="s">'+(s.userAgent||'—')+' '+(s.current?'':'<button class="sm ghost" data-revoke="'+s.id+'">sign out</button>')+'</div></div>').join('') || '<p class="muted">No active sessions.</p>';
    $$('#st_sessions [data-revoke]').forEach(b => b.onclick = async () => { await api('/v1/me/sessions/'+b.dataset.revoke, {method:'DELETE'}); loadSessions(); });
  }catch(e){}
}
async function loadSettingsProfile(){
  if(!ME) return;
  $('#st_state').value = ME.stateOfResidence || '';
  if(ME.address){ $('#st_addr').value = ME.address.line||''; $('#st_city').value = ME.address.city||''; }
  if(ME.dateOfBirth) $('#st_dob').value = ME.dateOfBirth.slice(0,10);
}

// ---- support ----
$('#sup_go').onclick = async () => {
  try{
    if(!$('#sup_msg').value.trim()) return;
    await api('/v1/support/threads', {method:'POST', body:{subject:$('#sup_subj').value||undefined, message:$('#sup_msg').value}});
    $('#sup_subj').value=''; $('#sup_msg').value='';
    msg('#supMsg','Conversation started.', true); loadSupport();
  }catch(e){ msg('#supMsg', e.message, false); }
};
async function loadSupport(){
  if(!ME) return;
  try{
    const threads = await api('/v1/support/threads');
    $('#sup_list').innerHTML = threads.map(t =>
      '<div class="item"><div class="t">'+(t.subject||'(no subject)')+' <span class="pill">'+t.status+'</span></div>'+
      '<div class="s">'+t.messageCount+' message(s) · '+new Date(t.lastMessageAt).toLocaleString()+
      ' <button class="sm ghost" data-reply="'+t.id+'">reply</button></div></div>').join('') || '<p class="muted">No conversations.</p>';
    $$('#sup_list [data-reply]').forEach(b => b.onclick = async () => {
      const m = prompt('Your reply:'); if(!m) return;
      try{ await api('/v1/support/threads/'+b.dataset.reply+'/messages', {method:'POST', body:{message:m}}); msg('#supMsg','Reply sent.', true); loadSupport(); }
      catch(e){ msg('#supMsg', e.message, false); }
    });
  }catch(e){}
}

async function refreshAll(){
  renderSession();
  if(!ME) return;
  loadSettingsProfile();
  await Promise.all([loadWallet(), loadEvents(), loadCatalog(), loadMyProducts(), loadGifts(), loadMerchantOrders(), loadFriends(), loadNotifs(), loadReferrals(), loadActivity(), loadKyc(), loadSessions(), loadSupport(), loadCart(), loadThreads()]);
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
