import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, onValue, remove, get, push, runTransaction, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
const auth = getAuth(fbApp);

// ---------- STATE ----------
let cart = {};              // cartId ("catId::itemKey") -> {catId,itemKey,name,price,priceFull,veg,emoji,halfFullEnabled,portion,qty}
let activeCategory = "all";
let liveCategories = [];    // [{id,label,icon,items:[{key,name,price,priceFull,veg,emoji,halfFullEnabled}]}]
let selectedTable = null;
let selectedBillChoice = null; // 'new' or an existing open billId
let openBillsForCurrentTable = [];
let menuSeeded = false;
let currentPage = 'home';
const tableFromUrl = getTableNumber();

// Sample guest reviews — edit these directly, or ask to make this admin-editable
const REVIEWS = [
  { name: "Ankit Sharma", initials: "AS", stars: 5, text: "Ambience bahut royal hai aur khana bhi lajawab. Shahi Chicken must try!" },
  { name: "Priya Verma", initials: "PV", stars: 5, text: "Family ke saath perfect jagah hai. AC hall aur service dono top class." },
  { name: "Rahul Singh", initials: "RS", stars: 4, text: "Paneer dishes bahut tasty the. Parking ki suvidha bhi accha laga." },
  { name: "Neha Gupta", initials: "NG", stars: 5, text: "Birthday party yahan celebrate ki, staff ne bahut accha treat kiya." }
];

function getTableNumber(){
  const params = new URLSearchParams(window.location.search);
  return params.get('table') || null;
}
document.getElementById('tableLabel').textContent = tableFromUrl ? `Table ${tableFromUrl}` : 'Select table at order';

// ============================================================
// PAGE NAVIGATION (Home / Menu / About Us)
// ============================================================
window.switchPage = function(page){
  currentPage = page;
  document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-pill').forEach(t=>t.classList.remove('active'));
  document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
  document.querySelector(`.tab-pill[data-page="${page}"]`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderReviews(){
  const wrap = document.getElementById('reviewScroll');
  if(!wrap) return;
  wrap.innerHTML = REVIEWS.map((r, idx)=>`
    <div class="review-card" style="animation-delay:${idx*0.08}s">
      <div class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
      <div class="review-text">"${r.text}"</div>
      <div class="review-author">
        <div class="review-avatar">${r.initials}</div>
        <b>${r.name}</b>
      </div>
    </div>
  `).join('');
}

// ============================================================
// LIVE MENU (Firebase) — loads real-time, seeds on first run
// ============================================================
function buildSeedObject(){
  const obj = {};
  MENU.categories.forEach(cat=>{
    const itemsObj = {};
    cat.items.forEach((it, idx)=>{
      const key = 'itm_' + idx + '_' + Math.random().toString(36).slice(2,8);
      itemsObj[key] = {
        name: it.name,
        price: it.price,
        priceFull: it.priceFull || null,
        halfFullEnabled: !!it.priceFull,
        veg: !!it.veg,
        emoji: it.emoji || '🍽️'
      };
    });
    obj[cat.id] = { label: cat.label, icon: cat.icon, items: itemsObj };
  });
  return obj;
}

function convertFbToCategories(data){
  return MENU.categories.map(catDef=>{
    const node = data && data[catDef.id];
    const itemsObj = (node && node.items) || {};
    const items = Object.entries(itemsObj).map(([key, val])=>({ key, ...val }));
    return { id: catDef.id, label: catDef.label, icon: catDef.icon, items };
  });
}

const menuRef = ref(db, 'menuData');

async function trySeedIfNeeded(){
  if(menuSeeded) return;
  try{
    const snap = await get(menuRef);
    if(!snap.exists()){
      await set(menuRef, buildSeedObject());
    }
    menuSeeded = true; // either seeded successfully, or data already existed
  }catch(e){
    // Likely permission-denied because no one is logged in yet as admin.
    // We'll retry automatically once an admin logs in (see onAuthStateChanged below).
    console.log('Menu seed skipped for now — will retry after admin login if needed.');
  }
}
trySeedIfNeeded();

onValue(menuRef, (snapshot)=>{
  const data = snapshot.val();
  if(data){
    liveCategories = convertFbToCategories(data);
    renderMenu();
    if(document.getElementById('adminPanel').classList.contains('show')){
      renderAdminPanel();
    }
  }
}, (err)=>{
  console.error('Menu load failed', err);
});

// ---------- RENDER FILTER CHIPS ----------
function renderFilters(){
  const bar = document.getElementById('filterBar');
  let html = `<div class="chip active" data-cat="all" onclick="setFilter('all')">All</div>`;
  MENU.categories.forEach(cat=>{
    html += `<div class="chip" data-cat="${cat.id}" onclick="setFilter('${cat.id}')">${cat.icon} ${cat.label}</div>`;
  });
  bar.innerHTML = html;
}

window.setFilter = function(catId){
  activeCategory = catId;
  document.querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('active', c.dataset.cat === catId);
  });
  renderMenu();
};

// ---------- RENDER MENU ----------
function cartId(catId, key){ return catId + '::' + key; }
function cssSafe(s){ return s.replace(/[^a-zA-Z0-9]/g,'_'); }

