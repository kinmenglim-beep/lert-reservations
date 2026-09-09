/* =========================================================================
   LERT LERT — shared constants & helpers, used by both index.html (customer)
   and staff.html (staff). Keeping this in one file means the booking-rules
   logic (slot times, table allocation, closures) can never drift between
   the two pages. Load supabase-js before this file.
   ========================================================================= */

const SUPABASE_URL = "https://qledqzcypmnwynkhsgcr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__LtkwbrnkmUlt0KqxQWS3w_o_1mxDwN";
const STAFF_EMAIL = "staff@lert-lert.internal";
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_NAME = "LERT LERT";
const DEFAULT_PHONE = "+60 11-5933 1738";
const MAX_PAX = 12;

const SESSION_DEFS = {
  lunch:  { label: "Lunch Service",  open: [11,30], close: [14,30], days: [0,6] },
  dinner: { label: "Dinner Service", open: [18,0],  close: [22,30], days: [2,3,4,5,6,0] }
};
const SESSION_ORDER = ["lunch","dinner"];

const DEFAULT_TABLES = [
  {id:"A1",cap:2,group:null},{id:"A2",cap:2,group:null},{id:"A3",cap:2,group:null},
  {id:"A4",cap:2,group:null},{id:"A5",cap:2,group:null},{id:"A6",cap:2,group:null},
  {id:"B1",cap:4,group:null},{id:"B2",cap:4,group:null},{id:"B3",cap:4,group:null},{id:"B4",cap:4,group:null},
  {id:"C1",cap:6,group:null},{id:"C2",cap:6,group:null},{id:"C3",cap:6,group:null},{id:"C4",cap:6,group:null},
  {id:"D1",cap:8,group:null}
];
const DEFAULT_SETTINGS = {
  restaurantName: DEFAULT_NAME,
  restaurantPhone: DEFAULT_PHONE,
  maxPaxPerSlot: 30,
  terms: [
    "Please arrive on time — we can only seat your full party once everyone has arrived.",
    "Each seating is held for 90 minutes.",
    "Reservations can be changed or cancelled free of charge up to 1 hour before your seating time, via Manage Booking.",
    "No deposit needed — we just ask you to honour your booking."
  ]
};

