// Node.js server para sa Reels AI Comment — walang kailangang i-install (built-in modules lang, Node 18+)
// Takbo:  node server.js

const http = require("http");

// ====== SETTINGS (puwedeng palitan gamit ang environment variables) ======
const PORT        = Number(process.env.PORT || 3000);
const HOST        = process.env.HOST || "0.0.0.0";      // 0.0.0.0 = abot ng phone sa parehong Wi-Fi
const AUTH_TOKEN  = process.env.AUTH_TOKEN || "";          // REQUIRED: kapareho ng token sa app
const AI_BASE_URL = process.env.AI_BASE_URL || "http://127.0.0.1:10100/v1";
const AI_MODEL    = process.env.AI_MODEL || "auto";   // "auto" = hahanapin ang may "luna" sa pangalan
const AI_API_KEY  = process.env.AI_API_KEY || "";
const MIN_GAP_SEC = Number(process.env.MIN_GAP_SEC || 2);  // pinakamaikling pagitan ng 2 comment SA ISANG BROWSER
const MAX_TRIES   = Number(process.env.MAX_TRIES || 3);    // ilang beses uulitin kung kinopya lang ng AI ang caption
// ========================================================================

const SYSTEM_PROMPT =
  "You write short, natural Instagram comments like a real viewer who actually watched the Reel and has something specific to say about it. " +
  "Write ONE comment (1-2 short sentences, under 160 characters) that is meaningful and thoughtful: react to a specific idea, detail, skill, emotion, or lesson in THIS video's topic. " +
  "Show you understood the content (add an insight, a relatable observation, a genuine appreciation, or a small personal-feeling takeaway). " +
  "NEVER repeat, quote, or summarize the caption. Do not copy its wording. " +
  "FORBIDDEN: attention-bait or engagement-bait lines such as 'stop scrolling', 'keep scrolling', 'you need to watch this', 'wait for it', 'part 2', 'follow for more', 'link in bio', 'underrated', 'who's here in 2024', 'first', 'this is fire', 'nice post', 'love this', 'so true' on their own. " +
  "No hashtags, at most one emoji, never mention being an AI. " +
  "Reply in the same language as the caption. Output ONLY the comment text, nothing else.\n\n" +
  "Examples of the style (caption -> comment):\n" +
  "Ranking the best CS2 funny moments -> CS2 somehow turns the most serious rounds into comedy.\n" +
  "How to make crispy fried chicken at home -> The double-dredge trick is honestly what makes the crunch last.\n" +
  "Sunset hike at Mt. Pulag, worth the 4am wake-up -> Moments like this make the early wake-up totally worth it.\n" +
  "Stop scrolling! 3 budgeting rules that changed my life -> Paying yourself first before spending is the rule that quietly changes everything.";

// Mga generic / bait na linya na hindi dapat lumabas sa comment
const BANNED = /\b(stop(ped)?\s+scrolling|keep\s+scrolling|scroll(ing)?\s+(past|by|down)|you\s+(need|have|must)\s+to\s+(watch|see)|wait\s+for\s+it|part\s*2|follow\s+(me\s+)?for\s+more|link\s+in\s+bio|nice\s+(post|video|reel|one)|great\s+(post|video|reel)|love\s+this|so\s+true|this\s+is\s+fire|underrated|first\b)/i;

const recent = [];            // huling mga comment para hindi maulit
const lastGenBy = new Map();   // huling comment bawat browser (clientId) — hiwalay ang pagitan ng bawat browser
let queue = Promise.resolve(); // pila: isa-isang tinatawag ang AI kahit sabay-sabay ang mga browser

const aiHeaders = () => {
  const h = { "Content-Type": "application/json" };
  if (AI_API_KEY) h.Authorization = "Bearer " + AI_API_KEY;
  return h;
};

let modelCache = null; // i-cache para hindi na tatawag sa /models bawat comment (nakakatipid ng oras)
async function pickModel() {
  if (AI_MODEL !== "auto") return AI_MODEL;
  if (modelCache) return modelCache;
  const r = await fetch(AI_BASE_URL + "/models", { headers: aiHeaders() });
  const ids = ((await r.json()).data || []).map(m => m.id);
  modelCache = ids.find(id => /luna/i.test(id)) || ids[0];
  return modelCache;
}