function findLiveItem(catId, key){
  const cat = liveCategories.find(c=>c.id===catId);
  if(!cat) return null;
  return cat.items.find(i=>i.key===key);
}

function renderMenu(){
  const container = document.getElementById('menuContainer');
  if(liveCategories.length === 0){
    container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--cream-dim);">
      <div style="font-size:44px;margin-bottom:10px;animation:blobFloat 2s ease-in-out infinite;">👑</div>Loading menu...
    </div>`;
    return;
  }
  let html = '';
  const cats = activeCategory === 'all' ? liveCategories : liveCategories.filter(c=>c.id===activeCategory);

  cats.forEach(cat=>{
    if(cat.items.length === 0) return;
    html += `<div class="section">
      <div class="section-head">
        <span class="icon">${cat.icon}</span>
        <h2>${cat.label}</h2>
        <div class="rule"></div>
      </div>
      <div class="grid">`;
    cat.items.forEach((item, idx)=>{
      const cid = cartId(cat.id, item.key);
      const inCart = !!cart[cid];
      const priceLabel = item.halfFullEnabled
        ? `<div class="price">₹${item.price} <span style="color:var(--cream-dim);font-weight:600;font-size:11px;">/ ₹${item.priceFull}</span></div>`
        : `<div class="price">₹${item.price}</div>`;

      html += `<div class="card" id="card-${cssSafe(cid)}" style="animation-delay:${(idx%8)*0.04}s">
        <div class="${item.veg ? 'veg-dot' : 'nonveg-dot'}"></div>
        <div class="blob">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${escapeAttr(item.name)}" loading="lazy" />` : `<span class="emoji-3d">${item.emoji}</span>`}</div>
        <h3>${item.name}</h3>
        ${priceLabel}
        <div class="card-footer" id="footer-${cssSafe(cid)}">
          <div></div>
          ${footerButtonHtml(cid, cat.id, item.key, inCart)}
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html || `<div style="text-align:center;padding:60px 20px;color:var(--cream-dim);">No items in this category yet.</div>`;
}

function footerButtonHtml(cid, catId, key, inCart){
  return inCart
    ? `<button class="add-btn" style="background:linear-gradient(150deg,#7ed98a,var(--veg));font-size:15px;" onclick="removeFromCart('${cid}')">✓</button>`
    : `<button class="add-btn" onclick="addToCart('${catId}','${key}')">+</button>`;
}

window.addToCart = function(catId, key){
  const cid = cartId(catId, key);
  if(cart[cid]) return;
  const item = findLiveItem(catId, key);
  if(!item) return;
  cart[cid] = {
    catId, itemKey: key,
    name: item.name, price: item.price, priceFull: item.priceFull,
    halfFullEnabled: !!item.halfFullEnabled,
    veg: item.veg, emoji: item.emoji, imageUrl: item.imageUrl || null,
    portion: item.halfFullEnabled ? 'half' : null,
    qty: 1
  };
  updateCardFooter(cid, catId, key);
  updateCartBar();
  vibrate();
};

window.removeFromCart = function(cid){
  const c = cart[cid];
  delete cart[cid];
  if(c) updateCardFooter(cid, c.catId, c.itemKey);
  updateCartBar();
  renderDrawer();
  renderConfirmItems();
};

function updateCardFooter(cid, catId, key){
  const footer = document.getElementById('footer-' + cssSafe(cid));
  if(!footer) return; // item not in current filtered view — fine, grid will reflect on next full render
  const inCart = !!cart[cid];
  footer.innerHTML = `<div></div>${footerButtonHtml(cid, catId, key, inCart)}`;
}

function vibrate(){ if(navigator.vibrate) navigator.vibrate(15); }

// ---------- CART BAR ----------
function itemLinePrice(c){
  return c.halfFullEnabled ? (c.portion === 'full' ? c.priceFull : c.price) : c.price;
}
function cartCountTotal(){
  let count = 0, total = 0;
  Object.values(cart).forEach(c=>{ count += c.qty; total += c.qty * itemLinePrice(c); });
  return { count, total };
}
function updateCartBar(){
  const { count, total } = cartCountTotal();
  document.getElementById('cartCount').textContent = `${count} item${count!==1?'s':''}`;
  document.getElementById('cartTotal').textContent = `₹${total}`;
  document.getElementById('cartBar').classList.toggle('show', count > 0);
}

// ---------- DRAWER (simple review list) ----------
window.openDrawer = function(){
  renderDrawer();
  document.getElementById('overlay').classList.add('show');
  document.getElementById('drawer').classList.add('show');
};
window.closeDrawer = function(){
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('drawer').classList.remove('show');
};