/* ---------------- time helpers ---------------- */
function ymd(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function todayObj(){ return new Date(); }
function nowMinutes(){ const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function fmtTime(mins){
  let h=Math.floor(mins/60), m=mins%60;
  const ap = h>=12?"PM":"AM";
  let h12 = h%12; if(h12===0) h12=12;
  return h12+":"+String(m).padStart(2,"0")+" "+ap;
}
function fmtDateLong(dateStr){
  const [y,m,d]=dateStr.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  return dt.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
}
function slotsFor(sessionKey){
  const {open,close}=SESSION_DEFS[sessionKey];
  const openMin=open[0]*60+open[1], closeMin=close[0]*60+close[1];
  const slots=[]; let t=openMin;
  while(t+90<=closeMin){ slots.push(t); t+=45; }
  return slots;
}
function sessionsForDateStr(dateStr){
  const [y,m,d]=dateStr.split("-").map(Number);
  const dow = new Date(y,m-1,d).getDay();
  return SESSION_ORDER.filter(k=>SESSION_DEFS[k].days.includes(dow));
}
function isToday(dateStr){ return dateStr===ymd(todayObj()); }
function genCode(){
  const chars="ACDEFGHJKLMNPQRTUVWXY34679";
  let s=""; for(let i=0;i<6;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function genId(){ return "r_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function normPhone(p){ return String(p||"").replace(/\D/g,""); }

/* ---------------- closures ----------------
   Reads `state.closures` — each page defines its own `state` object before
   these are ever called, so the lookup resolves fine at call time. */
function isDateClosed(dateStr){ return state.closures.some(c=>c.date===dateStr && c.session===null && c.slot===null); }
function isSessionClosed(dateStr, session){ return isDateClosed(dateStr) || state.closures.some(c=>c.date===dateStr && c.session===session && c.slot===null); }
function isSlotClosed(dateStr, session, slot){ return isSessionClosed(dateStr, session) || state.closures.some(c=>c.date===dateStr && c.session===session && c.slot===slot); }

/* ---------------- allocation engine ---------------- */
function combos(arr,size){
  const results=[];
  (function rec(start,chosen){
    if(chosen.length===size){ results.push(chosen.slice()); return; }
    for(let i=start;i<arr.length;i++){ chosen.push(arr[i]); rec(i+1,chosen); chosen.pop(); }
  })(0,[]);
  return results;
}
function occupiedTableIds(reservations, date, session, slots, slotIdx, excludeId){
  const relevant = new Set([slotIdx]);
  if(slotIdx>0) relevant.add(slotIdx-1);
  const ids = new Set();
  reservations.forEach(r=>{
    if(excludeId && r.id===excludeId) return;
    if(r.date===date && r.session===session && (r.status==="confirmed"||r.status==="seated")){
      const idx = slots.indexOf(r.slot);
      if(relevant.has(idx)) (r.tables||[]).forEach(t=>ids.add(t));
    }
  });
  return ids;
}
function findAllocation(pax, tables, occupiedIds){
  const free = tables.filter(t=>!occupiedIds.has(t.id));
  const buckets = {};
  free.forEach(t=>{ const key = t.group ? ("g:"+t.group) : ("t:"+t.id); (buckets[key]=buckets[key]||[]).push(t); });
  let best=null;
  Object.values(buckets).forEach(bucket=>{
    const sorted = bucket.slice().sort((a,b)=>a.cap-b.cap);
    const maxSize = Math.min(6, sorted.length);
    for(let size=1; size<=maxSize; size++){
      let localBest=null;
      combos(sorted,size).forEach(combo=>{
        const sum=combo.reduce((s,t)=>s+t.cap,0);
        if(sum>=pax){ const waste=sum-pax; if(!localBest||waste<localBest.waste) localBest={combo,waste}; }
      });
      if(localBest){
        if(!best || localBest.waste<best.waste || (localBest.waste===best.waste && localBest.combo.length<best.combo.length)) best=localBest;
        break;
      }
    }
  });
  return best ? best.combo : null;
}
function slotSessionPax(date, session, slot, excludeId){
  return state.reservations.filter(r=>r.date===date && r.session===session && r.slot===slot && r.id!==excludeId && (r.status==="confirmed"||r.status==="seated"))
    .reduce((s,r)=>s+r.pax,0);
}
function slotFeasible(date, session, slot, pax, excludeId){
  if(isSlotClosed(date, session, slot)) return null;
  const bookedPax = slotSessionPax(date, session, slot, excludeId);
  if(bookedPax + pax > state.settings.maxPaxPerSlot) return null;
  const slots = slotsFor(session);
  const idx = slots.indexOf(slot);
  const occ = occupiedTableIds(state.reservations, date, session, slots, idx, excludeId);
  return findAllocation(pax, state.tables, occ);
}
function computeNowTag(dateStr){
  if(dateStr!==ymd(todayObj())) return null;
  const nowM = nowMinutes();
  let allSlots = [];
  sessionsForDateStr(dateStr).forEach(sKey=>{
    if(isSessionClosed(dateStr,sKey)) return;
    slotsFor(sKey).forEach(sl=>{ if(!isSlotClosed(dateStr,sKey,sl)) allSlots.push({session:sKey, slot:sl}); });
  });
  allSlots.sort((a,b)=>a.slot-b.slot);
  if(allSlots.length===0) return null;
  if(nowM < allSlots[0].slot) return allSlots[0];
  for(const x of allSlots){ if(nowM>=x.slot && nowM<x.slot+45) return x; }
  return null;
}

/* ---------------- config / settings (read on both pages, written only by staff) ---------------- */
async function configGet(key){
  const { data, error } = await _sb.from("app_config").select("value").eq("key", key).maybeSingle();
  if(error || !data) return null;
  return { value: data.value };
}
async function configSet(key, value){ await _sb.from("app_config").upsert({ key, value }); }
async function loadTablesConfig(){
  try{
    const r = await configGet("tables-config");
    if(r && r.value){
      const val = JSON.parse(r.value);
      if(Array.isArray(val)) return { tables: val.map(t=>({...t, group:t.group||null})), groups: [] };
      return { tables: (val.tables||[]).map(t=>({...t, group:t.group||null})), groups: val.groups||[] };
    }
  }catch(e){}
  return { tables: DEFAULT_TABLES.map(t=>({...t})), groups: [] };
}
async function loadSettings(){
  try{ const r = await configGet("settings"); if(r && r.value) return {...DEFAULT_SETTINGS, ...JSON.parse(r.value)}; }catch(e){}
  return {...DEFAULT_SETTINGS};
}
async function loadClosures(){
  try{ const r = await configGet("closures"); if(r && r.value) return JSON.parse(r.value); }catch(e){}
  return [];
}
async function loadReservations(){
  const { data, error } = await _sb.from("reservations_public").select("*");
  if(error || !data) return [];
  return data.map(r=>({ id:r.id, date:r.date, session:r.session, slot:r.slot, tables:r.tables||[], pax:r.pax, status:r.status }));
}

/* ---------------- utils ---------------- */
function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
