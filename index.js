import { chromium } from "@playwright/test";
import fs from "fs";

const URL = process.env.PRODUCT_URL; // set in Secrets
const IN = (process.env.IN_STOCK || "add to cart,in stock,buy now").toLowerCase().split(",").map(s=>s.trim());
const OUT = (process.env.OUT_OF_STOCK || "out of stock,unavailable,sold out").toLowerCase().split(",").map(s=>s.trim());
const BUTTON_SELECTOR = process.env.BUTTON_SELECTOR || "";
const STABILITY = Number(process.env.STABILITY || 2);
const STATE_FILE = ".state.json";

function loadState(){ return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE,"utf8")) : { lastStable:null, window:[] }; }
function saveState(s){ fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }

(async ()=>{
  if (!URL){ console.error("Missing PRODUCT_URL"); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });

  let detected = false;
  if (BUTTON_SELECTOR){
    const btn = page.locator(BUTTON_SELECTOR).first();
    if (await btn.count()){
      detected = await btn.isEnabled();
    }
  }
  if (!detected){
    const html = (await page.content()).toLowerCase();
    const hasIn = IN.some(p=>html.includes(p));
    const hasOut = OUT.some(p=>html.includes(p));
    detected = hasIn && !hasOut ? true : hasOut && !hasIn ? false : false;
  }
  await browser.close();

  const state = loadState();
  state.window.push(detected);
  if (state.window.length > STABILITY) state.window.shift();
  const allTrue = state.window.length===STABILITY && state.window.every(v=>v);
  const allFalse = state.window.length===STABILITY && state.window.every(v=>!v);
  const stableNow = allTrue ? true : allFalse ? false : state.lastStable;

  if (state.lastStable===null){
    state.lastStable = stableNow; saveState(state);
    console.log(`[init] ${stableNow ? "IN" : "OUT"}`); process.exit(0);
  }

  if (stableNow !== state.lastStable){
    state.lastStable = stableNow; saveState(state);
    const status = stableNow ? "IN STOCK 🎉" : "OUT OF STOCK";
    console.log(`[change] ${status} → ${URL}`);
    // expose for email/telegram steps via stdout
    console.log(`::set-output name=status::${status}`);
    console.log(`::set-output name=url::${URL}`);
    // write timestamp for backup dedupe (Actions artifacts / summary are enough as signal)
  } else {
    saveState(state);
    console.log(`[tick] ${state.lastStable ? "IN" : "OUT"}`);
  }
})();