function renderDrawer(){
  const body = document.getElementById('drawerBody');
  const entries = Object.entries(cart);
  if(entries.length === 0){
    body.innerHTML = `<div class="empty-cart"><div class="em">🍽️</div>Your cart is empty.<br>Add some royal dishes!</div>`;
  } else {
    body.innerHTML = entries.map(([cid, c])=>`
      <div class="cart-item">
        <div class="ci-emoji">${c.imageUrl ? `<img src="${c.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />` : c.emoji}</div>
        <div class="ci-info">
          <b>${c.name}</b>
          <small>${c.halfFullEnabled ? 'Portion & quantity set at order time' : `₹${c.price}`}</small>
        </div>
        <button class="ci-remove-btn" onclick="removeFromCart('${cid}')">✕</button>
      </div>
    `).join('');
  }
  const { total } = cartCountTotal();
  document.getElementById('drawerTotal').textContent = `₹${total}`;
}

// ============================================================
// CONFIRM SCREEN — table number + portion + qty (1-6) + confirm
// ============================================================
window.openConfirmScreen = function(){
  if(Object.keys(cart).length === 0) return;
  closeDrawer();
  renderTableGrid();
  renderConfirmItems();
  document.getElementById('confirmScreen').classList.add('show');
};
window.closeConfirmScreen = function(){
  document.getElementById('confirmScreen').classList.remove('show');
};

function renderTableGrid(){
  if(selectedTable === null && tableFromUrl) selectedTable = tableFromUrl;
  const grid = document.getElementById('tableGrid');
  let html = '';
  const totalTables = (lastSettingsSnapshot && lastSettingsSnapshot.totalTables) || 10;
  for(let i=1;i<=totalTables;i++){
    html += `<button class="table-btn ${String(i)===String(selectedTable)?'active':''}" onclick="selectTable(${i})">${i}</button>`;
  }
  grid.innerHTML = html;
  document.getElementById('tableWarn').textContent = '';
  if(selectedTable){
    checkOpenBillsForTable(selectedTable);
  }
}

window.selectTable = async function(num){
  selectedTable = num;
  selectedBillChoice = null;
  document.querySelectorAll('.table-btn').forEach(b=>{
    b.classList.toggle('active', b.textContent.trim() === String(num));
  });
  document.getElementById('tableWarn').textContent = '';
  await checkOpenBillsForTable(num);
};

async function checkOpenBillsForTable(tableNum){
  const billChoiceBox = document.getElementById('billChoiceSection');
  billChoiceBox.innerHTML = '';
  openBillsForCurrentTable = [];
  if(!tableNum) return;

  try{
    const snap = await get(ref(db, 'bills'));
    const data = snap.val() || {};
    let matches = Object.entries(data)
      .map(([id, b])=>({ id, ...b }))
      .filter(b => b.status === 'open' && String(b.table) === String(tableNum));
    // Simple logic: only ever offer ONE "Same Customer" bill (the most recent
    // one), even if older stray open bills exist for this table.
    matches.sort((a,b)=> new Date(b.openedAt) - new Date(a.openedAt));
    openBillsForCurrentTable = matches.length > 0 ? [matches[0]] : [];
  }catch(e){
    console.error('Could not check open bills', e);
    openBillsForCurrentTable = [];
  }

  if(openBillsForCurrentTable.length === 0){
    selectedBillChoice = 'new'; // no existing bill, always starts fresh
    return;
  }

  renderBillChoice();
}

function renderBillChoice(){
  const box = document.getElementById('billChoiceSection');
  if(openBillsForCurrentTable.length === 0){ box.innerHTML=''; return; }

  let html = `<div class="bill-choice-block">
    <div class="bill-choice-label">🧾 This table already has an open bill</div>
    <div class="bill-choice-options">`;

  openBillsForCurrentTable.forEach(b=>{
    const selected = selectedBillChoice === b.id;
    html += `<button class="bill-choice-card ${selected?'selected':''}" onclick="chooseBill('${b.id}')">
      <div class="bc-left">
        <div class="bc-title">Same Customer</div>
        <div class="bc-sub">Add to running bill — ₹${b.total || 0} so far</div>
      </div>
      <div class="bc-check"></div>
    </button>`;
  });

  const newSelected = selectedBillChoice === 'new';
  html += `<button class="bill-choice-card ${newSelected?'selected':''}" onclick="chooseBill('new')">
      <div class="bc-left">
        <div class="bc-title">New Customer</div>
        <div class="bc-sub">Start a fresh separate bill for this table</div>
      </div>
      <div class="bc-check"></div>
    </button>`;

  html += `</div></div>`;
  box.innerHTML = html;
}

window.chooseBill = function(choice){
  selectedBillChoice = choice;
  renderBillChoice();
};

function renderConfirmItems(){
  const wrap = document.getElementById('confirmItemsList');
  const entries = Object.entries(cart);
  if(entries.length === 0){
    wrap.innerHTML = `<div class="empty-cart"><div class="em">🍽️</div>Cart is empty.</div>`;
    closeConfirmScreen();
    return;
  }
  wrap.innerHTML = entries.map(([cid, c])=>{
    const linePrice = itemLinePrice(c);
    const lineTotal = linePrice * c.qty;
    return `<div class="confirm-item-card">
      <div class="ci-top-row">
        <div class="ci-emoji">${c.imageUrl ? `<img src="${c.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />` : c.emoji}</div>
        <div class="ci-name">${c.name} ${c.veg ? '<span class="veg-dot" style="position:static;width:12px;height:12px;"></span>' : '<span class="nonveg-dot" style="position:static;width:12px;height:12px;"></span>'}</div>
        <button class="ci-remove-btn" onclick="removeFromCart('${cid}')">✕</button>
      </div>
      <div class="ci-controls-row">
        ${c.halfFullEnabled ? `
          <div class="ci-portion-pills">
            <button class="ci-portion-pill ${c.portion==='half'?'selected':''}" onclick="setPortion('${cid}','half')">Half ₹${c.price}</button>
            <button class="ci-portion-pill ${c.portion==='full'?'selected':''}" onclick="setPortion('${cid}','full')">Full ₹${c.priceFull}</button>
          </div>
        ` : `<div style="font-size:12px;color:var(--cream-dim);">₹${c.price} each</div>`}
        <div class="ci-qty-control">
          <button onclick="setQty('${cid}', ${c.qty-1})" ${c.qty<=1?'disabled':''}>−</button>
          <span>${c.qty}</span>
          <button onclick="setQty('${cid}', ${c.qty+1})" ${c.qty>=6?'disabled':''}>+</button>
        </div>
      </div>
      <div class="ci-line-total">₹${lineTotal}</div>
    </div>`;
  }).join('');

  const { total } = cartCountTotal();
  document.getElementById('confirmTotal').textContent = `₹${total}`;
}

window.setPortion = function(cid, portion){
  if(!cart[cid]) return;
  cart[cid].portion = portion;
  renderConfirmItems();
  updateCartBar();
};

window.setQty = function(cid, qty){
  if(!cart[cid]) return;
  if(qty < 1) qty = 1;
  if(qty > 6) qty = 6;
  cart[cid].qty = qty;
  renderConfirmItems();
  updateCartBar();
};

// ============================================================
// ORDER NUMBER GENERATOR — SD-YYMMDD-NNN (date + daily sequence)
// Uses a Firebase transaction so two simultaneous orders never clash.
// ============================================================
async function generateOrderNumber(){
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateKey = `${yy}${mm}${dd}`;

  const counterRef = ref(db, 'orderCounters/' + dateKey);
  const result = await runTransaction(counterRef, (current)=> (current || 0) + 1);
  const seq = result.snapshot.val() || 1;
  const seqPadded = String(seq).padStart(3, '0');

  return `SD${dateKey}-${seqPadded}`;
}

// ============================================================
// BILLING — table-session running bills (Same/New Customer)
// ============================================================
async function generateBillNumber(){
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateKey = `${yy}${mm}${dd}`;

  const counterRef = ref(db, 'billCounters/' + dateKey);
  const result = await runTransaction(counterRef, (current)=> (current || 0) + 1);
  const seq = result.snapshot.val() || 1;
  return `BILL${dateKey}-${String(seq).padStart(3,'0')}`;
}

async function createNewBill(order){
  const newBillId = await generateBillNumber();
  const bill = {
    id: newBillId,
    table: order.table,
    status: 'open',
    items: order.items.map(it=>({...it})),
    orderIds: [order.id],
    subtotal: order.total,
    openedAt: new Date().toISOString(),
    closedAt: null
  };
  await set(ref(db, 'bills/' + newBillId), bill);
  return newBillId;
}

async function attachOrderToBill(order){
  const choice = selectedBillChoice;

  if(!choice || choice === 'new'){
    return await createNewBill(order);
  }

  // choice is an existing open bill's ID — merge into it via transaction
  // (transactions avoid two simultaneous orders corrupting the same bill)
  const billRef = ref(db, 'bills/' + choice);
  let mergedOk = false;
  try{
    await runTransaction(billRef, (currentBill)=>{
      if(!currentBill || currentBill.status !== 'open') return currentBill; // bail out, unchanged
      const items = currentBill.items || [];
      order.items.forEach(newIt=>{
        const match = items.find(it => it.name === newIt.name && it.variant === newIt.variant);
        if(match) match.qty += newIt.qty;
        else items.push({ ...newIt });
      });
      currentBill.items = items;
      currentBill.orderIds = [...(currentBill.orderIds || []), order.id];
      currentBill.subtotal = (currentBill.subtotal || 0) + order.total;
      mergedOk = true;
      return currentBill;
    });
  }catch(e){
    console.error('Bill merge transaction failed', e);
  }

  if(mergedOk) return choice;
  // Old bill was no longer open (settled elsewhere) — fall back to a fresh bill
  return await createNewBill(order);
}

// ---------- PLACE ORDER (final write) ----------
window.placeOrder = async function(){
  if(!selectedTable){
    document.getElementById('tableWarn').textContent = 'Please select a table number to continue.';
    document.getElementById('tableGrid').scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }
  if(openBillsForCurrentTable.length > 0 && !selectedBillChoice){
    document.getElementById('tableWarn').textContent = 'Please choose "Same Customer" or "New Customer" above.';
    document.getElementById('billChoiceSection').scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }

  const entries = Object.entries(cart);
  if(entries.length === 0) return;

  const { total, count } = cartCountTotal();
  let orderId;
  try{
    orderId = await generateOrderNumber();
  }catch(e){
    console.error('Order number generation failed, using fallback', e);
    orderId = 'SD' + Date.now().toString().slice(-9); // fallback, still unique
  }

  const order = {
    id: orderId,
    table: selectedTable,
    items: entries.map(([cid, c])=>({
      name: c.name, qty: c.qty, price: itemLinePrice(c),
      variant: c.halfFullEnabled ? c.portion : null, veg: c.veg
    })),
    total: total,
    itemCount: count,
    status: 'pending',
    placedAt: new Date().toISOString(),
    placedAtLabel: new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
  };

  try{
    await set(ref(db, 'orders/' + orderId), order);
  }catch(e){
    console.error('Failed to send order', e);
    alert('Could not send order — check internet connection and try again.');
    return;
  }

  // Attach this order to a bill (new or existing running bill for this table)
  try{
    const billId = await attachOrderToBill(order);
    await update(ref(db, 'orders/' + orderId), { billId });
  }catch(e){
    console.error('Billing update failed (order was still placed successfully)', e);
  }

  document.getElementById('confirmScreen').classList.remove('show');
  showSuccess(orderId);
  cart = {};
  selectedTable = tableFromUrl || null;
  selectedBillChoice = null;
  openBillsForCurrentTable = [];
  renderMenu();
  updateCartBar();
};

function showSuccess(orderId){
  document.getElementById('orderNumLabel').textContent = `Order #${orderId}`;
  document.getElementById('successScreen').classList.add('show');
}
window.closeSuccess = function(){
  document.getElementById('successScreen').classList.remove('show');
};

// ============================================================
// ADMIN — Login (Firebase Auth) + Menu Manager
// ============================================================
window.openAdminLogin = function(){
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginModalOverlay').classList.add('show');
};
window.closeAdminLogin = function(){
  document.getElementById('loginModalOverlay').classList.remove('show');
};

window.submitLogin = async function(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if(!email || !password){
    errEl.textContent = 'Please enter email and password.';
    return;
  }

  try{
    await signInWithEmailAndPassword(auth, email, password);
    closeAdminLogin();
    openAdminPanel();
  }catch(e){
    console.error('Login failed', e);
    errEl.textContent = 'Invalid email or password.';
  }
};

window.adminLogout = async function(){
  try{ await signOut(auth); }catch(e){}
  document.getElementById('adminPanel').classList.remove('show');
};

onAuthStateChanged(auth, (user)=>{
  if(user){
    trySeedIfNeeded(); // retry in case the anonymous first-load attempt was permission-blocked
    if(document.getElementById('adminPanel').classList.contains('show')){
      renderAdminPanel();
    }
  }
});

function openAdminPanel(){
  document.getElementById('adminPanel').classList.add('show');
  renderAdminPanel();
}

function showToast(msg){
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

function renderAdminPanel(){
  renderAdminAboutBox(lastSettingsSnapshot || {});
  renderAdminGalleryBox(lastSettingsSnapshot || {});
  const body = document.getElementById('adminMenuBox');
  if(liveCategories.length === 0){
    body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--cream-dim);">Loading menu...</div>`;
    return;
  }
  body.innerHTML = liveCategories.map(cat=>{
    const itemsHtml = cat.items.map(item=>`
      <div class="admin-item-row">
        <button class="admin-veg-toggle ${item.veg?'':'off'}" onclick="adminToggleVeg('${cat.id}','${item.key}',${!item.veg})">${item.veg?'V':'N'}</button>
        <input type="text" value="${escapeAttr(item.name)}" onchange="adminUpdateField('${cat.id}','${item.key}','name',this.value)" />
        <input type="number" value="${item.price}" onchange="adminUpdateField('${cat.id}','${item.key}','price',Number(this.value))" title="Half/Base price" />
        <button class="admin-del-btn" onclick="adminDeleteItem('${cat.id}','${item.key}','${escapeAttr(item.name)}')">🗑️</button>
      </div>
      <div class="admin-photo-row">
        <div class="admin-photo-preview">${item.imageUrl ? `<img src="${item.imageUrl}" alt="" />` : `<span>${item.emoji||'🍽️'}</span>`}</div>
        <input type="file" accept="image/*" id="itemPhotoFile-${cssSafe(cat.id+item.key)}" style="display:none" onchange="handleMenuItemPhotoUpload(event,'${cat.id}','${item.key}')" />
        <button class="admin-photo-input" style="text-align:center;cursor:pointer;" onclick="document.getElementById('itemPhotoFile-${cssSafe(cat.id+item.key)}').click()">📷 ${item.imageUrl ? 'Change Photo' : 'Add Photo'}</button>
        ${item.imageUrl ? `<button class="admin-del-btn" title="Remove photo" onclick="adminUpdateField('${cat.id}','${item.key}','imageUrl','')">✕</button>` : ''}
      </div>
      <div class="admin-switch-row">
        <div class="admin-switch ${item.halfFullEnabled?'on':''}" onclick="adminToggleHalfFull('${cat.id}','${item.key}',${!item.halfFullEnabled})"></div>
        <span>Half / Full portion pricing ${item.halfFullEnabled ? `(Full: ₹${item.priceFull||0})` : '(off)'}</span>
        ${item.halfFullEnabled ? `<input type="number" style="width:60px;" value="${item.priceFull||0}" onchange="adminUpdateField('${cat.id}','${item.key}','priceFull',Number(this.value))" />` : ''}
      </div>
    `).join('');

    return `<div class="admin-cat-block">
      <div class="admin-cat-head">${cat.icon} ${cat.label}</div>
      ${itemsHtml || '<div style="padding:14px;color:var(--cream-dim);font-size:12.5px;">No items yet</div>'}
      <div class="admin-add-row">
        <button class="admin-add-toggle-btn" onclick="toggleAddForm('${cat.id}')">+ Add New Item</button>
        <div class="admin-add-form" id="addForm-${cssSafe(cat.id)}">
          <input type="text" id="newName-${cssSafe(cat.id)}" placeholder="Item name" />
          <div class="row2">
            <input type="number" id="newPrice-${cssSafe(cat.id)}" placeholder="Price" />
            <input type="text" id="newEmoji-${cssSafe(cat.id)}" placeholder="Emoji (optional)" maxlength="4" />
          </div>
          <button class="admin-save-new-btn" onclick="adminAddItem('${cat.id}')">Save Item</button>
          <div class="admin-settings-desc">Item save hone ke baad "Add Photo" button se photo device se upload kar sakte ho.</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function escapeAttr(s){ return String(s).replace(/"/g,'&quot;').replace(/'/g,"\\'"); }

window.toggleAddForm = function(catId){
  document.getElementById('addForm-' + cssSafe(catId)).classList.toggle('show');
};

window.adminUpdateField = async function(catId, key, field, value){
  try{
    await set(ref(db, `menuData/${catId}/items/${key}/${field}`), value);
    showToast('Saved ✓');
  }catch(e){
    console.error(e);
    showToast('Failed to save');
  }
};

// Menu item photos are compressed small (they render tiny in the grid) and
// stored directly in the item record — this means the photo comes down as
// part of the same Firebase fetch as the menu itself, with NO separate image
// request at all, so it appears instantly even on a brand-new device.
window.handleMenuItemPhotoUpload = async function(event, catId, key){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  showToast('Uploading photo...');
  try{
    const dataUrl = await compressImageFile(file, 400, 0.65);
    await set(ref(db, `menuData/${catId}/items/${key}/imageUrl`), dataUrl);
    showToast('Photo added ✓');
  }catch(e){
    console.error('Menu item photo upload failed', e);
    showToast('Failed to add photo');
  }
  event.target.value = '';
};

window.adminToggleVeg = function(catId, key, newVal){
  adminUpdateField(catId, key, 'veg', newVal);
};

window.adminToggleHalfFull = async function(catId, key, newVal){
  const item = findLiveItem(catId, key);
  try{
    await set(ref(db, `menuData/${catId}/items/${key}/halfFullEnabled`), newVal);
    if(newVal && !(item && item.priceFull)){
      await set(ref(db, `menuData/${catId}/items/${key}/priceFull`), (item ? item.price : 0) + 100);
    }
    showToast('Updated ✓');
  }catch(e){
    console.error(e);
    showToast('Failed to update');
  }
};

window.adminDeleteItem = async function(catId, key, name){
  if(!confirm(`Delete "${name}" from the menu?`)) return;
  try{
    await remove(ref(db, `menuData/${catId}/items/${key}`));
    showToast('Item deleted');
  }catch(e){
    console.error(e);
    showToast('Failed to delete');
  }
};

window.adminAddItem = async function(catId){
  const safe = cssSafe(catId);
  const name = document.getElementById('newName-'+safe).value.trim();
  const price = Number(document.getElementById('newPrice-'+safe).value);
  const emoji = document.getElementById('newEmoji-'+safe).value.trim() || '🍽️';

  if(!name || !price){
    showToast('Enter name and price');
    return;
  }

  const key = 'itm_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  try{
    await set(ref(db, `menuData/${catId}/items/${key}`), {
      name, price, priceFull: null, halfFullEnabled: false, veg: true, emoji, imageUrl: null
    });
    document.getElementById('newName-'+safe).value = '';
    document.getElementById('newPrice-'+safe).value = '';
    document.getElementById('newEmoji-'+safe).value = '';
    document.getElementById('addForm-'+safe).classList.remove('show');
    showToast('Item added ✓');
  }catch(e){
    console.error(e);
    showToast('Failed to add item');
  }
};

// ============================================================
// RESTAURANT SETTINGS (Home hero photo, gallery, About text — admin editable)
// ============================================================
const DEFAULT_GALLERY = [
  'restaurant-interior-1.jpg',
  'restaurant-interior-2.jpg',
  'restaurant-interior-3.jpg'
];

const settingsRef = ref(db, 'restaurantSettings');
let lastSettingsSnapshot = {};
onValue(settingsRef, (snapshot)=>{
  const data = snapshot.val();
  lastSettingsSnapshot = data || {};
  if(data && data.heroImageUrl){
    document.querySelector('.home-hero img').src = data.heroImageUrl;
  }
  if(data && data.aboutText){
    document.getElementById('aboutStoryText').textContent = data.aboutText;
  }
  renderGallery(data || {});
  renderSocialLinks(data || {});
  if(document.getElementById('adminPanel').classList.contains('show')){
    renderAdminAboutBox(data || {});
    renderAdminGalleryBox(data || {});
  }
});

// Gallery photos are stored as { galleryPhotos: { pushId1: "data:image/jpeg;base64,...", pushId2: "..." } }
// Keys are Firebase push-IDs so there's no fixed limit on how many photos can be added.
function getGalleryEntries(settings){
  const g = settings.galleryPhotos || {};
  return Object.entries(g).filter(([k,v])=>!!v); // [[key, dataUrlOrUrl], ...]
}

function getGalleryPhotos(settings){
  const entries = getGalleryEntries(settings);
  const urls = entries.map(([k,v])=>v);
  return urls.length > 0 ? urls : DEFAULT_GALLERY;
}

function renderGallery(settings){
  const photos = getGalleryPhotos(settings);
  const strip = document.getElementById('homePhotoStrip');
  const aboutGrid = document.getElementById('aboutGalleryGrid');
  const fullGrid = document.getElementById('galleryPageGrid');

  if(strip){
    strip.innerHTML = photos.slice(0, 8).map((url, i)=>
      `<img src="${url}" alt="The yaari cafe" loading="lazy" style="animation-delay:${i*0.08}s" onclick="openLightbox('${url.startsWith('data:') ? url : url}')" />`
    ).join('');
  }
  if(aboutGrid){
    aboutGrid.innerHTML = photos.slice(0, 3).map((url, i)=>
      `<img src="${url}" alt="The yaari cafe" loading="lazy" style="animation-delay:${i*0.07}s" onclick="openLightbox('${url}')" />`
    ).join('');
  }
  if(fullGrid){
    if(photos.length === 0){
      fullGrid.innerHTML = `<div class="gallery-empty"><div class="em">📷</div>Photos coming soon.</div>`;
    } else {
      fullGrid.innerHTML = photos.map((url, i)=>
        `<img src="${url}" alt="The yaari cafe" loading="lazy" style="animation-delay:${(i%9)*0.05}s" onclick="openLightbox('${url}')" />`
      ).join('');
    }
  }
}

window.openLightbox = function(url){
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('show');
};
window.closeLightbox = function(){
  document.getElementById('lightbox').classList.remove('show');
};

// ---------- Device photo upload (compressed client-side, stored as base64) ----------
function compressImageFile(file, maxWidth = 1000, quality = 0.7){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('Could not read image'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

window.handleGalleryUpload = async function(event){
  const files = Array.from(event.target.files || []);
  if(files.length === 0) return;
  const progressEl = document.getElementById('galleryUploadProgress');
  let done = 0;

  for(const file of files){
    if(progressEl) progressEl.textContent = `Uploading ${done+1} of ${files.length}...`;
    try{
      const dataUrl = await compressImageFile(file);
      const newRef = push(ref(db, 'restaurantSettings/galleryPhotos'));
      await set(newRef, dataUrl);
      done++;
    }catch(e){
      console.error('Upload failed for', file.name, e);
    }
  }

  if(progressEl) progressEl.textContent = done > 0 ? `✓ ${done} photo${done!==1?'s':''} added` : 'Upload failed';
  setTimeout(()=>{ if(progressEl) progressEl.textContent = ''; }, 2500);
  event.target.value = '';
  showToast(`${done} photo${done!==1?'s':''} added ✓`);
};

window.adminDeleteGalleryPhoto = async function(key){
  if(!confirm('Remove this photo from the gallery?')) return;
  try{
    await remove(ref(db, `restaurantSettings/galleryPhotos/${key}`));
    showToast('Photo removed');
  }catch(e){
    console.error(e);
    showToast('Failed to remove photo');
  }
};

function renderAdminGalleryBox(settings){
  const grid = document.getElementById('adminGalleryGrid');
  if(!grid) return;
  const entries = getGalleryEntries(settings);
  if(entries.length === 0){
    grid.innerHTML = `<div class="gallery-empty-admin">No photos uploaded yet — tap "Add Photos From Device" above to get started. (Default sample photos are shown to guests until you add your own.)</div>`;
    return;
  }
  grid.innerHTML = entries.map(([key, url], i)=>`
    <div class="admin-gallery-item" style="animation-delay:${(i%9)*0.04}s">
      <img src="${url}" alt="" onclick="openLightbox('${url}')" />
      <button class="agi-del" onclick="adminDeleteGalleryPhoto('${key}')">🗑️</button>
    </div>
  `).join('');
}

function renderSocialLinks(settings){
  const s = settings.socialLinks || {};
  const instagram = s.instagram || 'https://instagram.com/Shahi_Darbar_001';
  const facebook = s.facebook || '';
  const youtube = s.youtube || '';

  const wrap = document.getElementById('socialRow');
  if(!wrap) return;

  let html = `<a href="${escapeAttr(instagram)}" target="_blank" class="social-btn"><span class="sb-icon">📷</span>Instagram</a>`;
  html += facebook
    ? `<a href="${escapeAttr(facebook)}" target="_blank" class="social-btn"><span class="sb-icon">👍</span>Facebook</a>`
    : `<a href="#" class="social-btn" style="opacity:0.4;pointer-events:none;"><span class="sb-icon">👍</span>Facebook</a>`;
  html += youtube
    ? `<a href="${escapeAttr(youtube)}" target="_blank" class="social-btn"><span class="sb-icon">▶️</span>YouTube</a>`
    : `<a href="#" class="social-btn" style="opacity:0.4;pointer-events:none;"><span class="sb-icon">▶️</span>YouTube</a>`;

  wrap.innerHTML = html;
}

function renderAdminAboutBox(settings){
  const box = document.getElementById('adminAboutBox');
  if(!box) return;
  const sl = settings.socialLinks || {};

  box.innerHTML = `
    <div class="admin-settings-block">
      <div class="admin-settings-head">🏡 Home Page</div>
      <label class="admin-settings-label">Hero Photo URL</label>
      <input type="text" class="admin-photo-input" style="width:100%;"
        placeholder="Paste photo URL (leave empty to use default restaurant photo)"
        value="${settings.heroImageUrl ? escapeAttr(settings.heroImageUrl) : ''}"
        onchange="adminUpdateSettings('heroImageUrl', this.value)" />
    </div>

    <div class="admin-settings-block">
      <div class="admin-settings-head">🪑 Tables</div>
      <label class="admin-settings-label">Total Number of Tables</label>
      <input type="number" class="admin-photo-input" style="width:100%;" min="1" max="50"
        placeholder="10"
        value="${settings.totalTables || 10}"
        onchange="adminUpdateSettings('totalTables', Math.max(1, Math.min(50, Number(this.value)||10)))" />
      <div class="admin-settings-desc" style="margin-top:6px;">Customer/waiter app ke order screen mein utni hi table-number buttons dikhengi (1 se yahan tak).</div>
    </div>

    <div class="admin-settings-block">
      <div class="admin-settings-head">📖 About Us Story</div>
      <label class="admin-settings-label">Story Text</label>
      <textarea class="admin-settings-textarea" onchange="adminUpdateSettings('aboutText', this.value)">${settings.aboutText ? escapeAttr(settings.aboutText) : ''}</textarea>
    </div>

    <div class="admin-settings-block">
      <div class="admin-settings-head">🔗 Social Media Links</div>
      <label class="admin-settings-label">Instagram</label>
      <input type="text" class="admin-photo-input" style="width:100%;margin-bottom:12px;"
        placeholder="https://instagram.com/yourpage"
        value="${sl.instagram ? escapeAttr(sl.instagram) : 'https://instagram.com/Shahi_Darbar_001'}"
        onchange="adminUpdateSettings('socialLinks/instagram', this.value)" />
      <label class="admin-settings-label">Facebook</label>
      <input type="text" class="admin-photo-input" style="width:100%;margin-bottom:12px;"
        placeholder="https://facebook.com/yourpage"
        value="${sl.facebook ? escapeAttr(sl.facebook) : ''}"
        onchange="adminUpdateSettings('socialLinks/facebook', this.value)" />
      <label class="admin-settings-label">YouTube</label>
      <input type="text" class="admin-photo-input" style="width:100%;"
        placeholder="https://youtube.com/@yourchannel"
        value="${sl.youtube ? escapeAttr(sl.youtube) : ''}"
        onchange="adminUpdateSettings('socialLinks/youtube', this.value)" />
    </div>
  `;
}

window.adminUpdateSettings = async function(field, value){
  try{
    await set(ref(db, `restaurantSettings/${field}`), value);
    showToast('Saved ✓');
  }catch(e){
    console.error(e);
    showToast('Failed to save');
  }
};

// ---------- ADMIN SUB-TAB SWITCHING (Menu / About / Gallery) ----------
window.adminSwitchTab = function(tab){
  document.querySelectorAll('.admin-subtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.admin-subpage').forEach(p=>p.classList.remove('active'));
  document.querySelector(`.admin-subtab[data-atab="${tab}"]`).classList.add('active');
  document.getElementById('adminPage' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
};

// ---------- INIT ----------
renderFilters();
renderMenu();
updateCartBar();
renderReviews();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// ============================================================
// SPLASH INTRO — dismiss after first paint
// ============================================================
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const splash = document.getElementById('splash');
    if(splash) splash.classList.add('hide');
  }, 1000);
});
// Safety net in case 'load' fires very late (slow network)
setTimeout(()=>{
  const splash = document.getElementById('splash');
  if(splash) splash.classList.add('hide');
}, 2600);

// ============================================================
// SCROLL REVEAL — fade/scale elements in as they enter view
// ============================================================
(function initScrollReveal(){
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion){
    document.querySelectorAll('.reveal, .reveal-scale').forEach(el=>el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-scale').forEach(el=>io.observe(el));
})();
