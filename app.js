(() => {
  "use strict";

  // ── Données ──────────────────────────────────────────────
  // WORDS : [mot, traduction, sens, synonymes, niveau, nature, exemple, source]
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const DB = new Map();
  for (const [w, fr, def, syn, lvl, pos, ex, src] of WORDS) {
    DB.set(w, {
      w, fr, def, lvl: LEVELS.includes(lvl) ? lvl : "B2", pos: pos || "", ex: ex || "", src: src || "",
      syn: (syn || "").split(",").map(s => s.trim()).filter(Boolean),
    });
  }
  const byLevel = {};
  LEVELS.forEach(l => byLevel[l] = []);
  for (const e of DB.values()) byLevel[e.lvl].push(e);

  const KEY = "scifi-vocab-v1";
  const TEST_EVERY = 10;      // rappel de test tous les N swipes
  const TEST_SIZE = 10;       // questions max par test de révision
  const LEVEL_TEST_SIZE = 20; // questions par test de niveau (réponses à taper)
  const LEVEL_PASS = 17;      // bonnes réponses minimum pour réussir un test (85 %)
  // Nombre de tests réussis (avec des mots différents) pour valider chaque niveau
  const TESTS_REQUIRED = { A1: 10, A2: 10, B1: 12, B2: 15, C1: 18, C2: 20 };
  const AGAIN_GAP = 5;        // un mot "encore" revient N cartes plus loin

  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // state.status[word] = "learning" (vu, à tester) | "known" (validé)
  // state.deck = file des mots inconnus (à swiper), dans l'ordre
  // state.retry[word] = true si raté au test
  // state.levels = niveaux affichés dans la pile ; state.sf = seulement le vocabulaire SF
  // state.lt[lvl] = { passed: nb de tests réussis, used: mots déjà tirés, best, date (validation) }
  function load() {
    let s;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== "object") s = {};
    s.status = s.status || {};
    s.retry = s.retry || {};
    delete s.validated; // anciennes validations par QCM : plus valables
    s.lt = s.lt || {};
    LEVELS.forEach(l => { s.lt[l] = Object.assign({ passed: 0, used: [], date: null }, s.lt[l]); });
    s.deck = Array.isArray(s.deck) ? s.deck : [];
    s.sinceTest = s.sinceTest || 0;
    s.levels = Array.isArray(s.levels) ? s.levels.filter(l => LEVELS.includes(l)) : [];
    if (!s.levels.length) s.levels = ["B2"];
    s.sf = !!s.sf;

    for (const w of Object.keys(s.status)) if (!DB.has(w)) delete s.status[w];
    const inDeck = new Set();
    s.deck = s.deck.filter(w => DB.has(w) && !s.status[w] && !inDeck.has(w) && inDeck.add(w));
    const fresh = [...DB.keys()].filter(w => !s.status[w] && !inDeck.has(w));
    s.deck.push(...shuffle(fresh));
    return s;
  }
  let state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  save();

  const learningWords = () => Object.keys(state.status).filter(w => state.status[w] === "learning");
  const knownCount = () => Object.values(state.status).filter(v => v === "known").length;
  const matches = w => { const e = DB.get(w); return state.levels.includes(e.lvl) && (!state.sf || e.src); };
  const visibleDeck = (n = Infinity) => {
    const out = [];
    for (const w of state.deck) { if (matches(w)) { out.push(w); if (out.length >= n) break; } }
    return out;
  };

  // ── UI commune ───────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, s = "s") => n > 1 ? s : "";

  function updateStats() {
    const toTest = learningWords().length;
    $("st-new").textContent = visibleDeck().length;
    $("st-test").textContent = toTest;
    $("st-known").textContent = knownCount();
    $("badge").textContent = toTest;
    $("badge").classList.toggle("hidden", toTest === 0);
  }

  let currentView = "learn";
  function show(view, opts) {
    currentView = view;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    if (view === "test") opts && opts.level ? startLevelTest(opts.level) : startReview();
    else if (view === "levels") renderLevels();
    else renderLearn();
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => show(t.dataset.view)));

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  // ── Mode apprentissage (swipe) ───────────────────────────
  const deckEl = $("deck");
  let busy = false;

  function renderChips() {
    const counts = {};
    for (const w of state.deck) { const e = DB.get(w); if (!state.sf || e.src) counts[e.lvl] = (counts[e.lvl] || 0) + 1; }
    $("chips").innerHTML = LEVELS.map(l =>
      `<button class="chip lv-${l} ${state.levels.includes(l) ? "on" : ""}" data-l="${l}" title="${counts[l] || 0} mots à voir">${l}</button>`
    ).join("") + `<button class="chip sf ${state.sf ? "on" : ""}" data-sf="1" title="Seulement le vocabulaire des romans de SF">🚀 SF</button>`;
    $("chips").querySelectorAll(".chip").forEach(c => c.onclick = () => {
      if (c.dataset.sf) state.sf = !state.sf;
      else {
        const l = c.dataset.l;
        if (state.levels.includes(l)) { if (state.levels.length > 1) state.levels = state.levels.filter(x => x !== l); }
        else state.levels.push(l);
      }
      save(); renderLearn();
    });
  }

  function cardHTML(e) {
    const retry = state.retry[e.w];
    return `
      <div class="tags">
        <span class="lvl">${e.lvl}</span>
        ${retry ? `<span class="src retry">↺ À revoir</span>` : ""}
        ${e.src ? `<span class="src">${esc(e.src)}</span>` : ""}
        ${e.pos ? `<span class="pos">${esc(e.pos)}</span>` : ""}
      </div>
      <div class="word">${esc(e.w)}</div>
      <div class="fr">${esc(e.fr)}</div>
      <hr>
      <div class="label">Sens</div>
      <div class="def">${esc(e.def)}</div>
      ${e.ex ? `<div class="ex">${esc(e.ex)}</div>` : ""}
      ${e.syn.length ? `<div class="label">Synonymes</div>
      <div class="syns">${e.syn.map(s => `<span>${esc(s)}</span>`).join("")}</div>` : ""}
      <div class="stamp yes">VU ✓</div>
      <div class="stamp no">ENCORE</div>`;
  }

  let topWord = null;
  function renderLearn() {
    updateStats();
    renderChips();
    deckEl.innerHTML = "";
    const vis = visibleDeck(2);
    topWord = vis[0] || null;
    if (!vis.length) {
      const n = learningWords().length;
      deckEl.innerHTML = `<div class="empty"><div class="big">🚀</div><h3>Tout est vu ici !</h3>
        <p>Plus aucun mot à découvrir pour ${state.levels.join(", ")}${state.sf ? " (SF)" : ""}. Active un autre niveau ci-dessus.</p>
        ${n ? `<p>${n} mot${plural(n)} à valider dans l'onglet Test.</p><button class="primary" id="go-test">Faire le test</button>` : ""}</div>`;
      const b = $("go-test"); if (b) b.onclick = () => show("test");
      return;
    }
    vis.slice().reverse().forEach((w, i, arr) => {
      const e = DB.get(w);
      const el = document.createElement("div");
      el.className = `card lv-${e.lvl}` + (i < arr.length - 1 ? " behind" : "");
      el.innerHTML = cardHTML(e);
      deckEl.appendChild(el);
    });
    attachDrag(deckEl.lastElementChild);
  }

  function attachDrag(card) {
    let x0 = 0, y0 = 0, dx = 0, t0 = 0, dragging = false;
    const yes = card.querySelector(".stamp.yes"), no = card.querySelector(".stamp.no");

    card.addEventListener("pointerdown", e => {
      if (busy) return;
      dragging = true; x0 = e.clientX; y0 = e.clientY; dx = 0; t0 = Date.now();
      card.classList.add("dragging");
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener("pointermove", e => {
      if (!dragging) return;
      dx = e.clientX - x0;
      const dy = (e.clientY - y0) * 0.25;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("dragging");
      const fast = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.6 && Math.abs(dx) > 40;
      if (Math.abs(dx) > 100 || fast) swipe(dx > 0 ? "right" : "left");
      else { card.style.transform = ""; yes.style.opacity = no.style.opacity = 0; }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  function swipe(dir) {
    if (busy || !topWord) return;
    busy = true;
    const w = topWord;
    const card = deckEl.lastElementChild;
    if (card && card.classList.contains("card")) {
      card.classList.remove("dragging");
      card.querySelector(dir === "right" ? ".stamp.yes" : ".stamp.no").style.opacity = 1;
      card.style.transform = `translate(${(dir === "right" ? 1 : -1) * window.innerWidth}px, 40px) rotate(${dir === "right" ? 25 : -25}deg)`;
      card.style.opacity = 0;
      const next = card.previousElementSibling;
      if (next) next.classList.remove("behind");
    }

    const idx = state.deck.indexOf(w);
    if (idx >= 0) state.deck.splice(idx, 1);
    if (dir === "right") {
      state.status[w] = "learning";            // vu → part dans le test
    } else {
      // revient après AGAIN_GAP cartes visibles
      let pos = idx, seen = 0;
      while (pos < state.deck.length && seen < AGAIN_GAP) { if (matches(state.deck[pos])) seen++; pos++; }
      state.deck.splice(pos, 0, w);
    }
    state.sinceTest++;
    save();

    setTimeout(() => {
      busy = false;
      renderLearn();
      maybePromptTest();
    }, 260);
  }

  function maybePromptTest() {
    const n = learningWords().length;
    if (state.sinceTest >= TEST_EVERY && n > 0) {
      state.sinceTest = 0; save();
      $("modal-text").textContent = `${TEST_EVERY} swipes de plus ! Tu as ${n} mot${plural(n)} vu${plural(n)} à valider. On vérifie que c'est ancré ?`;
      $("modal").hidden = false;
    }
  }
  $("modal-go").onclick = () => { $("modal").hidden = true; show("test"); };
  $("modal-later").onclick = () => { $("modal").hidden = true; };

  $("btn-seen").onclick = () => swipe("right");
  $("btn-again").onclick = () => swipe("left");
  $("btn-speak").onclick = () => topWord && speak(topWord);

  document.addEventListener("keydown", e => {
    if (!$("modal").hidden || currentView !== "learn") return;
    if (e.key === "ArrowRight") swipe("right");
    else if (e.key === "ArrowLeft") swipe("left");
    else if (e.key === " ") { e.preventDefault(); topWord && speak(topWord); }
  });

  // ── Quiz (révision + test de niveau) ─────────────────────
  const box = $("test-box");
  let quiz = null;

  function startReview() {
    updateStats();
    const pool = shuffle(learningWords()).slice(0, TEST_SIZE);
    if (!pool.length) {
      box.innerHTML = `<div class="test-empty"><div class="big">🎯</div><h3>Rien à réviser</h3>
        <p>Swipe des mots vers la droite dans l'onglet Apprendre : ils arriveront ici pour être validés.</p>
        <p>${knownCount()} mot${plural(knownCount())} acquis sur ${DB.size}.</p>
        <button class="primary" id="back-learn">Aller swiper</button>
        <button class="ghost" id="to-levels">Passer un test de niveau</button>
        <button class="reset" id="reset">Réinitialiser ma progression</button></div>`;
      $("back-learn").onclick = () => show("learn");
      $("to-levels").onclick = () => show("levels");
      $("reset").onclick = resetAll;
      return;
    }
    quiz = { pool, i: 0, results: [], mode: "review" };
    renderQuestion();
  }

  // ── Test de niveau : réponses tapées ─────────────────────
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'").replace(/[-_/]/g, " ").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
  const stripFr = s => s.replace(/^(le |la |les |l'|un |une |des |du |de la |d'|se |s')/, "").trim();
  const stripEn = s => s.replace(/^(to |a |an |the )/, "").trim();
  const FILLERS = /\b(sb|sth|someone|something|somebody|one's|qqn|qqch|quelqu'un|quelque chose)\b/g;

  // Toutes les formes acceptées pour une réponse attendue
  function accepted(target, lang) {
    const out = new Set();
    const strip = lang === "fr" ? stripFr : stripEn;
    const parts = [];
    String(target).split(/[,;/]|\bou\b/).forEach(p => {
      const inner = p.match(/\(([^)]*)\)/);
      parts.push(p.replace(/\([^)]*\)/g, ""));
      if (inner) parts.push(inner[1], p.replace(/[()]/g, ""));
    });
    for (const p of parts) {
      const n = norm(p);
      if (!n) continue;
      [n, strip(n), norm(n.replace(FILLERS, "")), strip(norm(n.replace(FILLERS, "")))]
        .forEach(v => v && out.add(v));
    }
    return [...out];
  }

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function isCorrect(input, target, lang) {
    const strip = lang === "fr" ? stripFr : stripEn;
    const a = strip(norm(input));
    if (!a) return false;
    return accepted(target, lang).some(t => {
      if (a === t) return true;
      const tol = t.length >= 11 ? 2 : t.length >= 5 ? 1 : 0; // petite faute de frappe tolérée
      return lev(a, t) <= tol;
    });
  }

  // Indice pour le sens français → anglais : première lettre + nombre de lettres
  const pattern = w => w.split(" ").map(x => x[0] + " _".repeat(Math.max(0, x.length - 1))).join("   ");

  function startLevelTest(lvl) {
    updateStats();
    const lt = state.lt[lvl];
    // Chaque test tire des mots jamais encore utilisés dans un test de ce niveau
    let fresh = byLevel[lvl].filter(e => !lt.used.includes(e.w)).map(e => e.w);
    if (fresh.length < LEVEL_TEST_SIZE) { lt.used = []; fresh = byLevel[lvl].map(e => e.w); }
    const pool = shuffle(fresh).slice(0, LEVEL_TEST_SIZE);
    lt.used.push(...pool);
    save();
    // Moitié français → anglais, moitié anglais → français, dans le désordre
    const dirs = shuffle(pool.map((_, i) => i % 2 ? "fr2en" : "en2fr"));
    quiz = { pool, dirs, i: 0, results: [], mode: "level", lvl };
    renderTyped();
  }

  function renderTyped() {
    const e = DB.get(quiz.pool[quiz.i]);
    const fr2en = quiz.dirs[quiz.i] === "fr2en";
    box.innerHTML = `
      <div class="q-meta"><span>Test de niveau ${quiz.lvl} · ${quiz.i + 1}/${quiz.pool.length}</span>
        <span>${quiz.results.filter(r => r.ok).length} ✓ · ${quiz.results.filter(r => !r.ok).length} ✗</span></div>
      <div class="progress"><i style="width:${(quiz.i / quiz.pool.length) * 100}%"></i></div>
      <div class="q-dir">${fr2en ? "🇫🇷 → 🇬🇧" : "🇬🇧 → 🇫🇷"}</div>
      <div class="q-word">${esc(fr2en ? e.fr : e.w)}</div>
      <div class="q-ask">${fr2en ? `Écris le mot anglais${e.pos ? ` (${esc(e.pos)})` : ""}` : "Écris la traduction en français"}</div>
      ${fr2en ? `<div class="q-hint">${esc(pattern(e.w))}</div>` : ""}
      <form id="typed" autocomplete="off">
        <input id="answer" class="answer" type="text" autocapitalize="off" autocorrect="off" spellcheck="false"
          enterkeyhint="done" placeholder="${fr2en ? "English word…" : "Traduction…"}">
        <button class="primary" type="submit">Valider</button>
        <button class="ghost" type="button" id="skip">Je ne sais pas</button>
      </form>
      <div id="fb"></div>`;
    if (!fr2en) speak(e.w);
    const input = $("answer");
    setTimeout(() => input.focus(), 50);
    $("typed").onsubmit = ev => { ev.preventDefault(); if (input.value.trim()) answerTyped(input.value, e, fr2en); };
    $("skip").onclick = () => answerTyped("", e, fr2en);
  }

  function markWord(e, ok) {
    if (ok) {
      state.status[e.w] = "known";
      delete state.retry[e.w];
      state.deck = state.deck.filter(x => x !== e.w);
    } else {
      // Raté → retour en tête de la pile de swipe
      delete state.status[e.w];
      state.retry[e.w] = true;
      state.deck = [e.w, ...state.deck.filter(x => x !== e.w)];
    }
  }

  function answerTyped(value, e, fr2en) {
    const ok = isCorrect(value, fr2en ? e.w : e.fr, fr2en ? "en" : "fr");
    markWord(e, ok);
    save(); updateStats();
    const res = { e, ok, given: value.trim(), fr2en };
    quiz.results.push(res);

    $("typed").querySelectorAll("input,button").forEach(x => x.disabled = true);
    $("answer").classList.add(ok ? "right" : "wrong");
    const expected = fr2en ? e.w : e.fr;
    $("fb").innerHTML = `<div class="feedback">
        ${ok ? `<b class="ok">✓ Correct !</b> ${norm(value) !== norm(expected) ? `Réponse attendue : <b>${esc(expected)}</b>` : ""}`
             : `<b class="ko">✗ ${value.trim() ? "Faux" : "Pas de réponse"}.</b> ${esc(fr2en ? e.fr : e.w)} = <b>${esc(expected)}</b>. Retour dans ta pile de swipe.`}
        <div class="def">${esc(e.w)} — ${esc(e.def)}${e.ex ? `<br><i>${esc(e.ex)}</i>` : ""}</div>
      </div>
      <button class="primary" id="next">${quiz.i + 1 < quiz.pool.length ? "Suivant →" : "Voir le résultat"}</button>
      ${!ok && value.trim() && !fr2en ? `<button class="ghost" id="override">Ma traduction était correcte</button>` : ""}`;
    const next = $("next");
    next.onclick = nextQ;
    setTimeout(() => next.focus(), 50);
    const ov = $("override");
    if (ov) ov.onclick = () => { res.ok = true; markWord(e, true); save(); updateStats(); nextQ(); };
  }

  function renderQuestion() {
    const w = quiz.pool[quiz.i];
    const e = DB.get(w);
    const enToFr = Math.random() < 0.65;
    const field = enToFr ? "fr" : "w";
    const answer = e[field];

    // Distracteurs : même niveau et même nature de mot si possible
    const pick = (list, opts, seen) => {
      for (const o of shuffle(list.slice())) {
        if (opts.length >= 4) break;
        if (o.w !== w && !seen.has(o[field].toLowerCase())) { seen.add(o[field].toLowerCase()); opts.push(o[field]); }
      }
    };
    const options = [answer], seen = new Set([answer.toLowerCase()]);
    const sameLvl = byLevel[e.lvl];
    pick(sameLvl.filter(o => o.pos === e.pos), options, seen);
    pick(sameLvl, options, seen);
    pick([...DB.values()], options, seen);
    shuffle(options);

    const title = quiz.mode === "level" ? `Test de niveau ${quiz.lvl}` : "Révision";
    box.innerHTML = `
      <div class="q-meta"><span>${title} · ${quiz.i + 1}/${quiz.pool.length}</span><span>${e.lvl}${e.src ? " · " + esc(e.src) : ""}</span></div>
      <div class="progress"><i style="width:${(quiz.i / quiz.pool.length) * 100}%"></i></div>
      <div class="q-word">${esc(enToFr ? e.w : e.fr)}</div>
      <div class="q-ask">${enToFr ? "Quelle est la traduction ?" : "Quel est le mot anglais ?"}</div>
      <div class="choices">${options.map(o => `<button class="choice" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      <div id="fb"></div>`;
    if (enToFr) speak(e.w);

    box.querySelectorAll(".choice").forEach(btn => btn.onclick = () => answerQ(btn, answer, e));
  }

  function answerQ(btn, answer, e) {
    const ok = btn.dataset.v === answer;
    box.querySelectorAll(".choice").forEach(b => {
      b.disabled = true;
      if (b.dataset.v === answer) b.classList.add("right");
    });
    if (!ok) btn.classList.add("wrong");

    markWord(e, ok);
    save();
    updateStats();
    quiz.results.push({ e, ok });

    $("fb").innerHTML = `<div class="feedback">
        ${ok ? `<b class="ok">✓ Validé !</b> Mot acquis.` : `<b class="ko">✗ Raté.</b> « ${esc(e.w)} » = <b>${esc(e.fr)}</b>. Il retourne dans tes cartes à swiper.`}
        <div class="def">${esc(e.def)}${e.ex ? `<br><i>${esc(e.ex)}</i>` : ""}</div>
      </div>
      <button class="primary" id="next">${quiz.i + 1 < quiz.pool.length ? "Suivant →" : "Voir le résultat"}</button>`;
    $("next").onclick = nextQ;
    if (ok) quiz.timer = setTimeout(nextQ, 1400);
  }

  function nextQ() {
    clearTimeout(quiz.timer);
    if (currentView !== "test") return;
    quiz.i++;
    if (quiz.i < quiz.pool.length) quiz.mode === "level" ? renderTyped() : renderQuestion();
    else renderResults();
  }

  function renderResults() {
    const good = quiz.results.filter(r => r.ok).length;
    const total = quiz.results.length;
    const left = learningWords().length;
    let head, buttons;
    if (quiz.mode === "level") {
      const lt = state.lt[quiz.lvl], req = TESTS_REQUIRED[quiz.lvl];
      const passed = good >= LEVEL_PASS;
      let justValidated = false;
      if (passed && !quiz.counted) {
        quiz.counted = true;
        lt.passed++;
        if (lt.passed >= req && !lt.date) { lt.date = new Date().toISOString().slice(0, 10); justValidated = true; }
      }
      save();
      const left = Math.max(0, req - lt.passed);
      head = `<div class="big">${justValidated ? "🏅" : passed ? "✅" : "📚"}</div>
        <h3>${justValidated ? `Niveau ${quiz.lvl} validé !` : passed ? "Test réussi !" : "Test raté"}</h3>
        <p>${good}/${total} bonnes réponses (il en faut ${LEVEL_PASS}).<br>
        Tests réussis en ${quiz.lvl} : <b>${lt.passed}/${req}</b>${left ? ` — encore ${left} pour valider le niveau.` : "."}
        ${passed ? "" : "<br>Les mots ratés sont dans ta pile de swipe : révise-les puis retente."}</p>`;
      buttons = `<button class="primary" id="b1">${left ? "Test suivant" : "Voir mes niveaux"}</button>
        <button class="ghost" id="b2">Réviser en swipant le ${quiz.lvl}</button>`;
    } else {
      head = `<div class="big">${good === total ? "🏆" : good >= total / 2 ? "👍" : "💪"}</div>
        <h3>${good}/${total} validés</h3>
        <p>${total - good ? `${total - good} mot${plural(total - good)} renvoyé${plural(total - good)} dans la pile de swipe.` : "Sans faute !"}</p>`;
      buttons = `${left ? `<button class="primary" id="b1">Encore un test (${left} restant${plural(left)})</button>` : ""}
        <button class="${left ? "ghost" : "primary"}" id="b2">Retour au swipe</button>`;
    }
    box.innerHTML = `<div class="test-empty" style="justify-content:flex-start;padding-top:10px">${head}
      <ul class="result-list">${quiz.results.map(r =>
        `<li class="${r.ok ? "ok" : "ko"}"><span>${r.ok ? "✓" : "✗"} ${esc(r.e.w)}</span><span>${esc(r.e.fr)}</span></li>`).join("")}</ul>
      ${buttons}</div>`;
    const lvl = quiz.lvl;
    const b1 = $("b1"), b2 = $("b2");
    if (quiz.mode === "level") {
      box.querySelector(".result-list").innerHTML = quiz.results.map(r =>
        `<li class="${r.ok ? "ok" : "ko"}"><span>${r.ok ? "✓" : "✗"} ${esc(r.fr2en ? r.e.fr : r.e.w)}</span>
         <span>${r.ok ? "" : `<s>${esc(r.given || "—")}</s> `}${esc(r.fr2en ? r.e.w : r.e.fr)}</span></li>`).join("");
      b1.onclick = () => state.lt[lvl].passed >= TESTS_REQUIRED[lvl] ? show("levels") : show("test", { level: lvl });
      b2.onclick = () => { state.levels = [lvl]; state.sf = false; save(); show("learn"); };
    } else {
      if (b1) b1.onclick = startReview;
      b2.onclick = () => show("learn");
    }
  }

  // ── Niveaux ──────────────────────────────────────────────
  function renderLevels() {
    updateStats();
    // Niveau estimé = plus haut niveau validé sans trou depuis A1
    const isVal = l => state.lt[l].passed >= TESTS_REQUIRED[l];
    let est = null;
    for (const l of LEVELS) { if (isVal(l)) est = l; else break; }
    const best = LEVELS.filter(isVal).pop();

    const rows = LEVELS.map(l => {
      const list = byLevel[l];
      const total = list.length || 1;
      let k = 0, lr = 0;
      for (const e of list) { const s = state.status[e.w]; if (s === "known") k++; else if (s === "learning") lr++; }
      const lt = state.lt[l], req = TESTS_REQUIRED[l], v = isVal(l);
      const date = lt.date ? lt.date.split("-").reverse().join("/") : "";
      return `<div class="lvcard lv-${l}">
        <div class="row">
          <div class="name"><span class="pill">${l}</span> <i>${list.length} mots</i></div>
          ${v ? `<span class="ok">✓ Validé${date ? " le " + date : ""}</span>` : ""}
        </div>
        <div class="tests">${Array.from({ length: req }, (_, i) => `<i class="${i < lt.passed ? "done" : ""}"></i>`).join("")}</div>
        <div class="meta"><b>${Math.min(lt.passed, req)}/${req} tests réussis</b> · ${k} mots acquis (${Math.round(k / total * 100)} %)${lr ? ` · ${lr} à tester` : ""}</div>
        <div class="bar"><span class="k" style="width:${k / total * 100}%"></span><span class="l" style="width:${lr / total * 100}%"></span></div>
        <div class="btns">
          <button class="main" data-test="${l}">${v ? "Test d'entretien" : `Test n°${lt.passed + 1}`}</button>
          <button data-swipe="${l}">Swiper ${l}</button>
        </div></div>`;
    }).join("");

    $("levels-box").innerHTML = `
      <div class="est">Ton niveau validé<b>${est || "—"}</b>${best && best !== est ? `(${best} validé aussi : valide les niveaux en dessous pour le confirmer)` : est ? "" : "Commence par valider A1, A2… avec les tests de niveau."}</div>
      ${rows}
      <p class="lvnote">Chaque test : ${LEVEL_TEST_SIZE} mots jamais encore tirés dans ce niveau, à <b>écrire</b> toi-même
      (français → anglais et anglais → français). Il faut ${LEVEL_PASS}/${LEVEL_TEST_SIZE} pour réussir un test, et
      ${LEVELS.map(l => `${TESTS_REQUIRED[l]} en ${l}`).join(", ")} pour valider le niveau.
      Les mots trouvés passent en « acquis », les ratés retournent dans ta pile de swipe.</p>`;
    $("levels-box").querySelectorAll("[data-test]").forEach(b => b.onclick = () => show("test", { level: b.dataset.test }));
    $("levels-box").querySelectorAll("[data-swipe]").forEach(b => b.onclick = () => {
      state.levels = [b.dataset.swipe]; state.sf = false; save(); show("learn");
    });
  }

  function resetAll() {
    if (!confirm("Effacer toute ta progression ?")) return;
    localStorage.removeItem(KEY);
    state = load(); save();
    show("learn");
  }

  // ── Démarrage ────────────────────────────────────────────
  renderLearn();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