// Linisin ang caption: tanggalin ang hashtags at "Keywords ..." na buntot para hindi ito ang kopyahin ng AI
function cleanCaption(t) {
  return String(t || "")
    .split(/\bkeywords?\b\s*[:\-]?/i)[0]
    .replace(/\b(stop|keep)\s+scrolling\b[!.,:\s]*/gi, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

const norm = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Kinopya ba ng AI ang caption? (substring o sobrang daming magkakatulad na 4-word na hanay)
function isEcho(out, caption) {
  const o = norm(out), c = norm(caption);
  if (!o) return true;
  if (o.length > 15 && c.includes(o)) return true;
  const w = o.split(" ");
  if (w.length < 4) return false;
  const cs = new Set(), cw = c.split(" ");
  for (let i = 0; i + 4 <= cw.length; i++) cs.add(cw.slice(i, i + 4).join(" "));
  let hit = 0, total = 0;
  for (let i = 0; i + 4 <= w.length; i++) { total++; if (cs.has(w.slice(i, i + 4).join(" "))) hit++; }
  return total > 0 && hit / total >= 0.4;
}

function cleanOutput(raw) {
  let t = String(raw || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  t = (t.split(/\n+/).map(x => x.trim()).find(Boolean) || "")      // unang linya lang
    .replace(/^(comment|reply)\s*:\s*/i, "")
    .replace(/^(\d+[.)]|[-*•])\s+/, "")                            // numbering / bullet
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/^[\"“”'`]+|[\"“”'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 220);
}

async function askAI(model, caption, comments, retryNote, temperature) {
  const ctx = comments.length ? "\n\nSome other comments on this post (mood/context only — do NOT copy them):\n- " + comments.join("\n- ") : "";
  const avoid = recent.length ? "\n\nYour previous comments (write something different from these):\n- " + recent.join("\n- ") : "";
  const user =
    "Post caption (reference only — never repeat it):\n\"\"\"\n" + caption + "\n\"\"\"" + ctx + avoid +
    "\n\nNow write your own NEW short comment reacting to this topic." + (retryNote || "");
  const r = await fetch(AI_BASE_URL + "/chat/completions", {
    method: "POST",
    headers: aiHeaders(),
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 80,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user }
      ]
    })
  });
  if (!r.ok) throw new Error("AI server error " + r.status);
  const j = await r.json();
  return cleanOutput(j.choices?.[0]?.message?.content);
}

async function generate(rawCaption, comments) {
  const caption = cleanCaption(rawCaption) || String(rawCaption).slice(0, 600);
  const model = await pickModel();
  let note = "", last = "";
  for (let i = 0; i < MAX_TRIES; i++) {
    const text = await askAI(model, caption, comments, note, Math.min(0.7 + i * 0.15, 1.0));
    last = text;
    const bad = !text || text.length < 25 || text.split(/\s+/).length < 5 || BANNED.test(text) || isEcho(text, caption) || recent.some(p => norm(p) === norm(text));
    if (!bad) return text;
    console.log(`  ↻ try ${i + 1}: tinanggihan (${text ? "kinopya/umulit" : "walang laman"}): ${text.slice(0, 60)}`);
    note = "\n\nIMPORTANT: Your last answer was rejected: it was generic, bait-like (e.g. \"stop scrolling\"), or repeated the caption/an earlier comment. Write a specific, thoughtful reaction to the actual topic of the video, in your own words.";
  }
  throw new Error("Walang magandang sagot ang AI (kinopya ang caption o inulit ang dati) — pindutin ulit, o palitan ang AI_MODEL");
}

function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "GET" && req.url === "/health")
    return send(res, 200, { ok: true, ai: AI_BASE_URL, model: AI_MODEL });

  if (req.method === "POST" && req.url === "/comment") {
    if (!AUTH_TOKEN || req.headers["x-token"] !== AUTH_TOKEN) return send(res, 401, { ok: false, error: "Wrong or missing token" });
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      try {
        let data = {};
        try { data = JSON.parse(body || "{}"); } catch { return send(res, 400, { ok: false, error: "Maling data" }); }
        const caption = String(data.caption || "").trim().slice(0, 3000);
        if (!caption) return send(res, 400, { ok: false, error: "Walang caption" });
        const comments = (Array.isArray(data.comments) ? data.comments : [])
          .map(c => String(c).slice(0, 220)).slice(0, 6);

        const cid = String(data.clientId || req.socket.remoteAddress || "x").slice(0, 64);
        const wait = Math.ceil(((lastGenBy.get(cid) || 0) + MIN_GAP_SEC * 1000 - Date.now()) / 1000);
        if (wait > 0) return send(res, 429, { ok: false, error: `Sandali lang — maghintay ng ${wait}s bago ulit mag-comment` });
        lastGenBy.set(cid, Date.now());

        // pumila: kapag may ibang browser na gumagamit ng AI, maghihintay ang isa (hindi mag-e-error)
        const job = queue.then(() => generate(caption, comments));
        queue = job.catch(() => {});
        const text = await job;
        lastGenBy.set(cid, Date.now());
        recent.push(text); if (recent.length > 8) recent.shift();
        console.log(`[${new Date().toLocaleTimeString()}] (${cid.slice(0, 6)}) "${cleanCaption(caption).slice(0, 50)}..." -> ${text}`);
        send(res, 200, { ok: true, text });
      } catch (e) {
        console.error("Error:", e.message);
        send(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  send(res, 404, { ok: false, error: "Not found" });
});

if (!AUTH_TOKEN) { console.error("Set AUTH_TOKEN first, e.g.  set AUTH_TOKEN=mysecret  (Windows)  /  AUTH_TOKEN=mysecret node server.js"); process.exit(1); }
server.listen(PORT, HOST, () => {
  console.log(`✅ Comment server: http://${HOST}:${PORT}`);
  console.log(`   AI: ${AI_BASE_URL}  (model: ${AI_MODEL})`);
});
