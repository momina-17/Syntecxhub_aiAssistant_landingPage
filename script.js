/* ==========================================================
   StudyMind AI — script.js (vanilla JS, no dependencies)
   Scope: navigation, scroll reveal, hero parallax, micro-interactions,
   and the simulated AI study demo (no backend, no API calls).
   Quiz-preview and pricing logic come in later chunks.
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (selector, ctx = document) => ctx.querySelector(selector);
  const $$ = (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const prefersReducedMotion = () => reducedMotionQuery.matches;

  // Cross-browser listener for MediaQueryList changes
  const onMediaChange = (mq, handler) => {
    if (!mq || !mq.addEventListener && !mq.addListener) return;
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
  };

  // Cached DOM references (filled once in init)
  const dom = {};

  function cacheDom() {
    dom.header = $('#site-header') || $('.site-header');
    dom.toggle = $('#nav-toggle');
    dom.menu = $('#nav-menu');
    dom.navLinks = $$('.navbar__link');
    dom.backToTop = $('#back-to-top') || $('.back-to-top');
  }

  // One shared scroll listener, throttled with requestAnimationFrame
  const scrollTasks = [];
  let scrollTicking = false;
  function onScrollFrame(task) {
    scrollTasks.push(task);
    if (scrollTasks.length > 1) return; // listener already attached
    window.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTasks.forEach((fn) => fn(window.pageYOffset));
        scrollTicking = false;
      });
    }, { passive: true });
  }

  /* ---------- 1. Mobile navigation ---------- */
  function initMobileNavigation() {
    const { toggle, menu } = dom;
    if (!toggle || !menu) return;

    const desktopQuery = window.matchMedia ? window.matchMedia('(min-width: 901px)') : null;
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    const setOpen = (open, returnFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      menu.classList.toggle('is-open', open);
      if (!open && returnFocus) toggle.focus();
    };

    setOpen(false);
    toggle.addEventListener('click', () => setOpen(!isOpen()));

    // Close after choosing a link
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });

    // Escape closes and returns focus to the toggle
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) setOpen(false, true);
    });

    // Click outside closes
    document.addEventListener('click', (e) => {
      if (isOpen() && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });

    // Reset when resizing to desktop
    onMediaChange(desktopQuery, (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- 2. Smooth in-page navigation ---------- */
  function scrollToTarget(target, id) {
    const headerHeight = dom.header ? dom.header.offsetHeight : 0;
    const top = id === 'home'
      ? 0
      : target.getBoundingClientRect().top + window.pageYOffset - headerHeight + 1;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function initSmoothNavigation() {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const href = link.getAttribute('href');
      let id;
      try { id = decodeURIComponent(href.slice(1)); } catch (_) { return; }

      // Bare "#" goes to top; unknown targets keep native behavior
      if (!id) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      scrollToTarget(target, id);
      setActiveLink(id);

      try {
        if (window.history && history.pushState && location.hash !== href) history.pushState(null, '', href);
      } catch (_) { /* pushState can be blocked on file:// */ }

      // Move focus for keyboard and screen-reader users
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: true });
    });
  }

  /* ---------- 3. Active navigation link ---------- */
  function setActiveLink(id) {
    dom.navLinks.forEach((link) => {
      const on = link.getAttribute('href') === '#' + id;
      link.classList.toggle('active', on);
      link.classList.toggle('is-active', on); // class used by style.css
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function initActiveNavigation() {
    if (!('IntersectionObserver' in window) || !dom.navLinks.length) return;

    // Only observe sections that actually have a nav link
    const sections = dom.navLinks
      .map((link) => link.getAttribute('href'))
      .filter((href) => href && href.length > 1 && href.charAt(0) === '#')
      .map((href) => document.getElementById(href.slice(1)))
      .filter(Boolean);
    if (!sections.length) return;

    // Thin band near the middle of the viewport decides the current section
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveLink(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach((section) => observer.observe(section));
  }

  /* ---------- 4. Scroll reveal ---------- */
  function initScrollReveal() {
    // Give key blocks the reveal behavior defined in style.css
    ['.hero__content', '.hero__visual', '.section-header', '.demo__panel', '.quiz-card',
      '.dash', '.plan', '.final-cta__inner'].forEach((selector) => {
      $$(selector).forEach((el) => el.classList.add('reveal'));
    });

    const items = $$('.reveal, [data-animate]');
    if (!items.length) return;

    // Stagger by position within the same parent (cards, steps, plans, testimonials)
    const counts = new Map();
    items.forEach((el) => {
      const index = counts.get(el.parentNode) || 0;
      counts.set(el.parentNode, index + 1);
      el.dataset.revealIndex = String(index);
    });

    const show = (el) => {
      const index = Math.min(parseInt(el.dataset.revealIndex, 10) || 0, 5);
      if (index) el.style.animationDelay = index * 90 + 'ms';
      el.classList.add('active');
    };

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('active'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        obs.unobserve(entry.target); // keep the revealed state, never restart
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    items.forEach((el) => observer.observe(el));
  }

  /* ---------- 5. Hero 3D mouse parallax ---------- */
  function initHeroParallax() {
    const visual = $('#hero-3d-scene') || $('.hero__visual');
    const stage = $('#hero-scene-stage') || $('.hero-scene');
    if (!visual || !stage || !stage.parentNode || prefersReducedMotion()) return;

    const hero = visual.closest('.hero') || visual;

    // The stage already has a CSS sway animation, so rotate a wrapper instead
    const rig = document.createElement('div');
    rig.className = 'hero-rig';
    Object.assign(rig.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      transformStyle: 'preserve-3d', willChange: 'transform'
    });
    stage.parentNode.insertBefore(rig, stage);
    rig.appendChild(stage);

    // Floating cards animate via CSS `translate`, so shift them through their --t transform variable
    const layers = [];
    $$('[data-depth]', stage).forEach((el) => {
      const base = getComputedStyle(el).getPropertyValue('--t').trim();
      if (!base) return;
      el.style.setProperty('--t', 'translate3d(var(--px, 0px), var(--py, 0px), 0) ' + base);
      layers.push({ el, depth: parseFloat(el.dataset.depth) || 1 });
    });

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let running = false;

    const apply = () => {
      rig.style.transform = 'rotateX(' + (-current.y * 5).toFixed(2) + 'deg) rotateY(' + (current.x * 7).toFixed(2) + 'deg)';
      layers.forEach(({ el, depth }) => {
        el.style.setProperty('--px', (current.x * depth * 10).toFixed(1) + 'px');
        el.style.setProperty('--py', (current.y * depth * 8).toFixed(1) + 'px');
      });
    };

    // Short-lived rAF loop: eases toward the target, then stops itself
    const tick = () => {
      current.x += (target.x - current.x) * 0.09;
      current.y += (target.y - current.y) * 0.09;
      apply();
      if (Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001) {
        requestAnimationFrame(tick);
      } else {
        current.x = target.x;
        current.y = target.y;
        apply();
        running = false;
      }
    };
    const start = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    };

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || prefersReducedMotion()) return;
      const rect = hero.getBoundingClientRect();
      target.x = clamp(((e.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      target.y = clamp(((e.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
      start();
    }, { passive: true });

    // Ease back to neutral
    const reset = () => { target.x = 0; target.y = 0; start(); };
    hero.addEventListener('pointerleave', reset);
    onMediaChange(reducedMotionQuery, (e) => { if (e.matches) reset(); });
  }

  /* ---------- 6. Navbar scroll state ---------- */
  function initNavbarScroll() {
    const { header } = dom;
    if (!header) return;
    onScrollFrame((y) => {
      const scrolled = y > 24;
      header.classList.toggle('scrolled', scrolled);
      header.classList.toggle('is-scrolled', scrolled); // class used by style.css
    });
    header.classList.toggle('scrolled', window.pageYOffset > 24);
    header.classList.toggle('is-scrolled', window.pageYOffset > 24);
  }

  /* ---------- 7. CTA button micro-interactions ---------- */
  function initButtonInteractions() {
    const buttons = $$('#btn-nav-cta, #btn-hero-cta, #btn-hero-secondary, #btn-final-cta');
    buttons.forEach((btn) => {
      const press = () => {
        btn.classList.add('is-pressed');
        if (!prefersReducedMotion()) btn.style.transform = 'scale(0.96)';
      };
      // Clearing the inline transform lets the CSS transition ease it back
      const release = () => {
        btn.classList.remove('is-pressed');
        btn.style.transform = '';
      };
      btn.addEventListener('pointerdown', press);
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((evt) => btn.addEventListener(evt, release));
      btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') press(); });
      btn.addEventListener('keyup', release);
    });
  }

  /* ---------- 8. Back to top (optional element) ---------- */
  function initBackToTop() {
    const { backToTop } = dom;
    if (!backToTop) return;
    backToTop.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
    const update = (y) => backToTop.classList.toggle('is-visible', y > 600);
    onScrollFrame(update);
    update(window.pageYOffset);
  }

  /* ---------- 9. AI study demo (simulated, no backend) ---------- */
  const SAMPLE_NOTES = 'Photosynthesis is the process by which plants convert light energy into chemical energy. ' +
    'Chlorophyll in the chloroplasts absorbs light, mainly red and blue wavelengths. ' +
    'During the light reactions, water is split and oxygen is released. ' +
    'The Calvin cycle then uses the stored energy to turn carbon dioxide into glucose.';

  const STOPWORDS = new Set(('about above after again also another because been before being between both could does doing ' +
    'during each either every from further have having here into just like made make many more most much must other over ' +
    'same should since some such than that their them then there these they this those through under until upon very were ' +
    'what when where which while will with within without would your however therefore though although often usually ' +
    'called known using used uses').split(' '));

  const DISTRACTOR_TERMS = ['Inflation', 'Tectonics', 'Mitosis', 'Sonnets', 'Algorithms', 'Magnetism', 'Imperialism', 'Elasticity'];
  const LETTERS = ['A', 'B', 'C', 'D'];

  // Predefined content used when the notes are too short to work with
  const SAMPLE_QUIZ = [
    { question: 'What is the primary function of chlorophyll?', options: ['Absorb light', 'Produce oxygen', 'Absorb water', 'Store glucose'], answer: 0, explanation: 'Chlorophyll absorbs light energy, mainly red and blue wavelengths, which drives photosynthesis.' },
    { question: 'Where does the Calvin cycle take place?', options: ['Thylakoid membrane', 'Stroma of the chloroplast', 'Mitochondria', 'Cell wall'], answer: 1, explanation: 'The Calvin cycle runs in the stroma and uses stored energy to build glucose from carbon dioxide.' },
    { question: 'What is released when water is split in the light reactions?', options: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Glucose'], answer: 2, explanation: 'Splitting water releases oxygen as a by-product of the light reactions.' }
  ];
  const SAMPLE_CARDS = [
    { front: 'What is photosynthesis?', back: 'The process plants use to convert light energy into chemical energy stored as glucose.' },
    { front: 'What does chlorophyll do?', back: 'It absorbs light, mainly red and blue wavelengths, to power the light reactions.' },
    { front: 'What is the Calvin cycle?', back: 'A set of reactions that uses stored energy to turn carbon dioxide into glucose.' }
  ];

  const demo = { busy: false, timers: [], pulse: null };

  /* Small DOM helpers (all text goes through textContent, never innerHTML) */
  function h(tag, opts = {}, kids = []) {
    const node = document.createElement(tag);
    if (opts.cls) node.className = opts.cls;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) Object.keys(opts.attrs).forEach((k) => node.setAttribute(k, opts.attrs[k]));
    if (opts.style) Object.assign(node.style, opts.style);
    kids.forEach((kid) => { if (kid) node.appendChild(kid); });
    return node;
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const listWords = (w) => (w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1]);
  const mutedStyle = { color: 'var(--muted)', fontSize: '.88rem' };

  function trimTo(text, max) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.lastIndexOf(' ', max);
    return t.slice(0, cut > 40 ? cut : max).replace(/[,;:\s]+$/, '') + '…';
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Turn raw notes into sentences, keywords and a topic */
  function analyze(text) {
    const clean = text.replace(/\r/g, '').trim();
    const wordCount = (clean.match(/\S+/g) || []).length;
    const sentences = (clean.match(/[^.!?\n]+[.!?]*/g) || [])
      .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim())
      .filter((s) => s.split(' ').length >= 4);

    const freq = new Map();
    (clean.toLowerCase().match(/[a-z][a-z'-]{4,}/g) || []).forEach((w) => {
      if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    });
    const keywords = Array.from(freq.keys())
      .sort((a, b) => freq.get(b) - freq.get(a) || b.length - a.length)
      .slice(0, 6);

    const m = sentences[0] && sentences[0].match(/^(.{3,50}?)\s+(?:is|are|was|were|refers to|means|occurs|describes)\b/i);
    const topic = (m ? m[1].replace(/^(the|a|an)\s+/i, '') : keywords[0]) || 'this topic';
    return { wordCount, sentences, keywords, freq, topic };
  }

  function scoreSentence(sentence, a) {
    const lower = sentence.toLowerCase();
    return a.keywords.reduce((sum, k) => sum + (lower.includes(k) ? a.freq.get(k) : 0), 0);
  }
  // Highest-scoring sentences, returned in their original order
  function pickSentences(a, n) {
    return a.sentences
      .map((s, i) => ({ s, i, score: scoreSentence(s, a) }))
      .sort((x, y) => y.score - x.score || x.i - y.i)
      .slice(0, n)
      .sort((x, y) => x.i - y.i)
      .map((item) => item.s);
  }
  function sentenceWith(word, a, used) {
    const re = new RegExp('\\b' + escapeRegExp(word) + '\\b', 'i');
    return a.sentences.find((s) => re.test(s) && !used.has(s)) || null;
  }

  /* ----- Summary ----- */
  function generateSummary(a) {
    const [k1, k2] = a.keywords;
    let points = pickSentences(a, Math.min(4, Math.max(2, a.sentences.length))).map((s) => trimTo(s, 150));
    if (points.length < 2 && a.sentences[0]) {
      points = a.sentences[0].split(/[;,]| and | which | because /).map((c) => c.trim())
        .filter((c) => c.split(' ').length >= 3).slice(0, 3).map((c) => cap(c).replace(/[.!?]*$/, '.'));
    }
    if (points.length < 2) points.push('Focus on how ' + (k1 || 'the main idea') + ' connects to ' + (k2 || 'the supporting details') + '.');
    if (points.length < 2) points.push('Rewrite each idea in your own words to check your understanding.');

    const list = h('ul', {}, points.map((p) => h('li', { text: p })));
    const chips = h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
      [h('span', { text: 'Key terms', style: mutedStyle })].concat(a.keywords.slice(0, 4).map((k) => h('span', {
        text: cap(k),
        style: { padding: '3px 10px', border: '1px solid var(--line-strong)', borderRadius: '99px', fontSize: '.82rem', color: 'var(--accent)' }
      }))));

    const core = listWords(a.keywords.slice(0, 3));
    const takeaway = h('p', {}, [
      h('strong', { text: 'Key takeaway: ' }),
      document.createTextNode(cap(a.topic) + (core ? ' comes down to ' + core + '. ' : '. ') +
        "If you can explain how these ideas connect without looking, you're ready to practice.")
    ]);
    const condensed = points.join(' ').split(/\s+/).length;
    const stats = h('p', { text: 'Condensed ' + a.wordCount + ' words into ' + condensed + ' words.', style: mutedStyle });
    return [h('h4', { text: 'Summary: ' + cap(a.topic) }), list, chips, takeaway, stats];
  }

  /* ----- Quiz ----- */
  function makeQuestion(question, correct, wrongs, explanation) {
    const seen = new Set([correct.toLowerCase()]);
    const options = [correct];
    wrongs.forEach((w) => { if (options.length < 4 && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); options.push(w); } });
    if (options.length < 4) return null;
    const shuffled = shuffle(options);
    return { question, options: shuffled, answer: shuffled.indexOf(correct), explanation };
  }

  function buildQuizQuestions(a, rawText) {
    const qs = [];
    const [k1, k2, k3, k4, k5] = a.keywords;
    const t = a.topic;
    const top = pickSentences(a, 1)[0];
    const lowerText = rawText.toLowerCase();

    if (top && k1) {
      const fact = trimTo(top, 110);
      qs.push(makeQuestion('Which statement is supported by your notes on ' + t + '?', fact, [
        cap(k1) + ' plays no role in ' + t + '.',
        cap(t) + ' has nothing to do with ' + (k2 || 'these ideas') + '.',
        'The notes say ' + t + ' cannot be tested or explained.'
      ], 'Your notes state: “' + fact + '”'));
    }
    if (k1) {
      const pool = shuffle(DISTRACTOR_TERMS.filter((d) => !lowerText.includes(d.toLowerCase())));
      qs.push(makeQuestion('Which term is most central to your notes on ' + t + '?', cap(k1), pool, '“' + cap(k1) + '” appears most often in your notes.'));
    }
    if (k2) {
      const s = sentenceWith(k2, a, new Set());
      if (s) {
        const blanked = trimTo(s.replace(new RegExp('\\b' + escapeRegExp(k2) + '\\b', 'i'), '_____'), 140);
        const others = [k3, k4, k5, k1].filter(Boolean).map(cap).concat(shuffle(DISTRACTOR_TERMS));
        if (blanked.includes('_____')) {
          qs.push(makeQuestion('Fill in the blank: “' + blanked + '”', cap(k2), others, 'The missing term is “' + cap(k2) + '”, taken straight from your notes.'));
        }
      }
    }
    return qs.filter(Boolean);
  }

  function renderQuiz(qs) {
    let index = 0, score = 0, answered = false, finished = false;
    const meta = h('p', { style: mutedStyle });
    const progress = h('progress', { cls: 'quiz-card__progress-bar', attrs: { 'aria-label': 'Quiz progress' } });
    const question = h('p', { style: { fontWeight: '600', fontSize: '1.05rem', lineHeight: '1.4' }, attrs: { tabindex: '-1' } });
    const options = h('div', { cls: 'quiz-card__options', attrs: { role: 'group', 'aria-label': 'Answer choices' } });
    const feedback = h('div', { cls: 'quiz-card__feedback', attrs: { role: 'status' } });
    const next = h('button', { cls: 'btn btn--secondary', attrs: { type: 'button' }, style: { alignSelf: 'start' } });
    feedback.hidden = true;
    next.hidden = true;

    function draw() {
      answered = false;
      finished = false;
      const q = qs[index];
      meta.textContent = 'Question ' + (index + 1) + ' of ' + qs.length;
      progress.max = qs.length;
      progress.value = index + 1;
      question.textContent = q.question;
      options.replaceChildren();
      feedback.hidden = true;
      feedback.className = 'quiz-card__feedback';
      next.hidden = true;
      q.options.forEach((text, i) => {
        const btn = h('button', { cls: 'quiz-option', attrs: { type: 'button' } }, [
          h('span', { cls: 'quiz-option__letter', text: LETTERS[i] }),
          h('span', { cls: 'quiz-option__text', text })
        ]);
        btn.addEventListener('click', () => choose(i));
        options.appendChild(btn);
      });
    }

    // The correct answer stays in memory until the user picks something
    function choose(i) {
      if (answered) return;
      answered = true;
      const q = qs[index];
      const ok = i === q.answer;
      if (ok) score++;
      Array.from(options.children).forEach((btn, n) => {
        btn.disabled = true;
        if (n === q.answer) btn.classList.add('is-correct');
        else if (n === i) btn.classList.add('is-incorrect');
      });
      feedback.className = 'quiz-card__feedback ' + (ok ? 'is-correct' : 'is-incorrect');
      feedback.textContent = (ok ? 'Correct. ' : 'Not quite. The answer is ' + LETTERS[q.answer] + '. ') + q.explanation;
      feedback.hidden = false;
      next.textContent = index < qs.length - 1 ? 'Next question' : 'See results';
      next.hidden = false;
      next.focus();
    }

    function finish() {
      finished = true;
      progress.value = qs.length;
      meta.textContent = 'Quiz complete';
      question.textContent = 'You answered ' + score + ' of ' + qs.length + ' correctly.';
      options.replaceChildren();
      feedback.hidden = true;
      next.textContent = 'Retake quiz';
      question.focus();
    }

    next.addEventListener('click', () => {
      if (finished) { index = 0; score = 0; draw(); return; }
      if (index < qs.length - 1) {
        index++;
        draw();
        if (options.firstElementChild) options.firstElementChild.focus();
      } else {
        finish();
      }
    });

    draw();
    return [h('div', { style: { display: 'grid', gap: '14px' } }, [meta, progress, question, options, feedback, next])];
  }

  function generateQuiz(a, rawText, useSample) {
    let qs = useSample ? SAMPLE_QUIZ : buildQuizQuestions(a, rawText);
    if (qs.length < 2) qs = SAMPLE_QUIZ;
    return renderQuiz(qs);
  }

  /* ----- Flashcards ----- */
  function buildCards(a) {
    const cards = [];
    const used = new Set();
    const t = a.topic;
    const [k1, k2] = a.keywords;
    if (a.sentences[0]) {
      used.add(a.sentences[0]);
      cards.push({ front: 'What is ' + t + '?', back: trimTo(a.sentences[0], 170) });
    }
    [k1, k2].forEach((k, i) => {
      if (!k) return;
      const s = sentenceWith(k, a, used) || pickSentences(a, a.sentences.length).find((x) => !used.has(x));
      if (!s) return;
      used.add(s);
      cards.push({ front: i === 0 ? 'Why does “' + k + '” matter in ' + t + '?' : 'How does “' + k + '” fit into ' + t + '?', back: trimTo(s, 170) });
    });
    return cards;
  }

  function setCardFace(btn, label, text, card, side) {
    btn.dataset.side = side;
    label.textContent = side === 'back' ? 'Answer' : 'Question';
    text.textContent = side === 'back' ? card.back : card.front;
    btn.setAttribute('aria-pressed', String(side === 'back'));
    btn.style.borderColor = side === 'back' ? 'var(--line-strong)' : '';
  }

  // Flip animation uses the Web Animations API; reduced motion swaps instantly
  function flipCard(btn, label, text, card) {
    if (btn.dataset.busy) return;
    const side = btn.dataset.side === 'back' ? 'front' : 'back';
    if (prefersReducedMotion() || !btn.animate) { setCardFace(btn, label, text, card, side); return; }
    btn.dataset.busy = '1';
    const turnOut = btn.animate(
      [{ transform: 'perspective(700px) rotateX(0deg)' }, { transform: 'perspective(700px) rotateX(90deg)' }],
      { duration: 150, easing: 'ease-in' }
    );
    turnOut.onfinish = () => {
      setCardFace(btn, label, text, card, side);
      const turnIn = btn.animate(
        [{ transform: 'perspective(700px) rotateX(-90deg)' }, { transform: 'perspective(700px) rotateX(0deg)' }],
        { duration: 180, easing: 'ease-out' }
      );
      turnIn.onfinish = () => { delete btn.dataset.busy; };
    };
  }

  function generateFlashcards(a, useSample) {
    let cards = useSample ? SAMPLE_CARDS : buildCards(a);
    if (cards.length < 2) cards = SAMPLE_CARDS;
    const grid = h('div', { style: { display: 'grid', gap: '12px' } });
    cards.forEach((card) => {
      const label = h('span', { style: { display: 'block', marginBottom: '6px', fontSize: '.8rem', fontWeight: '600', color: 'var(--accent)' } });
      const text = h('span', { style: { display: 'block', fontSize: '1.02rem', lineHeight: '1.5' } });
      const btn = h('button', {
        cls: 'flashcard', attrs: { type: 'button', 'aria-pressed': 'false' },
        style: { display: 'block', width: '100%', minHeight: '96px', textAlign: 'left', cursor: 'pointer', transition: 'border-color .3s' }
      }, [label, text]);
      setCardFace(btn, label, text, card, 'front');
      btn.addEventListener('click', () => flipCard(btn, label, text, card));
      grid.appendChild(btn);
    });
    return [grid, h('p', { text: 'Click a card to flip it between question and answer.', style: mutedStyle })];
  }

  /* ----- Demo UI state ----- */
  function updateDemoCounter() {
    const value = demo.notes.value;
    if (demo.chars) demo.chars.textContent = String(value.length);
    if (demo.words) demo.words.textContent = String((value.match(/\S+/g) || []).length);
  }
  function showDemoError(message) {
    if (demo.error) { demo.error.textContent = message; demo.error.hidden = false; }
    demo.notes.setAttribute('aria-invalid', 'true');
    demo.notes.focus();
  }
  function clearDemoError() {
    if (demo.error) { demo.error.textContent = ''; demo.error.hidden = true; }
    demo.notes.removeAttribute('aria-invalid');
  }
  function setGenerateBusy(busy) {
    demo.generate.disabled = busy;
    demo.generate.textContent = busy ? 'Analyzing Notes...' : demo.label;
    if (busy) demo.generate.setAttribute('aria-busy', 'true');
    else demo.generate.removeAttribute('aria-busy');
  }
  function clearDemoTimers() {
    demo.timers.forEach(clearTimeout);
    demo.timers = [];
  }
  function hideAILoading() {
    if (demo.pulse) { demo.pulse.cancel(); demo.pulse = null; }
    if (demo.loading) demo.loading.hidden = true;
    if (demo.wrap) demo.wrap.removeAttribute('aria-busy');
  }

  const LOADING_MESSAGES = {
    summary: 'Condensing key ideas...',
    quiz: 'Writing practice questions...',
    flashcards: 'Building your flashcards...'
  };

  function showAILoading(mode) {
    demo.output.hidden = true;
    demo.output.replaceChildren();
    if (demo.empty) demo.empty.hidden = true;
    if (demo.wrap) demo.wrap.setAttribute('aria-busy', 'true');
    if (!demo.loading) return;
    if (demo.loadingText) demo.loadingText.textContent = 'Analyzing your notes...';
    demo.loading.hidden = false;
    if (!prefersReducedMotion() && demo.loading.animate) {
      demo.pulse = demo.loading.animate([{ opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }], { duration: 1400, iterations: Infinity });
    }
    // One mid-way message change instead of an interval
    demo.timers.push(setTimeout(() => {
      if (demo.loadingText) demo.loadingText.textContent = LOADING_MESSAGES[mode] || LOADING_MESSAGES.summary;
    }, 600));
  }

  const RESULT_TITLES = { summary: 'AI summary', quiz: 'Practice quiz', flashcards: 'Flashcards' };

  function showAIResult(nodes, mode) {
    hideAILoading();
    if (demo.empty) demo.empty.hidden = true;
    if (demo.title) demo.title.textContent = RESULT_TITLES[mode] || demo.titleDefault;
    demo.output.replaceChildren(...nodes);
    demo.output.hidden = false; // CSS fade-in plays when it becomes visible

    if (!prefersReducedMotion()) {
      Array.from(demo.output.children).forEach((child, i) => {
        if (!child.animate) return;
        child.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: i * 70, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }
        );
      });
    }
    demo.output.focus({ preventScroll: true });
    demo.output.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    demo.busy = false;
    setGenerateBusy(false);
  }

  function buildResult(mode, rawText) {
    let a = analyze(rawText);
    const useSample = a.wordCount < 8 || !a.keywords.length;
    if (useSample) a = analyze(SAMPLE_NOTES);

    let nodes;
    if (mode === 'quiz') nodes = generateQuiz(a, useSample ? SAMPLE_NOTES : rawText, useSample);
    else if (mode === 'flashcards') nodes = generateFlashcards(a, useSample);
    else nodes = generateSummary(a);

    if (useSample) {
      nodes.unshift(h('p', {
        text: 'Your notes were very short, so this result uses a sample topic. Add a few full sentences to get one based on your own material.',
        style: mutedStyle
      }));
    }
    return nodes;
  }

  function handleGenerate(e) {
    if (e) e.preventDefault();
    if (demo.busy) return;
    const text = demo.notes.value.trim();
    if (!text) { showDemoError('Add some study notes first.'); return; }
    clearDemoError();

    const mode = demo.mode && RESULT_TITLES[demo.mode.value] ? demo.mode.value : 'summary';
    demo.busy = true;
    setGenerateBusy(true);
    showAILoading(mode);

    // Simulated processing time (about 1 to 1.5 seconds)
    demo.timers.push(setTimeout(() => {
      let nodes;
      try {
        nodes = buildResult(mode, text);
      } catch (err) {
        nodes = [h('p', { text: 'Something went wrong while generating your study set. Please try again.' })];
      }
      showAIResult(nodes, mode);
    }, 1000 + Math.random() * 500));
  }

  function resetAIDemo() {
    clearDemoTimers();
    demo.busy = false;
    setGenerateBusy(false);
    hideAILoading();
    demo.output.hidden = true;
    demo.output.replaceChildren();
    if (demo.empty) demo.empty.hidden = false;
    if (demo.title) demo.title.textContent = demo.titleDefault;
    demo.notes.value = '';
    if (demo.mode) demo.mode.selectedIndex = 0;
    clearDemoError();
    updateDemoCounter();
    demo.notes.focus();
  }

  function initAIDemo() {
    Object.assign(demo, {
      form: $('#demo-form'), notes: $('#demo-notes'), mode: $('#demo-mode'), generate: $('#demo-generate'),
      clear: $('#demo-clear'), sample: $('#demo-sample'), error: $('#demo-error'), loading: $('#demo-loading'),
      loadingText: $('#demo-loading-text'), empty: $('#demo-empty'), output: $('#demo-output'),
      title: $('#demo-result-title'), words: $('#demo-word-count'), chars: $('#demo-char-count'), wrap: $('#demo-result-wrap')
    });
    if (!demo.notes || !demo.generate || !demo.output) return;
    if (demo.notes.dataset.demoReady) return; // never bind twice
    demo.notes.dataset.demoReady = 'true';

    demo.label = demo.generate.textContent.trim();
    demo.titleDefault = demo.title ? demo.title.textContent : '';

    demo.notes.addEventListener('input', () => { updateDemoCounter(); clearDemoError(); });

    if (demo.form) {
      demo.form.addEventListener('submit', handleGenerate);
      // Native reset would skip our extra cleanup, so handle it ourselves
      demo.form.addEventListener('reset', (e) => { e.preventDefault(); resetAIDemo(); });
    } else {
      demo.generate.addEventListener('click', handleGenerate);
      if (demo.clear) demo.clear.addEventListener('click', resetAIDemo);
    }
    if (demo.sample) {
      demo.sample.addEventListener('click', () => {
        demo.notes.value = SAMPLE_NOTES;
        updateDemoCounter();
        clearDemoError();
        demo.notes.focus();
      });
    }
    updateDemoCounter();
  }

  /* ---------- 10. Interactive quiz preview ---------- */
  const QUIZ_QUESTIONS = [
    {
      question: 'What is the primary function of chlorophyll?',
      options: ['Absorb light', 'Produce oxygen', 'Absorb water', 'Store glucose'],
      answer: 0,
      explanation: 'Chlorophyll absorbs light energy, which powers the reactions of photosynthesis. Oxygen is only a by-product.'
    },
    {
      question: 'What must be true about a list before you can use binary search on it?',
      options: ['Every value must be unique', 'It must be sorted', 'It must contain numbers only', 'It must be stored as a linked list'],
      answer: 1,
      explanation: 'Binary search halves the search range by comparing to the middle item, which only works when the data is in order.'
    },
    {
      question: 'What is the derivative of f(x) = x² at x = 3?',
      options: ['9', '3', '6', '12'],
      answer: 2,
      explanation: 'The derivative of x² is 2x, so at x = 3 the slope is 2 × 3 = 6.'
    },
    {
      question: 'An object has zero net force acting on it. Which statement must be true?',
      options: ['It must be at rest', 'Its speed increases steadily', 'It must move in a circle', 'Its velocity stays constant'],
      answer: 3,
      explanation: 'With no net force there is no acceleration. The object stays at rest or keeps moving at constant velocity.'
    },
    {
      question: 'Which gas makes up the largest share of Earth’s atmosphere?',
      options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'],
      answer: 2,
      explanation: 'Nitrogen makes up about 78% of the atmosphere. Oxygen is about 21%.'
    }
  ];

  function quizResultMessage(pct) {
    if (pct >= 90) return 'Excellent work! You have a strong understanding of these concepts.';
    if (pct >= 70) return 'Great job! A little more practice can make you even stronger.';
    if (pct >= 50) return 'Good start! Review the topics you missed and try again.';
    return 'Keep practicing! Review the concepts and give it another try.';
  }

  function initInteractiveQuiz() {
    const card = $('#quiz-card');
    const form = $('#quiz-form');
    const optionsEl = $('#quiz-options');
    const nextBtn = $('#quiz-next');
    const questionEl = $('#quiz-question');
    if (!card || !form || !optionsEl || !nextBtn || !questionEl) return;
    if (card.dataset.quizReady) return; // never bind twice
    card.dataset.quizReady = 'true';

    const ui = {
      number: $('#quiz-number'), current: $('#quiz-current'), total: $('#quiz-total'),
      progress: $('#quiz-progress'), feedback: $('#quiz-feedback'), score: $('#quiz-score'),
      fieldset: $('.quiz-card__fieldset', form), footer: $('.quiz-card__footer', form)
    };
    const total = QUIZ_QUESTIONS.length;
    const STATE_CLASSES = ['is-correct', 'correct', 'is-incorrect', 'incorrect', 'is-selected', 'selected'];
    let index = 0;
    let score = 0;
    let answered = false;
    let results = null;

    const getButtons = () => $$('.quiz-option', optionsEl);
    // Make sure there are four real <button> answers to work with
    while (getButtons().length < 4) {
      optionsEl.appendChild(h('button', { cls: 'quiz-option', attrs: { type: 'button' } }, [
        h('span', { cls: 'quiz-option__letter' }), h('span', { cls: 'quiz-option__text' })
      ]));
    }

    function updateProgress(n) {
      const pct = Math.round((n / total) * 100);
      if (ui.current && ui.total) {
        ui.current.textContent = String(n);
        ui.total.textContent = String(total);
      } else if (ui.number) {
        ui.number.textContent = 'Question ' + n + ' of ' + total;
      }
      if (ui.progress) {
        ui.progress.max = total;
        ui.progress.value = n;
        ui.progress.setAttribute('aria-valuetext', 'Question ' + n + ' of ' + total + ', ' + pct + '%');
      }
      if (ui.score) ui.score.textContent = String(score);
    }

    function render() {
      const q = QUIZ_QUESTIONS[index];
      answered = false;
      questionEl.textContent = q.question;
      getButtons().forEach((btn, i) => {
        const letter = $('.quiz-option__letter', btn);
        const text = $('.quiz-option__text', btn);
        if (letter) letter.textContent = LETTERS[i] || '';
        if (text) text.textContent = q.options[i] || '';
        btn.hidden = i >= q.options.length;
        btn.disabled = false;
        btn.classList.remove(...STATE_CLASSES);
        btn.removeAttribute('data-correct');
      });
      if (ui.feedback) {
        ui.feedback.hidden = true;
        ui.feedback.className = 'quiz-card__feedback';
        ui.feedback.textContent = '';
      }
      nextBtn.disabled = true;
      nextBtn.textContent = index === total - 1 ? 'See Your Results' : 'Next Question';
      updateProgress(index + 1);
    }

    function choose(i) {
      if (answered) return; // one answer per question, score counted once
      answered = true;
      const q = QUIZ_QUESTIONS[index];
      const ok = i === q.answer;
      if (ok) score++;

      getButtons().forEach((btn, n) => {
        btn.disabled = true;
        btn.dataset.correct = String(n === q.answer);
        if (n === q.answer) btn.classList.add('is-correct', 'correct');
        else if (n === i) btn.classList.add('is-incorrect', 'incorrect');
      });
      if (ui.feedback) {
        ui.feedback.className = 'quiz-card__feedback ' + (ok ? 'is-correct correct' : 'is-incorrect incorrect');
        ui.feedback.textContent = (ok ? 'Correct! ' : 'Not quite. The correct answer is ' + LETTERS[q.answer] + ': ' + q.options[q.answer] + '. ') + q.explanation;
        ui.feedback.hidden = false;
      }
      if (ui.score) ui.score.textContent = String(score);
      nextBtn.disabled = false;
      nextBtn.focus();
    }

    // Show or hide the question view (used when switching to results)
    function setQuestionView(visible) {
      (ui.fieldset || optionsEl).hidden = !visible;
      if (ui.footer) ui.footer.hidden = !visible;
      else nextBtn.hidden = !visible;
      if (!visible && ui.feedback) ui.feedback.hidden = true;
    }

    function ensureResults() {
      if (results) return results;
      const title = h('h3', { style: { fontSize: '1.6rem' } });
      const pct = h('p', { style: { fontSize: '2.4rem', fontWeight: '700', lineHeight: '1', color: 'var(--accent)' } });
      const breakdown = h('p', { style: mutedStyle });
      const message = h('p');
      const note = h('p', { text: 'This is a practice score, not an official grade.', style: mutedStyle });
      const restart = h('button', { cls: 'btn btn--primary', text: 'Restart Quiz', attrs: { type: 'button' }, style: { alignSelf: 'start' } });
      const box = h('div', { attrs: { 'aria-live': 'polite', tabindex: '-1' }, style: { display: 'grid', gap: '12px' } },
        [title, pct, breakdown, message, note, restart]);
      box.hidden = true;
      form.appendChild(box);
      restart.addEventListener('click', restartQuiz);
      results = { box, title, pct, breakdown, message };
      return results;
    }

    function showResults() {
      const r = ensureResults();
      const pct = Math.round((score / total) * 100);
      updateProgress(total);
      setQuestionView(false);
      r.title.textContent = score + ' / ' + total + ' Correct';
      r.pct.textContent = pct + '%';
      r.breakdown.textContent = 'Correct: ' + score + ' · Incorrect: ' + (total - score);
      r.message.textContent = quizResultMessage(pct);
      r.box.hidden = false;
      r.box.focus();
    }

    function restartQuiz() {
      index = 0;
      score = 0;
      if (results) results.box.hidden = true;
      setQuestionView(true);
      render();
      const first = getButtons()[0];
      if (first) first.focus();
    }

    // Event delegation for answer buttons
    optionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.quiz-option');
      if (!btn || btn.disabled) return;
      const i = getButtons().indexOf(btn);
      if (i > -1) choose(i);
    });
    nextBtn.addEventListener('click', () => {
      if (!answered) return;
      if (index < total - 1) {
        index++;
        render();
        const first = getButtons()[0];
        if (first) first.focus();
      } else {
        showResults();
      }
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    render();
  }

  /* ---------- Init ---------- */
  function init() {
    cacheDom();
    [
      initMobileNavigation,
      initSmoothNavigation,
      initActiveNavigation,
      initScrollReveal,
      initHeroParallax,
      initNavbarScroll,
      initButtonInteractions,
      initAIDemo,
      initInteractiveQuiz,
      initBackToTop
    ].forEach((fn) => {
      try { fn(); } catch (err) { console.warn('StudyMind: ' + fn.name + ' skipped', err); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
