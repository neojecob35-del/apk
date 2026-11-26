// Assist helpers: every action is started by YOUR tap on a button. Nothing runs automatically.
(() => {
  if (window.RLS) return;
  const LIKE = ["Like", "Gusto"], UNLIKE = ["Unlike", "Hindi na gusto"];
  const SAVE = ["Save", "I-save"], UNSAVE = ["Remove", "Unsave", "Alisin"];
  const COMMENT = ["Comment", "Magkomento"];
  const ALL = [...LIKE, ...UNLIKE, ...SAVE, ...UNSAVE];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toast = m => { try { Android.toast(String(m)); } catch (e) {} };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  function findIcon(labels) {
    const sel = labels.map(l => `svg[aria-label="${l}"]`).join(",");
    const mid = window.innerHeight / 2;
    let best = null, bestDist = Infinity;
    document.querySelectorAll(sel).forEach(svg => {
      const r = svg.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return;
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestDist) { best = svg; bestDist = d; }
    });
    return best;
  }
  const click = svg => (svg.closest('[role="button"], button') || svg.parentElement).click();

  const EDITABLE = 'textarea, input[type="text"], input:not([type]), [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
  const PLACEHOLDER_RE = /^\s*(add a comment|magdagdag ng (komento|comment))/i;
  const attrsOf = el => ["placeholder", "aria-label", "aria-placeholder", "data-placeholder"]
    .map(a => el.getAttribute(a)).filter(Boolean).join(" ");

  function findPlaceholderEl() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!PLACEHOLDER_RE.test(n.nodeValue || "")) continue;
      const el = n.parentElement;
      if (el && visible(el)) return el;
    }
    return null;
  }
  function editableNear(el) {
    let p = el;
    for (let i = 0; i < 6 && p && p !== document.body; i++, p = p.parentElement) {
      if (p.matches(EDITABLE) && visible(p)) return p;
      const hit = [...p.querySelectorAll(EDITABLE)].find(visible);
      if (hit) return hit;
    }
    return null;
  }
  function commentBox() {
    const cands = [...document.querySelectorAll(EDITABLE)].filter(visible);
    let hit = cands.find(el => /comment|komento/i.test(attrsOf(el)));
    if (hit) return hit;
    const ph = findPlaceholderEl();
    return ph ? (ph.closest(EDITABLE) || editableNear(ph)) : null;
  }
  async function focusCommentBox() {
    const ph = findPlaceholderEl();
    if (!ph) return null;
    ph.click();
    await sleep(250);
    const a = document.activeElement;
    return a && a !== document.body && (a.matches(EDITABLE) || a.isContentEditable) ? a : null;
  }

  function getCaption() {
    const icon = findIcon(COMMENT) || findIcon(ALL);
    let c = icon;
    while (c && c !== document.body && !c.querySelector("video")) c = c.parentElement;
    if (!c || c === document.body) c = document.body;
    let best = "";
    c.querySelectorAll("span").forEach(sp => {
      if (sp.closest('button, [role="button"], [role="dialog"]')) return;
      const t = (sp.innerText || "").trim();
      if (t.length > best.length && t.length > 15) best = t;
    });
    return (best || c.innerText || "")
      .split(/\bkeywords?\b\s*[:\-]?/i)[0]
      .replace(/#[\p{L}\p{N}_]+/gu, " ")
      .replace(/\s+/g, " ").trim().slice(0, 600);
  }

  window.RLS = {
    like() {
      const b = findIcon(LIKE);
      if (b) { click(b); toast("Liked"); }
      else toast(findIcon(UNLIKE) ? "Already liked" : "Like button not found");
    },
    save() {
      const b = findIcon(SAVE);
      if (b) { click(b); toast("Saved"); }
      else toast(findIcon(UNSAVE) ? "Already saved" : "Save button not found");
    },
    draft() {
      const caption = getCaption();
      if (!caption) { toast("No caption found"); return; }
      toast("Drafting...");
      Android.requestDraft(caption);
    },
    // Puts text in the comment box. It NEVER presses Post: you read, edit and post it yourself.
    async fill(text) {
      let box = commentBox();
      if (!box) {
        const ic = findIcon(COMMENT);
        if (ic) click(ic);
        for (let i = 0; i < 30 && !box; i++) { await sleep(100); box = commentBox(); }
      }
      if (!box) box = await focusCommentBox();
      if (!box) { toast("Comment box not found"); return; }
      box.focus();
      if (box.isContentEditable) {
        document.execCommand("selectAll");
        document.execCommand("insertText", false, text);
      } else {
        const proto = box.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
      toast("Draft ready - edit it, then tap Post yourself");
    }
  };
})();
