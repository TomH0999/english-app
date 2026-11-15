(() => {
  "use strict";

  // ── Données ──────────────────────────────────────────────
  const DB = new Map();
  for (const [w, fr, def, syn, src] of WORDS) {
    DB.set(w, { w, fr, def, syn: syn.split(",").map(s => s.trim()).filter(Boolean), src });
  }

  const KEY = "scifi-vocab-v1";
  const TEST_EVERY = 10;     // rappel de test tous les N swipes
  const TEST_SIZE = 10;      // questions max par test
  const AGAIN_GAP = 5;       // un mot "encore" revient N cartes plus loin

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
  function load() {
    let s;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== "object") s = {};
    s.status = s.status || {};
    s.retry = s.retry || {};
    s.deck = Array.isArray(s.deck) ? s.deck : [];
    s.sinceTest = s.sinceTest || 0;

    // Nettoyage + ajout des nouveaux mots de la base
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

  // ── UI commune ───────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function updateStats() {
    const toTest = learningWords().length;
    $("st-new").textContent = state.deck.length;
    $("st-test").textContent = toTest;
    $("st-known").textContent = knownCount();
    $("badge").textContent = toTest;
    $("badge").classList.toggle("hidden", toTest === 0);
  }

  let currentView = "learn";
  function show(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    if (view === "test") startTest();
    else renderDeck();
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

  function cardHTML(e) {
    const retry = state.retry[e.w];
    return `
      <span class="src ${retry ? "retry" : ""}">${retry ? "↺ À revoir · " : ""}${esc(e.src)}</span>
      <div class="word">${esc(e.w)}</div>
      <div class="fr">${esc(e.fr)}</div>
      <hr>
      <div class="label">Sens</div>
      <div class="def">${esc(e.def)}</div>
      <div class="label">Synonymes</div>
      <div class="syns">${e.syn.map(s => `<span>${esc(s)}</span>`).join("")}</div>
      <div class="stamp yes">VU ✓</div>
      <div class="stamp no">ENCORE</div>`;
  }

  function renderDeck() {
    updateStats();
    deckEl.innerHTML = "";
    if (!state.deck.length) {
      const n = learningWords().length;
      deckEl.innerHTML = `<div class="empty"><div class="big">🚀</div><h3>Tout est vu !</h3>
        <p>${n ? `Il te reste ${n} mot${n > 1 ? "s" : ""} à valider dans l'onglet Test.` : "Tu as validé tout le vocabulaire. Bravo !"}</p>
        ${n ? `<button class="primary" id="go-test">Faire le test</button>` : ""}</div>`;
      const b = $("go-test"); if (b) b.onclick = () => show("test");
      return;
    }
    // On empile 2 cartes : celle du dessous d'abord
    state.deck.slice(0, 2).reverse().forEach((w, i, arr) => {
      const el = document.createElement("div");
      el.className = "card" + (i < arr.length - 1 ? " behind" : "");
      el.innerHTML = cardHTML(DB.get(w));
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
    if (busy || !state.deck.length) return;
    busy = true;
    const card = deckEl.lastElementChild;
    const w = state.deck[0];
    if (card && card.classList.contains("card")) {
      card.classList.remove("dragging");
      card.querySelector(dir === "right" ? ".stamp.yes" : ".stamp.no").style.opacity = 1;
      card.style.transform = `translate(${(dir === "right" ? 1 : -1) * window.innerWidth}px, 40px) rotate(${dir === "right" ? 25 : -25}deg)`;
      card.style.opacity = 0;
      const next = card.previousElementSibling;
      if (next) next.classList.remove("behind");
    }

    state.deck.shift();
    if (dir === "right") {
      state.status[w] = "learning";            // vu → part dans le test
    } else {
      state.deck.splice(Math.min(AGAIN_GAP, state.deck.length), 0, w); // revient plus tard
    }
    state.sinceTest++;
    save();

    setTimeout(() => {
      busy = false;
      renderDeck();
      maybePromptTest();
    }, 260);
  }

  function maybePromptTest() {
    const n = learningWords().length;
    if (state.sinceTest >= TEST_EVERY && n > 0) {
      state.sinceTest = 0; save();
      $("modal-text").textContent = `${TEST_EVERY} swipes de plus ! Tu as ${n} mot${n > 1 ? "s" : ""} vu${n > 1 ? "s" : ""} à valider. On vérifie que c'est ancré ?`;
      $("modal").hidden = false;
    }
  }
  $("modal-go").onclick = () => { $("modal").hidden = true; show("test"); };
  $("modal-later").onclick = () => { $("modal").hidden = true; };

  $("btn-seen").onclick = () => swipe("right");
  $("btn-again").onclick = () => swipe("left");
  $("btn-speak").onclick = () => state.deck[0] && speak(state.deck[0]);

  document.addEventListener("keydown", e => {
    if (!$("modal").hidden || currentView !== "learn") return;
    if (e.key === "ArrowRight") swipe("right");
    else if (e.key === "ArrowLeft") swipe("left");
    else if (e.key === " ") { e.preventDefault(); state.deck[0] && speak(state.deck[0]); }
  });

  // ── Mode test ────────────────────────────────────────────
  const box = $("test-box");
  let test = null;

  function startTest() {
    updateStats();
    const pool = shuffle(learningWords()).slice(0, TEST_SIZE);
    if (!pool.length) {
      box.innerHTML = `<div class="test-empty"><div class="big">🎯</div><h3>Rien à tester</h3>
        <p>Swipe des mots vers la droite dans l'onglet Apprendre : ils arriveront ici pour être validés.</p>
        <p>${knownCount()} mot${knownCount() > 1 ? "s" : ""} acquis sur ${DB.size}.</p>
        <button class="primary" id="back-learn">Aller swiper</button>
        <button class="reset" id="reset">Réinitialiser ma progression</button></div>`;
      $("back-learn").onclick = () => show("learn");
      $("reset").onclick = resetAll;
      return;
    }
    test = { pool, i: 0, results: [] };
    renderQuestion();
  }

  function renderQuestion() {
    const w = test.pool[test.i];
    const e = DB.get(w);
    const enToFr = Math.random() < 0.65;
    const field = enToFr ? "fr" : "w";
    const answer = e[field];

    const others = shuffle([...DB.values()].filter(o => o.w !== w && o[field] !== answer));
    const seen = new Set([answer]);
    const options = [answer];
    for (const o of others) {
      if (options.length >= 4) break;
      if (!seen.has(o[field])) { seen.add(o[field]); options.push(o[field]); }
    }
    shuffle(options);

    box.innerHTML = `
      <div class="q-meta"><span>Question ${test.i + 1}/${test.pool.length}</span><span>${esc(e.src)}</span></div>
      <div class="progress"><i style="width:${(test.i / test.pool.length) * 100}%"></i></div>
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

    if (ok) {
      state.status[e.w] = "known";
      delete state.retry[e.w];
    } else {
      // Raté → retour en tête de la pile de swipe
      delete state.status[e.w];
      state.retry[e.w] = true;
      state.deck = [e.w, ...state.deck.filter(x => x !== e.w)];
    }
    save();
    updateStats();
    test.results.push({ e, ok });

    $("fb").innerHTML = `<div class="feedback">
        ${ok ? `<b class="ok">✓ Validé !</b> Mot acquis.` : `<b class="ko">✗ Raté.</b> « ${esc(e.w)} » = <b>${esc(e.fr)}</b>. Il retourne dans tes cartes à swiper.`}
        <div class="def">${esc(e.def)} — <i>${esc(e.syn.join(", "))}</i></div>
      </div>
      <button class="primary" id="next">${test.i + 1 < test.pool.length ? "Suivant →" : "Voir le résultat"}</button>`;
    $("next").onclick = nextQ;
    if (ok) test.timer = setTimeout(nextQ, 1400);
  }

  function nextQ() {
    clearTimeout(test.timer);
    if (currentView !== "test") return;
    test.i++;
    if (test.i < test.pool.length) renderQuestion();
    else renderResults();
  }

  function renderResults() {
    const good = test.results.filter(r => r.ok).length;
    const total = test.results.length;
    const left = learningWords().length;
    box.innerHTML = `<div class="test-empty" style="justify-content:flex-start;padding-top:10px">
      <div class="big">${good === total ? "🏆" : good >= total / 2 ? "👍" : "💪"}</div>
      <h3>${good}/${total} validés</h3>
      <p>${total - good ? `${total - good} mot${total - good > 1 ? "s" : ""} renvoyé${total - good > 1 ? "s" : ""} dans la pile de swipe.` : "Sans faute !"}</p>
      <ul class="result-list">${test.results.map(r =>
        `<li class="${r.ok ? "ok" : "ko"}"><span>${r.ok ? "✓" : "✗"} ${esc(r.e.w)}</span><span>${esc(r.e.fr)}</span></li>`).join("")}</ul>
      ${left ? `<button class="primary" id="again">Encore un test (${left} restant${left > 1 ? "s" : ""})</button>` : ""}
      <button class="${left ? "ghost" : "primary"}" id="back">Retour au swipe</button>
    </div>`;
    const a = $("again"); if (a) a.onclick = startTest;
    $("back").onclick = () => show("learn");
  }

  function resetAll() {
    if (!confirm("Effacer toute ta progression ?")) return;
    localStorage.removeItem(KEY);
    state = load(); save();
    show("learn");
  }

  // ── Démarrage ────────────────────────────────────────────
  renderDeck();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
