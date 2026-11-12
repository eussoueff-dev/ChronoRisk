/* ChronoRisk: Micromort & Microlife Daily Calculator
 * Vanilla JS, no backend. All state lives in localStorage.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. DATA
   * ------------------------------------------------------------------ */

  // SSA Office of the Chief Actuary, 2021 period life table (2024 Trustees Report).
  // q(x) = probability of dying within one year, ages 18..90 (73 values each).
  const LIFE_TABLE = {
    label: 'SSA 2021 period life table',
    startAge: 18,
    endAge: 90,
    male: [
      0.001100, 0.001270, 0.001373, 0.001488, 0.001605, 0.001714, 0.001835, 0.001963, 0.002082, 0.002202,
      0.002330, 0.002457, 0.002574, 0.002683, 0.002787, 0.002881, 0.002974, 0.003074, 0.003175, 0.003295,
      0.003444, 0.003608, 0.003780, 0.003958, 0.004144, 0.004337, 0.004540, 0.004774, 0.005064, 0.005399,
      0.005796, 0.006214, 0.006671, 0.007167, 0.007736, 0.008351, 0.009035, 0.009770, 0.010567, 0.011398,
      0.012291, 0.013224, 0.014267, 0.015353, 0.016484, 0.017617, 0.018759, 0.019914, 0.021104, 0.022423,
      0.023847, 0.025357, 0.027050, 0.028970, 0.031188, 0.033754, 0.036747, 0.040563, 0.044308, 0.048498,
      0.053229, 0.058778, 0.064617, 0.070947, 0.077834, 0.085686, 0.094809, 0.105090, 0.116592, 0.129306,
      0.142732, 0.157638, 0.174458
    ],
    female: [
      0.000418, 0.000461, 0.000507, 0.000556, 0.000610, 0.000666, 0.000722, 0.000775, 0.000831, 0.000889,
      0.000952, 0.001025, 0.001104, 0.001192, 0.001289, 0.001383, 0.001465, 0.001544, 0.001626, 0.001719,
      0.001824, 0.001940, 0.002066, 0.002202, 0.002351, 0.002482, 0.002622, 0.002789, 0.002994, 0.003219,
      0.003467, 0.003729, 0.004011, 0.004306, 0.004634, 0.004981, 0.005370, 0.005831, 0.006326, 0.006837,
      0.007399, 0.008033, 0.008687, 0.009411, 0.010139, 0.010849, 0.011550, 0.012216, 0.012952, 0.013844,
      0.014863, 0.016028, 0.017329, 0.018859, 0.020609, 0.022620, 0.024958, 0.027906, 0.030925, 0.034140,
      0.037620, 0.041725, 0.046324, 0.051334, 0.056911, 0.063279, 0.070704, 0.079184, 0.088697, 0.099240,
      0.110480, 0.123078, 0.137152
    ]
  };

  // Gompertz-Makeham fallback, q(x) = A + B * e^(c*x).
  // Fitted by least squares on ln(q) to the table above, ages 18..90.
  const GOMPERTZ = {
    male:    { A: 9.6085e-4, B: 1.1122e-4, c: 0.07971 },
    female:  { A: 2.5268e-4, B: 5.9995e-5, c: 0.08315 },
    average: { A: 6.1821e-4, B: 8.3549e-5, c: 0.08136 }
  };

  const NORM = 'Spiegelhalter & Blastland, The Norm Chronicles (2013)';
  const BMJ = 'Spiegelhalter, BMJ 2012;345:e8223';

  // Micromorts per unit.
  const ACUTE = [
    { id: 'car', phrase: 'driving', name: 'Car', icon: '🚗', unit: 'km', per: 0.0025, max: 1000, step: 1, conf: 'High',
      src: `${NORM}: about 1 micromort per 400 km (≈250 miles) by car.` },
    { id: 'motorcycle', phrase: 'motorcycling', name: 'Motorcycle', icon: '🏍️', unit: 'km', per: 0.1, max: 500, step: 1, conf: 'High',
      src: `${NORM}: about 1 micromort per 10 km (≈6 miles) by motorbike.` },
    { id: 'flight', phrase: 'flying', name: 'Commercial flight', icon: '✈️', unit: 'km', per: 0.0006, max: 15000, step: 50, conf: 'Medium',
      src: `${NORM}: about 1 micromort per 1,600 km (≈1,000 miles) by jet. Most risk is at take-off and landing, so per-km is an approximation.` },
    { id: 'walking', phrase: 'walking', name: 'Walking', icon: '🚶', unit: 'km', per: 0.03, max: 40, step: 0.5, conf: 'Medium',
      src: `${NORM}: about 1 micromort per 32 km (≈20 miles), mostly pedestrian road deaths.` },
    { id: 'running', phrase: 'running or cardio', name: 'Running or intense cardio', icon: '🏃', unit: 'session', per: 0.5, max: 5, step: 1, conf: 'Low',
      src: 'Rough estimate from exercise-related sudden cardiac death rates (a marathon is about 7 micromorts).' },
    { id: 'scuba', phrase: 'scuba diving', name: 'Scuba diving', icon: '🤿', unit: 'dive', per: 5, max: 6, step: 1, conf: 'Medium',
      src: `${NORM}, from Divers Alert Network data: about 5 micromorts per dive.` },
    { id: 'skydiving', phrase: 'skydiving', name: 'Skydiving', icon: '🪂', unit: 'jump', per: 8, max: 10, step: 1, conf: 'Medium',
      src: `${NORM}, from US Parachute Association data: about 8 micromorts per jump (recent years are somewhat lower).` }
  ];

  // Microlives per day.
  const HABITS = [
    { id: 'exercise', type: 'choice', name: 'Exercise', icon: '💪', conf: 'Medium',
      src: `${BMJ}: first 20 min of moderate exercise ≈ +2, the next 40 min ≈ +1 more.`,
      options: [
        { v: 'none', label: 'None', ml: 0 },
        { v: 'moderate', label: '20 min moderate', ml: 2 },
        { v: 'vigorous', label: '40+ min vigorous', ml: 3 }
      ] },
    { id: 'fruitveg', type: 'toggle', name: '5 servings of fruit and vegetables', icon: '🥦', ml: 4, conf: 'Medium',
      src: `${BMJ}: 5 or more servings a day ≈ +4 (based on blood vitamin C cohort data).` },
    { id: 'sleep', type: 'toggle', name: '7 to 8 hours of sleep', icon: '😴', ml: 1, conf: 'Low',
      src: 'Cohort studies of sleep duration. The effect is U-shaped: both short and long sleep are linked to higher mortality, so this value is rough.' },
    { id: 'sitting', type: 'toggle', name: '2+ hours of prolonged sitting', icon: '🛋️', ml: -1, conf: 'Medium',
      src: `${BMJ}: 2 hours watching TV (sedentary time) ≈ −1.` },
    { id: 'meat', type: 'stepper', name: 'Red or processed meat', icon: '🥩', unit: 'serving', ml: -1, max: 4, conf: 'Medium',
      src: `${BMJ}: each serving (≈85 g red meat, e.g. a burger) ≈ −1.` },
    { id: 'sugary', type: 'stepper', name: 'Sugary drink', icon: '🥤', unit: 'serving', ml: -1, max: 4, conf: 'Low',
      src: 'Extrapolated from cohort studies of sugar-sweetened beverages and mortality. Rough estimate.' },
    { id: 'cigs', type: 'stepper', name: 'Cigarettes', icon: '🚬', unit: 'cigarette', ml: -0.5, max: 40, conf: 'High',
      src: `${BMJ}: 15 to 24 cigarettes a day ≈ −10, about −0.5 per cigarette.` },
    { id: 'alcohol', type: 'stepper', name: 'Alcoholic drinks', icon: '🍷', unit: 'drink', ml: -0.5, max: 10, conf: 'Medium',
      src: `${BMJ}: each drink beyond the first ≈ −0.5 (here applied to every drink, ignoring any contested first-drink benefit).` }
  ];

  const BUILTIN_PRESETS = [
    { name: 'Daily commute', acute: { car: 40, walking: 2 } },
    { name: 'Weekend ride', acute: { motorcycle: 120 } },
    { name: 'Long-haul trip', acute: { flight: 6000, car: 60 } },
    { name: 'Run day', acute: { running: 1, walking: 3 } },
    { name: 'Dive trip', acute: { scuba: 2, car: 30 } },
    { name: 'Skydive day', acute: { skydiving: 2, car: 100 } }
  ];

  // Soft cap on net microlives: linear up to the knee, then tanh toward the ceiling.
  const CAP = { posKnee: 6, posMax: 10, negKnee: 10, negMax: 25 };

  const SKYDIVE_MM = 8;
  const CAR_MM_PER_KM = 0.0025;
  const STORAGE_KEY = 'chronorisk:v1';
  const SEX_LABEL = { male: 'male', female: 'female', average: 'sex-averaged' };

  /* ------------------------------------------------------------------ *
   * 2. CORE LOGIC
   * ------------------------------------------------------------------ */

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function tableIsValid(arr) {
    const n = LIFE_TABLE.endAge - LIFE_TABLE.startAge + 1;
    return Array.isArray(arr) && arr.length === n && arr.every(v => Number.isFinite(v) && v > 0 && v < 1);
  }

  function interpolate(arr, age) {
    const x = clamp(age, LIFE_TABLE.startAge, LIFE_TABLE.endAge) - LIFE_TABLE.startAge;
    const i = Math.floor(x);
    if (i >= arr.length - 1) return arr[arr.length - 1];
    const f = x - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  /** Annual probability of death q(x). Uses the table, or Gompertz-Makeham if the table is unusable. */
  function annualQ(age, sex) {
    const okM = tableIsValid(LIFE_TABLE.male);
    const okF = tableIsValid(LIFE_TABLE.female);
    if (sex === 'male' && okM) return { q: interpolate(LIFE_TABLE.male, age), method: 'table' };
    if (sex === 'female' && okF) return { q: interpolate(LIFE_TABLE.female, age), method: 'table' };
    if (sex === 'average' && okM && okF) {
      return { q: (interpolate(LIFE_TABLE.male, age) + interpolate(LIFE_TABLE.female, age)) / 2, method: 'table' };
    }
    const g = GOMPERTZ[sex] || GOMPERTZ.average;
    return { q: clamp(g.A + g.B * Math.exp(g.c * age), 0, 0.999), method: 'gompertz' };
  }

  function softCap(raw) {
    const a = Math.abs(raw);
    const knee = raw >= 0 ? CAP.posKnee : CAP.negKnee;
    const max = raw >= 0 ? CAP.posMax : CAP.negMax;
    if (a <= knee) return raw;
    const span = max - knee;
    return Math.sign(raw) * (knee + span * Math.tanh((a - knee) / span));
  }

  function habitContributions(h) {
    return HABITS.map(def => {
      let ml = 0;
      let active = false;
      if (def.type === 'choice') {
        const opt = def.options.find(o => o.v === h[def.id]) || def.options[0];
        ml = opt.ml; active = opt.ml !== 0;
      } else if (def.type === 'toggle') {
        active = !!h[def.id]; ml = active ? def.ml : 0;
      } else {
        const n = h[def.id] || 0; active = n > 0; ml = n * def.ml;
      }
      return { id: def.id, name: def.name, ml, active };
    });
  }

  /** Full calculation for one day. */
  function compute(day, age, sex) {
    const { q, method } = annualQ(age, sex);
    const baseMm = (q / 365.25) * 1e6;
    const pBase = baseMm / 1e6;

    // Combine independent risks: P(death) = 1 - (1 - p_base) * prod (1 - p_unit)^qty.
    let logSurvival = Math.log1p(-pBase);
    const contribs = ACUTE.map(a => {
      const qty = day.acute[a.id] || 0;
      const pUnit = a.per / 1e6;
      logSurvival += qty * Math.log1p(-pUnit);
      return { id: a.id, name: a.name, phrase: a.phrase, mm: qty * a.per };
    });
    const extraMm = contribs.reduce((s, c) => s + c.mm, 0);
    const pTotal = -Math.expm1(logSurvival);
    const totalMm = pTotal * 1e6;

    const habits = habitContributions(day.habits);
    const rawMl = habits.reduce((s, c) => s + c.ml, 0);
    const netMl = softCap(rawMl);

    return {
      q, method, baseMm, extraMm, contribs, pTotal, totalMm,
      odds: pTotal > 0 ? 1 / pTotal : Infinity,
      survivalPct: (1 - pTotal) * 100,
      habits, rawMl, netMl, capped: Math.abs(rawMl - netMl) > 1e-9,
      minutes: netMl * 30,
      yearDays: netMl * 30 * 365 / 1440
    };
  }

  /* ------------------------------------------------------------------ *
   * 3. STATE AND PERSISTENCE
   * ------------------------------------------------------------------ */

  function emptyDay() {
    const acute = {};
    ACUTE.forEach(a => { acute[a.id] = 0; });
    const habits = {};
    HABITS.forEach(h => { habits[h.id] = h.type === 'choice' ? 'none' : h.type === 'toggle' ? false : 0; });
    return { acute, habits };
  }

  function cloneDay(d) { return { acute: { ...d.acute }, habits: { ...d.habits } }; }

  function sanitizeDay(raw) {
    const day = emptyDay();
    if (!raw || typeof raw !== 'object') return day;
    ACUTE.forEach(a => {
      const v = Number(raw.acute && raw.acute[a.id]);
      if (Number.isFinite(v)) day.acute[a.id] = clamp(v, 0, a.max);
    });
    HABITS.forEach(h => {
      const v = raw.habits ? raw.habits[h.id] : undefined;
      if (h.type === 'choice') { if (h.options.some(o => o.v === v)) day.habits[h.id] = v; }
      else if (h.type === 'toggle') day.habits[h.id] = v === true;
      else { const n = Math.round(Number(v)); if (Number.isFinite(n)) day.habits[h.id] = clamp(n, 0, h.max); }
    });
    return day;
  }

  function defaultState() {
    // compareLinked: while true, the changed day mirrors the current day until the user edits it.
    return { age: 35, sex: 'average', day: emptyDay(), compare: null, compareLinked: true, customPresets: [] };
  }

  function loadState() {
    const s = defaultState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return s;
      const data = JSON.parse(raw);
      const age = Number(data.age);
      if (Number.isFinite(age)) s.age = clamp(age, 18, 90);
      if (['male', 'female', 'average'].includes(data.sex)) s.sex = data.sex;
      s.day = sanitizeDay(data.day);
      s.compare = data.compare ? sanitizeDay(data.compare) : null;
      s.compareLinked = data.compareLinked !== false || !s.compare;
      if (Array.isArray(data.customPresets)) {
        s.customPresets = data.customPresets
          .filter(p => p && typeof p.name === 'string' && p.name.trim())
          .slice(0, 20)
          .map(p => ({ name: p.name.trim().slice(0, 30), ...sanitizeDay(p) }));
      }
    } catch (err) {
      console.warn('ChronoRisk: could not read saved data, using defaults.', err);
    }
    return s;
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('ChronoRisk: could not save data.', err);
    }
  }

  const state = loadState();
  if (!state.compare || state.compareLinked) state.compare = cloneDay(state.day);

  /** Call before any edit to the changed day: stops it mirroring the current day. */
  function unlinkCompare() {
    if (state.compareLinked) { state.compare = cloneDay(state.day); state.compareLinked = false; }
  }

  /* ------------------------------------------------------------------ *
   * 4. FORMATTING
   * ------------------------------------------------------------------ */

  const $ = id => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtMm(x) {
    if (x === 0) return '0';
    if (Math.abs(x) < 0.01) return x.toFixed(4);
    if (Math.abs(x) < 10) return x.toFixed(2);
    if (Math.abs(x) < 100) return x.toFixed(1);
    return Math.round(x).toLocaleString();
  }

  function fmtNum(x, d = 1) {
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function signed(x, d = 1) {
    const r = Number(x.toFixed(d));
    if (r === 0) return fmtNum(0, d);
    return (r > 0 ? '+' : '−') + fmtNum(Math.abs(r), d);
  }

  function fmtOdds(odds) {
    if (!Number.isFinite(odds)) return 'no measurable risk';
    return '1 in ' + Math.round(odds).toLocaleString();
  }

  function fmtSurvival(pct) {
    return pct.toFixed(8) + '%';
  }

  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function trimNum(x) {
    return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2)));
  }

  /* Colour helpers: emerald/cyan for good, amber/rose for risk. */
  function riskTone(extraMm) {
    if (extraMm < 1) return 'good';
    if (extraMm < 10) return 'warn';
    return 'bad';
  }
  function lifeTone(ml) {
    if (ml > 0.05) return 'good';
    if (ml < -0.05) return ml <= -3 ? 'bad' : 'warn';
    return 'neutral';
  }
  const TONE = {
    good:    { text: 'text-emerald-300', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30', fill: '#34d399' },
    warn:    { text: 'text-amber-300',   badge: 'bg-amber-500/10 text-amber-300 border-amber-400/30',       fill: '#fbbf24' },
    bad:     { text: 'text-rose-300',    badge: 'bg-rose-500/10 text-rose-300 border-rose-400/30',          fill: '#fb7185' },
    neutral: { text: 'text-slate-200',   badge: 'bg-slate-500/10 text-slate-300 border-slate-400/30',       fill: '#94a3b8' }
  };
  const TONE_CLASSES = Object.values(TONE).flatMap(t => [...t.text.split(' '), ...t.badge.split(' ')]);

  function setTone(el, tone, kind) {
    el.classList.remove(...TONE_CLASSES);
    el.classList.add(...TONE[tone][kind].split(' '));
  }

  const CONF_CLASS = {
    High: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
    Medium: 'text-sky-300 border-sky-400/30 bg-sky-500/10',
    Low: 'text-amber-300 border-amber-400/30 bg-amber-500/10'
  };
  const confChip = c => `<span class="rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONF_CLASS[c]}" title="Confidence in this estimate">${c} confidence</span>`;

  function setRangeFill(range, color) {
    const min = Number(range.min), max = Number(range.max), v = Number(range.value);
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    range.style.setProperty('--pct', pct + '%');
    if (color) range.style.setProperty('--fill', color);
  }

  /* ------------------------------------------------------------------ *
   * 5. BUILD UI
   * ------------------------------------------------------------------ */

  function buildAcute() {
    $('acuteList').innerHTML = ACUTE.map(a => `
      <div class="rounded-xl glass-inner p-3" data-acute="${a.id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <label for="ac-range-${a.id}" class="font-medium text-slate-100"><span aria-hidden="true">${a.icon}</span> ${a.name}</label>
            <div class="text-[11px] text-slate-500">${a.per} µmt per ${a.unit}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <input id="ac-num-${a.id}" type="number" min="0" max="${a.max}" step="${a.step}" inputmode="decimal"
              aria-label="${a.name} amount in ${a.unit}s"
              class="w-24 rounded-lg bg-slate-900/60 border border-slate-600/40 px-2 py-1 text-right text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            <span class="text-xs text-slate-500 w-14">${a.unit}${a.unit === 'km' ? '' : 's'}</span>
          </div>
        </div>
        <input id="ac-range-${a.id}" type="range" min="0" max="${a.max}" step="${a.step}" class="mt-2" />
        <div class="flex flex-wrap items-center justify-between gap-2 mt-1">
          <div class="flex items-center gap-2">${confChip(a.conf)}
            <span id="ac-mm-${a.id}" class="rounded-full border px-2 py-0.5 text-[10px] font-semibold">0 µmt</span>
          </div>
          <details class="text-[11px] text-slate-500"><summary class="hover:text-slate-300">Source</summary><p class="mt-1 max-w-md">${a.src}</p></details>
        </div>
      </div>`).join('');

    ACUTE.forEach(a => {
      const range = $(`ac-range-${a.id}`);
      const num = $(`ac-num-${a.id}`);
      range.addEventListener('input', () => {
        state.day.acute[a.id] = Number(range.value);
        num.value = trimNum(state.day.acute[a.id]);
        update();
      });
      num.addEventListener('input', () => {
        const v = Number(num.value);
        if (num.value === '' || !Number.isFinite(v)) return;
        state.day.acute[a.id] = clamp(v, 0, a.max);
        update({ skipInput: num });
      });
      num.addEventListener('change', () => {
        const v = Number(num.value);
        state.day.acute[a.id] = Number.isFinite(v) ? clamp(v, 0, a.max) : 0;
        num.value = trimNum(state.day.acute[a.id]);
        range.value = state.day.acute[a.id];
        update();
      });
    });
  }

  function buildHabits() {
    $('habitList').innerHTML = HABITS.map(h => {
      let control = '';
      if (h.type === 'choice') {
        control = `<div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/50 p-1" role="radiogroup" aria-label="${h.name}">
          ${h.options.map(o => `<button type="button" role="radio" data-habit="${h.id}" data-value="${o.v}"
              class="habit-opt rounded-lg px-2 py-1.5 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              ${o.label}<span class="block text-[10px] opacity-70">${o.ml ? '+' + o.ml + ' ML' : '0 ML'}</span></button>`).join('')}
        </div>`;
      } else if (h.type === 'toggle') {
        control = `<label class="inline-flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" id="hb-${h.id}" class="peer sr-only" />
          <span class="relative w-11 h-6 rounded-full bg-slate-600/60 transition peer-checked:bg-${h.ml > 0 ? 'emerald' : 'rose'}-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400
                       after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5"></span>
          <span class="text-xs text-slate-400">${h.ml > 0 ? '+' : '−'}${Math.abs(h.ml)} ML when on</span>
        </label>`;
      } else {
        control = `<div class="flex items-center gap-2">
          <button type="button" data-step="${h.id}" data-dir="-1" aria-label="Fewer ${h.name}"
            class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-600/40 hover:bg-slate-700 text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">−</button>
          <input id="hb-${h.id}" type="number" min="0" max="${h.max}" step="1" inputmode="numeric" aria-label="${h.name} per day"
            class="w-14 rounded-lg bg-slate-900/60 border border-slate-600/40 px-2 py-1 text-center text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          <button type="button" data-step="${h.id}" data-dir="1" aria-label="More ${h.name}"
            class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-600/40 hover:bg-slate-700 text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">+</button>
          <span class="text-xs text-slate-500">0 to ${h.max} · ${h.ml} ML each</span>
        </div>`;
      }
      return `<div class="rounded-xl glass-inner p-3 space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div class="font-medium text-slate-100"><span aria-hidden="true">${h.icon}</span> ${h.name}</div>
          <span id="hb-badge-${h.id}" class="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums">0 ML</span>
        </div>
        ${control}
        <div class="flex flex-wrap items-center justify-between gap-2">
          ${confChip(h.conf)}
          <details class="text-[11px] text-slate-500"><summary class="hover:text-slate-300">Source</summary><p class="mt-1 max-w-md">${h.src}</p></details>
        </div>
      </div>`;
    }).join('');

    $('habitList').addEventListener('click', e => {
      const opt = e.target.closest('.habit-opt');
      if (opt) { state.day.habits[opt.dataset.habit] = opt.dataset.value; update(); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const def = HABITS.find(h => h.id === step.dataset.step);
        state.day.habits[def.id] = clamp((state.day.habits[def.id] || 0) + Number(step.dataset.dir), 0, def.max);
        update();
      }
    });

    HABITS.forEach(h => {
      if (h.type === 'toggle') {
        $(`hb-${h.id}`).addEventListener('change', e => { state.day.habits[h.id] = e.target.checked; update(); });
      } else if (h.type === 'stepper') {
        const inp = $(`hb-${h.id}`);
        inp.addEventListener('input', () => {
          const v = Math.round(Number(inp.value));
          if (inp.value === '' || !Number.isFinite(v)) return;
          state.day.habits[h.id] = clamp(v, 0, h.max);
          update({ skipInput: inp });
        });
        inp.addEventListener('change', () => {
          const v = Math.round(Number(inp.value));
          state.day.habits[h.id] = Number.isFinite(v) ? clamp(v, 0, h.max) : 0;
          update();
        });
      }
    });
  }

  function applyAcutePreset(acute) {
    ACUTE.forEach(a => { state.day.acute[a.id] = clamp(Number(acute[a.id]) || 0, 0, a.max); });
  }

  function buildPresets() {
    const btn = 'rounded-full px-3 py-1 text-xs border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';
    $('presetBar').innerHTML = BUILTIN_PRESETS.map((p, i) =>
      `<button type="button" data-preset="${i}" class="${btn} bg-cyan-500/10 text-cyan-200 border-cyan-400/25 hover:bg-cyan-500/20"
        title="${escapeHtml(Object.entries(p.acute).map(([k, v]) => `${ACUTE.find(a => a.id === k).name}: ${v} ${ACUTE.find(a => a.id === k).unit}`).join(', '))}">${p.name}</button>`
    ).join('') + `<button type="button" data-preset="clear" class="${btn} bg-slate-700/40 text-slate-300 border-slate-500/30 hover:bg-slate-700/70">Clear activities</button>`;

    $('presetBar').addEventListener('click', e => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      applyAcutePreset(b.dataset.preset === 'clear' ? {} : BUILTIN_PRESETS[Number(b.dataset.preset)].acute);
      update();
    });

    $('savePresetBtn').addEventListener('click', saveCustomPreset);
    $('presetName').addEventListener('keydown', e => { if (e.key === 'Enter') saveCustomPreset(); });

    $('customPresetBar').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const i = Number(del.dataset.del);
        const name = state.customPresets[i] && state.customPresets[i].name;
        state.customPresets.splice(i, 1);
        $('presetMsg').textContent = `Deleted preset "${name}".`;
        update();
        return;
      }
      const use = e.target.closest('[data-custom]');
      if (use) {
        const p = state.customPresets[Number(use.dataset.custom)];
        if (p) { state.day = sanitizeDay(p); $('presetMsg').textContent = `Loaded preset "${p.name}".`; update(); }
      }
    });
  }

  function saveCustomPreset() {
    const input = $('presetName');
    const name = input.value.trim().slice(0, 30);
    if (!name) { $('presetMsg').textContent = 'Type a name for the preset first.'; input.focus(); return; }
    const existing = state.customPresets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    const preset = { name, ...cloneDay(state.day) };
    if (existing >= 0) state.customPresets[existing] = preset;
    else {
      if (state.customPresets.length >= 20) { $('presetMsg').textContent = 'You can keep up to 20 custom presets. Delete one first.'; return; }
      state.customPresets.push(preset);
    }
    input.value = '';
    $('presetMsg').textContent = existing >= 0 ? `Updated preset "${name}".` : `Saved preset "${name}".`;
    update();
  }

  function renderCustomPresets() {
    const bar = $('customPresetBar');
    if (!state.customPresets.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = state.customPresets.map((p, i) => `
      <span class="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-emerald-200 text-xs">
        <button type="button" data-custom="${i}" class="pl-3 pr-1 py-1 hover:text-white focus:outline-none focus-visible:underline">${escapeHtml(p.name)}</button>
        <button type="button" data-del="${i}" aria-label="Delete preset ${escapeHtml(p.name)}" class="px-2 py-1 text-emerald-300/70 hover:text-rose-300 focus:outline-none focus-visible:text-rose-300">×</button>
      </span>`).join('');
  }

  /* What-if: tweaks and compact editor for the changed day. */
  const TWEAKS = [
    { label: 'Drive instead of ride', fn: d => { d.acute.car = clamp(d.acute.car + d.acute.motorcycle, 0, 1000); d.acute.motorcycle = 0; } },
    { label: 'Skip extreme sports', fn: d => { d.acute.skydiving = 0; d.acute.scuba = 0; } },
    { label: 'Quit smoking', fn: d => { d.habits.cigs = 0; } },
    { label: 'Add 20 min exercise', fn: d => { d.habits.exercise = d.habits.exercise === 'none' ? 'moderate' : 'vigorous'; } },
    { label: 'Halve alcohol', fn: d => { d.habits.alcohol = Math.floor(d.habits.alcohol / 2); } },
    { label: 'Eat 5 a day', fn: d => { d.habits.fruitveg = true; } },
    { label: 'Swap meat and soda for water', fn: d => { d.habits.meat = 0; d.habits.sugary = 0; } },
    { label: 'Break up sitting', fn: d => { d.habits.sitting = false; } }
  ];

  function buildCompare() {
    $('tweakBar').innerHTML = TWEAKS.map((t, i) =>
      `<button type="button" data-tweak="${i}" class="rounded-full px-3 py-1 text-xs border bg-emerald-500/10 text-emerald-200 border-emerald-400/25 hover:bg-emerald-500/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">${t.label}</button>`
    ).join('');
    $('tweakBar').addEventListener('click', e => {
      const b = e.target.closest('[data-tweak]');
      if (!b) return;
      unlinkCompare();
      TWEAKS[Number(b.dataset.tweak)].fn(state.compare);
      update();
    });

    // Re-link: the changed day copies the current day and follows it again until edited.
    $('copyToCompareBtn').addEventListener('click', () => { state.compare = cloneDay(state.day); state.compareLinked = true; update(); });

    const field = 'w-full rounded-lg bg-slate-900/60 border border-slate-600/40 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400';
    const acuteHtml = ACUTE.map(a => `
      <label class="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>${a.icon} ${a.name} <span class="text-slate-500">(${a.unit})</span></span>
        <input type="number" min="0" max="${a.max}" step="${a.step}" data-cmp-acute="${a.id}" class="${field} !w-24 text-right" />
      </label>`).join('');
    const habitHtml = HABITS.map(h => {
      if (h.type === 'choice') {
        return `<label class="flex items-center justify-between gap-2 text-xs text-slate-300"><span>${h.icon} ${h.name}</span>
          <select data-cmp-habit="${h.id}" class="${field} !w-36">${h.options.map(o => `<option value="${o.v}">${o.label}</option>`).join('')}</select></label>`;
      }
      if (h.type === 'toggle') {
        return `<label class="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer"><span>${h.icon} ${h.name}</span>
          <input type="checkbox" data-cmp-habit="${h.id}" class="w-4 h-4 accent-emerald-400" /></label>`;
      }
      return `<label class="flex items-center justify-between gap-2 text-xs text-slate-300"><span>${h.icon} ${h.name}</span>
        <input type="number" min="0" max="${h.max}" step="1" data-cmp-habit="${h.id}" class="${field} !w-20 text-right" /></label>`;
    }).join('');

    $('compareEditor').innerHTML = `
      <fieldset class="space-y-2"><legend class="text-xs uppercase tracking-wide text-slate-500 mb-1">Activities</legend>${acuteHtml}</fieldset>
      <fieldset class="space-y-2"><legend class="text-xs uppercase tracking-wide text-slate-500 mb-1">Habits</legend>${habitHtml}</fieldset>`;

    const editor = $('compareEditor');
    const onEdit = (e, final) => {
      const t = e.target;
      if (t.dataset.cmpAcute || t.dataset.cmpHabit) unlinkCompare();
      if (t.dataset.cmpAcute) {
        const a = ACUTE.find(x => x.id === t.dataset.cmpAcute);
        const v = Number(t.value);
        if (!final && (t.value === '' || !Number.isFinite(v))) return;
        state.compare.acute[a.id] = Number.isFinite(v) ? clamp(v, 0, a.max) : 0;
        update(final ? {} : { skipInput: t });
      } else if (t.dataset.cmpHabit) {
        const h = HABITS.find(x => x.id === t.dataset.cmpHabit);
        if (h.type === 'choice') state.compare.habits[h.id] = t.value;
        else if (h.type === 'toggle') state.compare.habits[h.id] = t.checked;
        else {
          const v = Math.round(Number(t.value));
          if (!final && (t.value === '' || !Number.isFinite(v))) return;
          state.compare.habits[h.id] = Number.isFinite(v) ? clamp(v, 0, h.max) : 0;
        }
        update(final || h.type !== 'stepper' ? {} : { skipInput: t });
      }
    };
    editor.addEventListener('input', e => onEdit(e, false));
    editor.addEventListener('change', e => onEdit(e, true));
  }

  function buildProfile() {
    const range = $('ageRange'), num = $('ageNum');
    range.addEventListener('input', () => { state.age = Number(range.value); update(); });
    num.addEventListener('input', () => {
      const v = Number(num.value);
      if (num.value === '' || !Number.isFinite(v) || v < 18 || v > 90) return;
      state.age = v;
      update({ skipInput: num });
    });
    num.addEventListener('change', () => {
      const v = Number(num.value);
      state.age = Number.isFinite(v) ? clamp(v, 18, 90) : 35;
      update();
    });
    $('sexGroup').addEventListener('click', e => {
      const b = e.target.closest('[data-sex]');
      if (b) { state.sex = b.dataset.sex; update(); }
    });
    $('resetBtn').addEventListener('click', () => {
      if (!window.confirm('Reset all activities and habits for today? Age, sex and saved presets are kept.')) return;
      state.day = emptyDay();
      state.compare = emptyDay();
      state.compareLinked = true;
      update();
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. RENDER
   * ------------------------------------------------------------------ */

  function setVal(el, v, skip) { if (el !== skip && el.value !== String(v)) el.value = v; }

  function renderInputs(skip) {
    // Profile
    setVal($('ageRange'), Math.round(state.age), skip);
    setVal($('ageNum'), trimNum(state.age), skip);
    setRangeFill($('ageRange'), '#22d3ee');
    document.querySelectorAll('.sex-btn').forEach(b => {
      const on = b.dataset.sex === state.sex;
      b.setAttribute('aria-checked', String(on));
      b.className = 'sex-btn px-3 py-1.5 text-sm rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ' +
        (on ? 'bg-cyan-500/20 text-cyan-200 shadow-inner' : 'text-slate-400 hover:text-slate-200');
    });

    // Acute
    ACUTE.forEach(a => {
      const v = state.day.acute[a.id];
      const range = $(`ac-range-${a.id}`);
      setVal(range, v, skip);
      setVal($(`ac-num-${a.id}`), trimNum(v), skip);
      const mm = v * a.per;
      setRangeFill(range, TONE[riskTone(mm)].fill === TONE.good.fill ? '#22d3ee' : TONE[riskTone(mm)].fill);
      const badge = $(`ac-mm-${a.id}`);
      badge.textContent = `${fmtMm(mm)} µmt`;
      setTone(badge, v === 0 ? 'neutral' : riskTone(mm), 'badge');
    });

    // Habits
    HABITS.forEach(h => {
      const v = state.day.habits[h.id];
      if (h.type === 'choice') {
        document.querySelectorAll(`.habit-opt[data-habit="${h.id}"]`).forEach(b => {
          const on = b.dataset.value === v;
          b.setAttribute('aria-checked', String(on));
          b.classList.toggle('bg-emerald-500/20', on);
          b.classList.toggle('text-emerald-200', on);
          b.classList.toggle('text-slate-400', !on);
          b.classList.toggle('hover:text-slate-200', !on);
        });
      } else if (h.type === 'toggle') {
        $(`hb-${h.id}`).checked = !!v;
      } else {
        setVal($(`hb-${h.id}`), v, skip);
      }
    });

    // Compare editor
    ACUTE.forEach(a => setVal(document.querySelector(`[data-cmp-acute="${a.id}"]`), trimNum(state.compare.acute[a.id]), skip));
    HABITS.forEach(h => {
      const el = document.querySelector(`[data-cmp-habit="${h.id}"]`);
      if (h.type === 'toggle') el.checked = !!state.compare.habits[h.id];
      else setVal(el, state.compare.habits[h.id], skip);
    });
  }

  function renderResults(r) {
    // Profile baseline
    $('baselineMm').textContent = fmtMm(r.baseMm);
    $('baselineQ').textContent = r.q.toFixed(6);
    $('baselineMethod').textContent = r.method === 'table' ? LIFE_TABLE.label : 'Gompertz–Makeham fallback';

    // KPI 1: survival
    const rt = riskTone(r.extraMm);
    $('kpiSurvival').textContent = fmtSurvival(r.survivalPct);
    setTone($('kpiSurvival'), rt, 'text');
    $('kpiOdds').textContent = fmtOdds(r.odds) + ' risk of death';
    const mmBadge = $('kpiMmBadge');
    mmBadge.textContent = `${fmtMm(r.totalMm)} µmt`;
    mmBadge.title = `Baseline ${fmtMm(r.baseMm)} + activities ${fmtMm(r.extraMm)} micromorts`;
    setTone(mmBadge, rt, 'badge');
    const logPos = v => clamp((Math.log10(Math.max(v, 0.1)) + 1) / 4, 0, 1) * 100;
    const g = $('gaugeRisk');
    g.style.width = logPos(r.totalMm) + '%';
    g.style.backgroundColor = TONE[rt].fill;
    $('gaugeRiskBase').style.left = `calc(${logPos(r.baseMm)}% - 1px)`;
    $('gaugeRiskBase').title = 'Baseline';
    const sky = r.totalMm / SKYDIVE_MM;
    $('kpiEquiv').textContent = `About ${sky < 10 ? sky.toFixed(sky < 1 ? 2 : 1) : Math.round(sky).toLocaleString()} skydive${Math.abs(sky - 1) < 0.005 ? '' : 's'} `
      + `or ${Math.round(r.totalMm / CAR_MM_PER_KM).toLocaleString()} km of driving. White tick = baseline.`;

    // KPI 2: daily shift
    const lt = lifeTone(r.netMl);
    $('kpiMinutes').textContent = signed(r.minutes, 0);
    setTone($('kpiMinutes'), lt, 'text');
    const mlBadge = $('kpiMlBadge');
    mlBadge.textContent = `${signed(r.netMl, r.capped ? 1 : (Number.isInteger(r.netMl) ? 0 : 1))} ML`;
    setTone(mlBadge, lt, 'badge');
    setCenterGauge($('gaugeLife'), r.netMl / 16, TONE[lt].fill);
    $('kpiCapNote').textContent = r.capped
      ? `Raw sum ${signed(r.rawMl)} ML, softened to ${signed(r.netMl)} ML by the realistic-range cap.`
      : '1 microlife = 30 minutes of life expectancy.';

    // KPI 3: year projection
    $('kpiDays').textContent = signed(r.yearDays, 1);
    setTone($('kpiDays'), lt, 'text');
    const yb = $('kpiYearBadge');
    yb.textContent = r.yearDays > 0.05 ? 'gained' : r.yearDays < -0.05 ? 'lost' : 'neutral';
    setTone(yb, lt, 'badge');
    $('kpiYearSub').textContent = r.yearDays > 0.05
      ? 'of life expectancy gained per year of these habits'
      : r.yearDays < -0.05 ? 'of life expectancy lost per year of these habits' : 'no net change from these habits';
    setCenterGauge($('gaugeYear'), r.yearDays / 120, TONE[lt].fill);

    // Section totals
    $('acuteExtra').textContent = `${fmtMm(r.extraMm)} µmt`;
    setTone($('acuteExtra'), r.extraMm === 0 ? 'neutral' : rt, 'text');
    $('habitNet').textContent = `${signed(r.rawMl)} ML`;
    setTone($('habitNet'), lifeTone(r.rawMl), 'text');

    // Habit badges
    r.habits.forEach(c => {
      const b = $(`hb-badge-${c.id}`);
      b.textContent = c.ml === 0 ? '0 ML' : `${signed(c.ml, Number.isInteger(c.ml) ? 0 : 1)} ML`;
      setTone(b, c.ml > 0 ? 'good' : c.ml < 0 ? (c.ml <= -3 ? 'bad' : 'warn') : 'neutral', 'badge');
    });
  }

  function setCenterGauge(el, frac, color) {
    const f = clamp(frac, -1, 1);
    const w = Math.abs(f) * 50;
    el.style.width = w + '%';
    el.style.left = (f >= 0 ? 50 : 50 - w) + '%';
    el.style.backgroundColor = color;
  }

  function sexPhrase() {
    return state.sex === 'average' ? 'sex-averaged figures' : SEX_LABEL[state.sex];
  }

  function renderExplain(r) {
    const age = trimNum(state.age);
    const top = [...r.contribs].sort((a, b) => b.mm - a.mm)[0];
    const parts = [];

    let p1 = `At age ${age} (${sexPhrase()}), the life table puts your background risk at about <b class="text-cyan-300">${fmtMm(r.baseMm)} micromorts</b> a day. `;
    if (r.extraMm > 0) {
      const share = r.extraMm > 0 ? Math.round((top.mm / r.extraMm) * 100) : 0;
      p1 += `Today's extra activities add <b class="${TONE[riskTone(r.extraMm)].text}">${fmtMm(r.extraMm)}</b>, `
        + `${share >= 99 ? 'all' : share + '%'} of it from ${top.phrase}. `;
      const mult = r.totalMm / r.baseMm;
      if (mult >= 1.05) p1 += `That makes today about <b>${mult < 10 ? mult.toFixed(1) : Math.round(mult)}×</b> as risky as an ordinary day for someone like you. `;
    } else {
      p1 += 'You have not added any activity above normal, so today\'s risk is just the baseline. ';
    }
    p1 += `Overall that is roughly a <b>${fmtOdds(r.odds)}</b> chance of dying today, so a ${fmtSurvival(r.survivalPct)} chance of getting through it.`;
    parts.push(p1);

    let p2;
    if (Math.abs(r.rawMl) < 1e-9) {
      p2 = 'Your habits as entered have no net effect on life expectancy in this model. Try adding exercise or fruit and vegetables to see the effect.';
    } else {
      const gainLoss = r.netMl > 0 ? 'gain' : 'loss';
      p2 = `If you kept today's habits up for years, research averages suggest a ${gainLoss} of about <b class="${TONE[lifeTone(r.netMl)].text}">${fmtNum(Math.abs(r.minutes), 0)} minutes of life expectancy per day</b> `
        + `(${signed(r.netMl)} microlives). Over one year of living like this, that adds up to roughly <b>${fmtNum(Math.abs(r.yearDays), 1)} days</b> ${r.netMl > 0 ? 'gained' : 'lost'}. `;
      const best = r.habits.filter(c => c.ml > 0).sort((a, b) => b.ml - a.ml)[0];
      const worst = r.habits.filter(c => c.ml < 0).sort((a, b) => a.ml - b.ml)[0];
      if (best) p2 += `Your biggest boost is ${best.name.toLowerCase()} (${signed(best.ml, 0)}). `;
      if (worst) p2 += `Your biggest drag is ${worst.name.toLowerCase()} (${signed(worst.ml, 1)}). `;
      if (r.capped) p2 += 'The total has been softened because effects this large are not reliably additive. ';
      p2 += 'This is a long-run average, not time you literally gain or lose today.';
    }
    parts.push(p2);

    $('explain').innerHTML = parts.map(p => `<p>${p}</p>`).join('');
  }

  function renderCompare(a) {
    const b = compute(state.compare, state.age, state.sex);
    const rows = [
      { label: 'Total micromorts', fa: fmtMm(a.totalMm), fb: fmtMm(b.totalMm), d: b.totalMm - a.totalMm, fd: v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtMm(Math.abs(v)), lowerIsBetter: true },
      { label: 'Odds of death today', fa: fmtOdds(a.odds), fb: fmtOdds(b.odds), d: b.totalMm - a.totalMm, fd: v => Math.abs(v) < 1e-9 ? 'same' : v < 0 ? 'safer' : 'riskier', lowerIsBetter: true },
      { label: 'Survival today', fa: fmtSurvival(a.survivalPct), fb: fmtSurvival(b.survivalPct), d: b.survivalPct - a.survivalPct, fd: v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(8) + ' pp' },
      { label: 'Net microlives / day', fa: signed(a.netMl), fb: signed(b.netMl), d: b.netMl - a.netMl, fd: v => signed(v) },
      { label: 'Life expectancy shift', fa: signed(a.minutes, 0) + ' min', fb: signed(b.minutes, 0) + ' min', d: b.minutes - a.minutes, fd: v => signed(v, 0) + ' min' },
      { label: '1-year projection', fa: signed(a.yearDays) + ' d', fb: signed(b.yearDays) + ' d', d: b.yearDays - a.yearDays, fd: v => signed(v) + ' d' }
    ];
    $('compareBody').innerHTML = rows.map(row => {
      const eps = 1e-9;
      const better = row.lowerIsBetter ? row.d < -eps : row.d > eps;
      const worse = row.lowerIsBetter ? row.d > eps : row.d < -eps;
      const cls = better ? 'text-emerald-300' : worse ? 'text-rose-300' : 'text-slate-400';
      return `<tr>
        <th scope="row" class="py-2 pr-2 text-left font-normal text-slate-400">${row.label}</th>
        <td class="py-2 px-2 text-right text-slate-200 whitespace-nowrap">${row.fa}</td>
        <td class="py-2 px-2 text-right text-slate-200 whitespace-nowrap">${row.fb}</td>
        <td class="py-2 pl-2 text-right whitespace-nowrap ${cls}">${row.fd(row.d)}</td>
      </tr>`;
    }).join('');

    const dMm = b.totalMm - a.totalMm;
    const dMin = b.minutes - a.minutes;
    const s = [];
    if (Math.abs(dMm) < 1e-6 && Math.abs(dMin) < 1e-6) {
      s.push(state.compareLinked
        ? 'The changed day is following your current day. Pick a change above or edit the changed day to compare.'
        : 'The changed day is identical to your current day. Use the buttons above or edit the changed day to explore alternatives.');
    } else {
      if (Math.abs(dMm) >= 1e-6) {
        const pct = a.totalMm > 0 ? Math.abs(dMm) / a.totalMm * 100 : 0;
        s.push(`The changed day carries <b class="${dMm < 0 ? 'text-emerald-300' : 'text-rose-300'}">${fmtMm(Math.abs(dMm))} ${dMm < 0 ? 'fewer' : 'more'} micromorts</b> (${pct < 1 ? pct.toFixed(2) : Math.round(pct)}% ${dMm < 0 ? 'lower' : 'higher'} acute risk).`);
      } else {
        s.push('Acute risk is unchanged.');
      }
      if (Math.abs(dMin) >= 1e-6) {
        s.push(`Kept up long term, its habits would ${dMin > 0 ? 'add' : 'cost'} about <b class="${dMin > 0 ? 'text-emerald-300' : 'text-rose-300'}">${fmtNum(Math.abs(dMin), 0)} more minutes of life expectancy per day</b>, `
          + `or ${fmtNum(Math.abs(b.yearDays - a.yearDays), 1)} days per year.`);
      } else {
        s.push('Habit effects are unchanged.');
      }
    }
    $('compareSummary').innerHTML = s.join(' ');
  }

  function update(opts = {}) {
    if (state.compareLinked) state.compare = cloneDay(state.day);
    const r = compute(state.day, state.age, state.sex);
    renderInputs(opts.skipInput);
    renderResults(r);
    renderCustomPresets();
    renderExplain(r);
    renderCompare(r);
    saveState();
  }

  /* ------------------------------------------------------------------ *
   * 7. INIT
   * ------------------------------------------------------------------ */

  buildProfile();
  buildAcute();
  buildHabits();
  buildPresets();
  buildCompare();
  update();

  // Exposed for console inspection and testing.
  window.ChronoRisk = { compute, annualQ, softCap, LIFE_TABLE, GOMPERTZ, ACUTE, HABITS };
})();
