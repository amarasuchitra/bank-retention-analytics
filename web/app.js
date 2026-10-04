/* Retention Intelligence dashboard. All figures are computed in the browser from the customers in view. */
(function () {
  "use strict";
  const D = window.BANK, R = D.rows;
  const I = { id: 0, name: 1, geo: 2, female: 3, age: 4, tenure: 5, bal: 6, prod: 7, card: 8, active: 9, sal: 10, exit: 11, credit: 12, rsi: 13, risk: 14 };
  const GEO = ["France", "Germany", "Spain"];
  const C = {};
  function palette() { const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim(); Object.assign(C, { teal: g("--teal"), risk: g("--risk"), mute: g("--mute"), blue: g("--blue"), amber: g("--amber"), grid: g("--grid"), ink: g("--ink"), ink2: g("--ink-2"), line2: g("--line-2") }); }
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const main = $("#main");
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n0 = (v) => Math.round(v).toLocaleString("en-US");
  const pc = (v, d = 1) => (isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");
  const eur = (v) => (v >= 1e6 ? "€" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "€" + Math.round(v / 1e3) + "k" : "€" + Math.round(v));
  const churn = (a) => (a.length ? a.reduce((s, r) => s + r[I.exit], 0) / a.length : NaN);
  const sum = (a, i) => a.reduce((s, r) => s + r[i], 0);
  const mean = (a, i) => (a.length ? sum(a, i) / a.length : NaN);
  const by = (a, f) => { const m = new Map(); a.forEach((r) => { const k = f(r); (m.get(k) || m.set(k, []).get(k)).push(r); }); return m; };

  const st = { tab: "overview", active: "all", geo: new Set([0, 1, 2]), pMin: 1, pMax: 4, bal: 0, sal: 0, age: 18, card: "all", prem: 100000, sort: "risk", calc: { prod: 1, active: 0, tenure: 3, card: 1 } };
  let charts = [];

  function view() {
    return R.filter((r) => (st.active === "all" || r[I.active] === +st.active) && st.geo.has(r[I.geo]) && r[I.prod] >= st.pMin && r[I.prod] <= st.pMax &&
      r[I.bal] >= st.bal && r[I.sal] >= st.sal && r[I.age] >= st.age && (st.card === "all" || r[I.card] === +st.card));
  }

  // ---------------------------------------------------------------- charts
  const labelPlugin = {
    id: "valueLabels",
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.show) return;
      const ctx = chart.ctx; ctx.save(); ctx.font = "600 11.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = C.ink;
      chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((el, i) => {
        const v = ds.data[i]; if (v == null || !isFinite(v)) return;
        const t = opts.fmt ? opts.fmt(v, i, di) : v;
        if (chart.options.indexAxis === "y") { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, el.x + 6, el.y); }
        else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(t, el.x, el.y - 4); }
      }));
      ctx.restore();
    },
  };
  function bar(id, labels, datasets, o = {}) {
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif"; Chart.defaults.color = C.ink2;
    const horizontal = !!o.horizontal, pctAxis = o.pct !== false;
    const valAxis = { beginAtZero: true, grid: { color: C.grid }, border: { display: false }, suggestedMax: o.max, ticks: { callback: (v) => (pctAxis ? Math.round(v * 100) + "%" : o.tick ? o.tick(v) : n0(v)) } };
    const catAxis = { grid: { display: false }, border: { color: C.line2 } };
    charts.push(new Chart(el, {
      type: "bar", data: { labels, datasets: datasets.map((d) => ({ borderRadius: 4, maxBarThickness: 54, ...d })) }, plugins: [labelPlugin],
      options: {
        indexAxis: horizontal ? "y" : "x", maintainAspectRatio: false, animation: { duration: 250 }, layout: { padding: horizontal ? { right: 46 } : { top: 18 } },
        plugins: { legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 10, boxHeight: 10 } }, valueLabels: { show: true, fmt: o.fmt || ((v) => (pctAxis ? pc(v) : n0(v))) },
          tooltip: { callbacks: { label: (c) => (c.dataset.label ? c.dataset.label + ": " : "") + (pctAxis ? pc(c.raw) : n0(c.raw)) + (o.counts ? "  (" + n0(o.counts[c.datasetIndex][c.dataIndex]) + " customers)" : "") } } },
        scales: horizontal ? { x: valAxis, y: catAxis } : { y: valAxis, x: catAxis },
      },
    }));
  }
  const BANK_AVG = R.reduce((a, r) => a + r[11], 0) / R.length;   // colour against the whole-bank average so a filter does not flip colours
  const tone = (vals) => vals.map((v) => (v > BANK_AVG ? C.risk : C.teal));

  // ---------------------------------------------------------------- building blocks
  const head = (eyebrow, title, sub) => `<div class="head"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${sub}</p></div>`;
  const kpi = (l, v, s, cls = "") => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const card = (title, sub, body, take = "", warn = false) => `<section class="card"><h3>${title}</h3><div class="sub">${sub}</div>${body}${take ? `<div class="take ${warn ? "warn" : ""}">${take}</div>` : ""}</section>`;
  const canvas = (id, h = 250) => `<div class="chart" style="height:${h}px"><canvas id="${id}"></canvas></div>`;
  const pill = (t, k) => `<span class="pill p-${k}">${t}</span>`;

  const profileOf = (r) => (r[I.active] ? (r[I.prod] >= 2 ? 0 : 1) : r[I.bal] >= 100000 ? 2 : 3);
  const PROFILES = ["Active engaged", "Active, low product", "Inactive, high balance", "Inactive disengaged"];
  const PROFILE_NOTE = ["Active, 2 or more products", "Active, 1 product", "Inactive, balance €100k or more", "Inactive, balance under €100k"];
  const tierOf = (s) => (s < 50 ? 0 : s < 80 ? 1 : 2);
  const TIERS = ["Weak (0-49)", "Moderate (50-79)", "Strong (80-100)"];
  const TIER_PILL = ["risk", "amber", "good"];
  const rsiCalc = (c) => Math.round((c.prod === 2 ? 50 : c.prod === 1 ? 20 : 0) + 30 * c.active + 1.5 * c.tenure + 5 * c.card);
  function action(r) {
    if (r[I.prod] >= 3) return "Review holdings: simplify to the two products they use";
    if (!r[I.active] && r[I.prod] === 1) return (r[I.age] >= 50 ? "Relationship manager call, then " : "Reactivation offer, then ") + "bundle a second product";
    if (!r[I.active]) return r[I.age] >= 50 ? "Relationship manager call to restart activity" : "Reactivation campaign: digital banking incentives";
    if (r[I.prod] === 1) return "Cross-sell a second product";
    return "Maintain: loyalty reward";
  }

  // ---------------------------------------------------------------- tabs
  function overview(v) {
    const act = v.filter((r) => r[I.active]), ina = v.filter((r) => !r[I.active]);
    const ca = churn(act), ci = churn(ina), all = churn(v);
    const one = v.filter((r) => r[I.prod] === 1), two = v.filter((r) => r[I.prod] === 2);
    const hb = v.filter((r) => r[I.bal] >= 100000), hbi = hb.filter((r) => !r[I.active]);
    const cd = v.filter((r) => r[I.card]), nc = v.filter((r) => !r[I.card]);
    const prof = [0, 1, 2, 3].map((p) => v.filter((r) => profileOf(r) === p));
    const ages = ["18-30", "31-40", "41-50", "51-60", "61+"], ageOf = (r) => (r[I.age] <= 30 ? 0 : r[I.age] <= 40 ? 1 : r[I.age] <= 50 ? 2 : r[I.age] <= 60 ? 3 : 4);
    const ag = ages.map((_, k) => [act.filter((r) => ageOf(r) === k), ina.filter((r) => ageOf(r) === k)]);
    main.innerHTML = head("Engagement vs churn", "Engaged customers stay. Balance alone does not keep them.",
      "Churn is the share of customers who closed their account. Each tile below is one of the five KPIs in the project brief.") + `
      <div class="grid k4">
        ${kpi("Churn rate", pc(all), `${n0(sum(v, I.exit))} of ${n0(v.length)} customers left`, all > 0.2037 ? "risk" : "")}
        ${kpi("Engagement retention ratio", isFinite(ci / ca) ? (ci / ca).toFixed(2) + "x" : "n/a", `Inactive churn ${pc(ci)} vs active ${pc(ca)}`, "risk")}
        ${kpi("Product depth index", isFinite((1 - churn(two)) / (1 - churn(one))) ? ((1 - churn(two)) / (1 - churn(one))).toFixed(2) : "n/a", `Retention with 2 products ÷ with 1`, "good")}
        ${kpi("High-balance disengagement", pc(hbi.length / hb.length), `${n0(hbi.length)} of ${n0(hb.length)} customers over €100k are inactive`, "risk")}
      </div>
      <div class="strip">
        <div><b>${isFinite(churn(nc) - churn(cd)) ? ((churn(nc) - churn(cd)) * 100 >= 0 ? "+" : "") + ((churn(nc) - churn(cd)) * 100).toFixed(1) + " pts" : "n/a"}</b><span>Credit card stickiness</span></div>
        <div><b>${isFinite(mean(v, I.rsi)) ? mean(v, I.rsi).toFixed(0) + " / 100" : "n/a"}</b><span>Relationship strength, average</span></div>
        <div><b>${pc(act.length / v.length)}</b><span>Active members (${n0(act.length)})</span></div>
        <div><b>${eur(sum(v, I.bal))}</b><span>Balance held; ${eur(sum(v.filter((r) => r[I.exit]), I.bal))} left with churners</span></div>
      </div>
      <div class="grid k21">
        ${card("Churn by engagement profile", "The four profiles from the brief. Bar = share of the profile that left.", canvas("cProf", 250),
          prof[2].length && prof[0].length ? `<b>Inactive, high balance</b> is the most exposed profile at ${pc(churn(prof[2]))}, ${(churn(prof[2]) / churn(prof[0])).toFixed(1)} times the rate of active engaged customers (${pc(churn(prof[0]))}).` : "", true)}
        ${card("Active vs inactive", "Same bank, same products, different behaviour", canvas("cAct", 250), isFinite(ci / ca) ? `Inactive members leave <b>${(ci / ca).toFixed(2)} times</b> as often.` : "")}
      </div>
      <div class="grid">
        ${card("Activity matters most for older customers", "Churn by age band, split by activity", canvas("cAge", 260),
          ag[3][0].length && ag[3][1].length ? `Aged 51-60: <b>${pc(churn(ag[3][1]))}</b> of inactive customers left against ${pc(churn(ag[3][0]))} of active ones. Staying active is worth the most exactly where churn is highest.` : "")}
      </div>
      <div class="card"><h3>Profile detail</h3><div class="sub">How each profile is defined, and what it holds</div><div class="tw"><table><thead><tr><th>Profile</th><th>Definition</th><th class="r">Customers</th><th class="r">Churn</th><th class="r">Avg balance</th><th class="r">Avg strength</th></tr></thead><tbody>
        ${prof.map((p, k) => `<tr><td><b>${PROFILES[k]}</b></td><td>${PROFILE_NOTE[k]}</td><td class="r">${n0(p.length)}</td><td class="r">${pc(churn(p))}</td><td class="r">${p.length ? eur(mean(p, I.bal)) : "n/a"}</td><td class="r">${p.length ? mean(p, I.rsi).toFixed(0) : "n/a"}</td></tr>`).join("")}
      </tbody></table></div></div>`;
    bar("cProf", PROFILES, [{ data: prof.map(churn), backgroundColor: tone(prof.map(churn), all) }], { horizontal: true, counts: [prof.map((p) => p.length)] });
    bar("cAct", ["Active", "Inactive"], [{ data: [ca, ci], backgroundColor: [C.teal, C.risk] }], { counts: [[act.length, ina.length]] });
    bar("cAge", ages, [{ label: "Active", data: ag.map((a) => churn(a[0])), backgroundColor: C.teal }, { label: "Inactive", data: ag.map((a) => churn(a[1])), backgroundColor: C.risk }], { counts: [ag.map((a) => a[0].length), ag.map((a) => a[1].length)], fmt: (x) => Math.round(x * 100) + "%" });
  }

  function products(v) {
    const all = churn(v), P = [1, 2, 3, 4].map((k) => v.filter((r) => r[I.prod] === k));
    const single = P[0], multi = v.filter((r) => r[I.prod] >= 2), over = v.filter((r) => r[I.prod] >= 3);
    const ap = [1, 0].map((a) => [1, 2, 3, 4].map((k) => v.filter((r) => r[I.active] === a && r[I.prod] === k)));
    const cd = v.filter((r) => r[I.card]), nc = v.filter((r) => !r[I.card]);
    const gp = GEO.map((_, g) => [1, 2].map((k) => v.filter((r) => r[I.geo] === g && r[I.prod] === k)));
    main.innerHTML = head("Product utilisation", "Two products is the sweet spot. More is not better.",
      "Product depth protects customers up to two products. Customers holding three or four leave at very high rates, which points to over-selling, not loyalty.") + `
      <div class="grid k4">
        ${kpi("1 product", pc(churn(P[0])), `${n0(P[0].length)} customers`, churn(P[0]) > all ? "risk" : "")}
        ${kpi("2 products", pc(churn(P[1])), `${n0(P[1].length)} customers`, "good")}
        ${kpi("3 or 4 products", pc(churn(over)), `${n0(over.length)} customers, a small group`, "risk")}
        ${kpi("Single vs multi", `${pc(churn(single), 0)} / ${pc(churn(multi), 0)}`, `Churn with 1 product vs 2 or more`)}
      </div>
      <div class="grid k2">
        ${card("Churn by number of products", "Share of each group that left", canvas("cProd"), over.length ? `Only <b>${n0(over.length)}</b> customers hold 3 or more products, so treat this as a warning sign to investigate, not a precise rate.` : "", true)}
        ${card("Product depth with and without activity", "Activity and product fit add up", canvas("cAP"), ap[0][1].length ? `Active with 2 products is the stickiest group: <b>${pc(churn(ap[0][1]))}</b> churn across ${n0(ap[0][1].length)} customers.` : "")}
      </div>
      <div class="grid k2">
        ${card("Does a credit card keep customers?", "Churn with and without a card", canvas("cCard", 200), isFinite(churn(nc) - churn(cd)) ? `The gap is <b>${Math.abs((churn(nc) - churn(cd)) * 100).toFixed(1)} points</b>. Across all customers it is not statistically significant (p = ${D.tests.HasCrCard.p.toFixed(2)}): a card on its own is not a retention tool.` : "")}
        ${card("The second product works in every country", "Churn with 1 vs 2 products", canvas("cGeo", 200), gp[1][0].length ? `Germany has the highest single-product churn at <b>${pc(churn(gp[1][0]))}</b>; a second product brings it to ${pc(churn(gp[1][1]))}.` : "")}
      </div>
      <div class="card"><h3>Product count detail</h3><div class="sub">Customers in view</div><div class="tw"><table><thead><tr><th>Products</th><th class="r">Customers</th><th class="r">Left</th><th class="r">Churn</th><th class="r">Active share</th><th class="r">Avg balance</th><th>Reading</th></tr></thead><tbody>
        ${P.map((p, k) => `<tr><td><b>${k + 1}</b></td><td class="r">${n0(p.length)}</td><td class="r">${n0(sum(p, I.exit))}</td><td class="r">${pc(churn(p))}</td><td class="r">${p.length ? pc(sum(p, I.active) / p.length, 0) : "n/a"}</td><td class="r">${p.length ? eur(mean(p, I.bal)) : "n/a"}</td><td>${["Shallow relationship: cross-sell target", "Best retention: protect", "Over-sold: review", "Over-sold: review"][k]}</td></tr>`).join("")}
      </tbody></table></div></div>`;
    bar("cProd", ["1", "2", "3", "4"], [{ data: P.map(churn), backgroundColor: tone(P.map(churn), all) }], { counts: [P.map((p) => p.length)] });
    bar("cAP", ["1", "2", "3", "4"], [{ label: "Active", data: ap[0].map(churn), backgroundColor: C.teal }, { label: "Inactive", data: ap[1].map(churn), backgroundColor: C.risk }], { counts: ap.map((a) => a.map((x) => x.length)), fmt: (x) => Math.round(x * 100) + "%" });
    bar("cCard", ["Has card", "No card"], [{ data: [churn(cd), churn(nc)], backgroundColor: [C.blue, C.mute] }], { horizontal: true, counts: [[cd.length, nc.length]], max: 0.3 });
    bar("cGeo", GEO, [{ label: "1 product", data: gp.map((g) => churn(g[0])), backgroundColor: C.risk }, { label: "2 products", data: gp.map((g) => churn(g[1])), backgroundColor: C.teal }], { counts: [gp.map((g) => g[0].length), gp.map((g) => g[1].length)], fmt: (x) => Math.round(x * 100) + "%" });
  }

  function premium(v) {
    const T = st.prem, hb = v.filter((r) => r[I.bal] >= T), lo = v.filter((r) => r[I.bal] < T);
    const q = [[hb.filter((r) => r[I.active]), hb.filter((r) => !r[I.active])], [lo.filter((r) => r[I.active]), lo.filter((r) => !r[I.active])]];
    const hbi = q[0][1], still = hbi.filter((r) => !r[I.exit]);
    const mm = [["High salary, empty account", v.filter((r) => r[I.bal] === 0 && r[I.sal] >= 100000)], ["Balanced", v.filter((r) => !(r[I.bal] === 0 && r[I.sal] >= 100000) && r[I.bal] < 2 * r[I.sal])], ["Balance over twice salary", v.filter((r) => r[I.bal] >= 2 * r[I.sal])]];
    const sorted = still.slice().sort(st.sort === "balance" ? (a, b) => b[I.bal] - a[I.bal] : (a, b) => b[I.risk] - a[I.risk] || b[I.bal] - a[I.bal]);
    const cell = (a, label) => { const c = churn(a); const bg = !a.length ? "m0" : c > 0.28 ? "m4" : c > 0.2 ? "m3" : c > 0.14 ? "m2" : "m1"; return `<div class="c ${bg}"><b>${pc(c)}</b><span>${label}<br>${n0(a.length)} customers</span></div>`; };
    main.innerHTML = head("High-value disengaged customer detector", "A large balance is not loyalty. These are the customers to call first.",
      "Premium customers who have gone quiet leave without warning and take the most money with them. Set the premium threshold, then work the list.") + `
      <div class="card" style="margin-bottom:16px"><div class="inline">
        <div class="f-group" style="flex:1; min-width:240px"><label for="prem">Premium balance threshold <output class="mono">${eur(T)}</output></label><input type="range" id="prem" min="50000" max="180000" step="10000" value="${T}"></div>
        <div class="f-group"><label for="sortBy">Sort list by</label><select id="sortBy" class="inp"><option value="risk"${st.sort === "risk" ? " selected" : ""}>Predicted churn risk</option><option value="balance"${st.sort === "balance" ? " selected" : ""}>Balance</option></select></div>
        <button class="btn" id="dl">Download list (CSV)</button>
      </div></div>
      <div class="grid k4">
        ${kpi("Premium but inactive", n0(hbi.length), `${pc(hbi.length / hb.length, 0)} of premium customers`, "risk")}
        ${kpi("Their churn rate", pc(churn(hbi)), `Active premium customers: ${pc(churn(q[0][0]))}`, "risk")}
        ${kpi("Still with the bank", n0(still.length), `${eur(sum(still, I.bal))} in balances to protect`)}
        ${kpi("Already lost", eur(sum(hbi.filter((r) => r[I.exit]), I.bal)), `Held by the ${n0(sum(hbi, I.exit))} who left`)}
      </div>
      <div class="grid k2">
        ${card("Balance against activity", "Churn rate in each of the four groups", `<div class="matrix"><div></div><div class="h">Active</div><div class="h">Inactive</div><div class="h">${eur(T)}<br>or more</div>${cell(q[0][0], "Premium, active")}${cell(q[0][1], "Premium, inactive")}<div class="h">Under<br>${eur(T)}</div>${cell(q[1][0], "Standard, active")}${cell(q[1][1], "Standard, inactive")}</div>`,
          hb.length && lo.length ? `Premium customers churn at <b>${pc(churn(hb))}</b>, against ${pc(churn(lo))} for everyone else. Money in the account does not hold them.${(() => { const g = GEO.map((n, k) => [n, hbi.filter((r) => r[I.geo] === k)]).filter((x) => x[1].length >= 30).sort((a, b) => churn(b[1]) - churn(a[1])); return g.length > 1 ? ` The premium, inactive group is most exposed in <b>${g[0][0]}</b> (${pc(churn(g[0][1]))} of ${n0(g[0][1].length)}).` : ""; })()}` : "", true)}
        ${card("Salary and balance mismatch", "Where the money sits compared with income", canvas("cMis", 190), mm[2][1].length ? `Customers holding <b>more than twice their salary</b> at the bank churn at ${pc(churn(mm[2][1]))}. High earners with an empty account churn least (${pc(churn(mm[0][1]))}): their main bank is elsewhere, so there is little to lose and much to win.` : "")}
      </div>
      <div class="card"><div class="row"><div><h3>Call list: premium, inactive, still a customer</h3><div class="sub" style="margin:2px 0 0">${n0(still.length)} customers. Risk is the churn model's estimate for each customer (tested on customers it had not seen).</div></div></div>
        ${still.length ? `<div class="tw"><table><thead><tr><th>Customer</th><th>Country</th><th class="r">Age</th><th class="r">Balance</th><th class="r">Salary</th><th class="r">Products</th><th class="r">Tenure</th><th class="r">Strength</th><th>Risk</th><th>Suggested action</th></tr></thead><tbody>
        ${sorted.slice(0, 200).map((r) => `<tr><td><b>${esc(r[I.name])}</b> <span class="mono" style="color:var(--ink-3);font-size:12px">${r[I.id]}</span></td><td>${GEO[r[I.geo]]}</td><td class="r">${r[I.age]}</td><td class="r">${eur(r[I.bal])}</td><td class="r">${eur(r[I.sal])}</td><td class="r">${r[I.prod]}</td><td class="r">${r[I.tenure]} y</td><td class="r">${r[I.rsi]}</td>
          <td style="min-width:110px"><div style="display:flex;align-items:center;gap:8px"><span class="mono" style="width:34px">${r[I.risk]}%</span><div class="bar" style="flex:1"><i style="width:${r[I.risk]}%"></i></div></div></td><td>${action(r)}</td></tr>`).join("")}
        </tbody></table></div>${still.length > 200 ? `<p class="foot">Showing the top 200 of ${n0(still.length)}. The download contains all of them.</p>` : ""}` : `<div class="empty">No customers match. Lower the threshold or widen the filters.</div>`}
      </div>`;
    bar("cMis", mm.map((m) => m[0]), [{ data: mm.map((m) => churn(m[1])), backgroundColor: tone(mm.map((m) => churn(m[1])), churn(v)) }], { horizontal: true, counts: [mm.map((m) => m[1].length)], max: 0.32 });
    $("#prem").oninput = (e) => { st.prem = +e.target.value; render(); $("#prem").focus(); };
    $("#sortBy").onchange = (e) => { st.sort = e.target.value; render(); };
    $("#dl").onclick = () => {
      const rows = [["CustomerId", "Surname", "Country", "Age", "Balance", "EstimatedSalary", "Products", "TenureYears", "RelationshipStrength", "ChurnRiskPct", "SuggestedAction"]]
        .concat(sorted.map((r) => [r[I.id], r[I.name], GEO[r[I.geo]], r[I.age], r[I.bal], r[I.sal], r[I.prod], r[I.tenure], r[I.rsi], r[I.risk], action(r)]));
      const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c)).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "premium_inactive_call_list.csv"; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  function strength(v) {
    const all = churn(v), T = [0, 1, 2].map((t) => v.filter((r) => tierOf(r[I.rsi]) === t));
    const bins = Array.from({ length: 10 }, (_, k) => v.filter((r) => Math.min(9, Math.floor(r[I.rsi] / 10)) === k));
    const sticky = v.filter((r) => r[I.active] && r[I.prod] === 2), above = v.filter((r) => r[I.rsi] >= 50), below = v.filter((r) => r[I.rsi] < 50);
    const m = D.model, imp = m.importance.slice(0, 7);
    const BM = [["Blend: XGBoost + LightGBM + CatBoost", "Blend: XGBoost + LightGBM + CatBoost", "Blend (XGB + LGBM + CatBoost)"], ["CatBoost", "CatBoost | original fields"], ["XGBoost", "XGBoost | original fields"], ["LightGBM", "LightGBM | original fields"], ["Gradient boosting (scikit-learn)", "Gradient boosting (sklearn, default) | original fields"], ["Random forest", "Random forest | original fields"], ["Logistic regression", "Logistic regression | original fields"]];
    const NAMES = { Age: "Age", NumOfProducts: "Number of products", Balance: "Balance", IsActiveMember: "Active member", Geography: "Country", Gender: "Gender", EstimatedSalary: "Salary", CreditScore: "Credit score", Tenure: "Tenure", HasCrCard: "Credit card" };
    const c = st.calc, score = rsiCalc(c), tier = tierOf(score), like = v.filter((r) => tierOf(r[I.rsi]) === tier);
    main.innerHTML = head("Retention strength", "One score for how strong each relationship is.",
      "The Relationship Strength Index adds up four behaviours into a 0 to 100 score. It uses no demographics, so it measures what the bank can change.") + `
      <div class="grid k4">
        ${kpi("Average strength", isFinite(mean(v, I.rsi)) ? mean(v, I.rsi).toFixed(0) : "n/a", `Stayed ${mean(v.filter((r) => !r[I.exit]), I.rsi).toFixed(0)} · left ${mean(v.filter((r) => r[I.exit]), I.rsi).toFixed(0)}`)}
        ${kpi("Weak tier churn", pc(churn(T[0])), `${n0(T[0].length)} customers scoring under 50`, "risk")}
        ${kpi("Strong tier churn", pc(churn(T[2])), `${n0(T[2].length)} sticky customers: active with 2 products`, "good")}
        ${kpi("Moderate tier churn", pc(churn(T[1])), `${n0(T[1].length)} customers scoring 50 to 79`)}
      </div>
      <div class="grid k21">
        ${card("Churn falls as the relationship strengthens", "Churn rate by index band", canvas("cRsi", 260), above.length && below.length ? `<b>Threshold: 50.</b> Below 50, ${pc(churn(below))} leave. At 50 or above, ${pc(churn(above))} leave. An inactive single-product customer crosses 50 with one step: become active, or take a second product.` : "")}
        ${card("How the index is built", "Points per behaviour, 100 in total", `<div class="points" style="grid-template-columns:1fr 1fr"><div><b>50</b><span>Product fit: 2 products = 50, 1 = 20, 3 or more = 0</span></div><div><b>30</b><span>Active member</span></div><div><b>15</b><span>Tenure: 1.5 points per year</span></div><div><b>5</b><span>Holds a credit card</span></div></div>`, "Weights follow the evidence on the other tabs: product fit and activity carry the score; card ownership barely moves churn, so it carries little.")}
      </div>
      <div class="grid k2">
        <section class="card"><h3>Churn stability across tiers</h3><div class="sub">Customers in view</div><div class="tw"><table><thead><tr><th>Tier</th><th class="r">Customers</th><th class="r">Churn</th><th class="r">vs average</th><th style="min-width:200px">Play</th></tr></thead><tbody>
          ${T.map((t, k) => `<tr><td>${pill(TIERS[k], TIER_PILL[k])}</td><td class="r">${n0(t.length)}</td><td class="r">${pc(churn(t))}</td><td class="r">${isFinite(churn(t) / all) ? (churn(t) / all).toFixed(2) + "x" : "n/a"}</td><td>${["Save: personal outreach", "Grow: add the missing behaviour", "Protect: do not over-sell"][k]}</td></tr>`).join("")}
        </tbody></table></div></section>
        <section class="card"><h3>Score a customer</h3><div class="sub">Change the behaviours and see the tier move</div>
          <div class="inline">
            <div class="f-group"><label for="cProdN">Products</label><select id="cProdN" class="inp">${[1, 2, 3, 4].map((k) => `<option${c.prod === k ? " selected" : ""}>${k}</option>`).join("")}</select></div>
            <div class="f-group"><label for="cAct2">Active</label><select id="cAct2" class="inp"><option value="1"${c.active ? " selected" : ""}>Yes</option><option value="0"${!c.active ? " selected" : ""}>No</option></select></div>
            <div class="f-group"><label for="cTen">Tenure (years)</label><select id="cTen" class="inp">${Array.from({ length: 11 }, (_, k) => `<option${c.tenure === k ? " selected" : ""}>${k}</option>`).join("")}</select></div>
            <div class="f-group"><label for="cCd">Credit card</label><select id="cCd" class="inp"><option value="1"${c.card ? " selected" : ""}>Yes</option><option value="0"${!c.card ? " selected" : ""}>No</option></select></div>
          </div>
          <div class="score"><div class="big" style="color:var(${["--risk", "--amber", "--teal-2"][tier]})">${score}</div><div>${pill(TIERS[tier], TIER_PILL[tier])}<div style="margin-top:6px;font-size:13.5px;color:var(--ink-2)">Customers in this tier churn at <b style="color:var(--ink)">${pc(churn(like))}</b> (${n0(like.length)} in view).</div></div></div>
        </section>
      </div>
      <div class="grid k2">
        ${card("What drives the churn model", "Loss of accuracy when each field is shuffled (blended model)", canvas("cImp", 240), `Product count is the strongest driver, ahead of age. Behaviour fields alone reach an AUC of ${m["Behaviour only"].auc.toFixed(3)}, about the same as demographic fields alone (${m["Demographics only"].auc.toFixed(3)}). Age cannot be changed; product fit and activity can.`)}
        <section class="card"><h3>Churn model check</h3><div class="sub">Each model scored only on customers it had not seen (5-fold cross-validation, repeated 3 times)</div><div class="tw"><table><thead><tr><th>Model</th><th class="r">AUC</th><th class="r">Accuracy</th><th class="r">F1</th></tr></thead><tbody>
          ${BM.map(([label, key, rel]) => { const r = m.benchmark.models[key]; return `<tr${rel === "Blend (XGB + LGBM + CatBoost)" ? ' style="background:var(--teal-tint)"' : ""}><td>${rel === "Blend (XGB + LGBM + CatBoost)" ? "<b>" + label + "</b> " + pill("in use", "good") : label}</td><td class="r">${r.auc.toFixed(3)}</td><td class="r">${pc(r.accuracy)}</td><td class="r">${r.f1_tuned.toFixed(3)}</td></tr>`; }).join("")}
        </tbody></table></div><div class="take">The blend is the most accurate option and the one that ranks the call list. AUC runs from 0.5 (guessing) to 1.0 (perfect). The riskiest 10% of customers by the model contain <b>${pc(m.top_decile_capture, 0)}</b> of all churners. Its predicted risks are off by only ${(m.reliability["Blend (XGB + LGBM + CatBoost)"].ece * 100).toFixed(1)} points on average.</div></section>
      </div>`;
    bar("cRsi", bins.map((_, k) => (k === 9 ? "90-100" : k * 10 + "-" + (k * 10 + 9))), [{ data: bins.map((b) => (b.length >= 20 ? churn(b) : null)), backgroundColor: bins.map((_, k) => (k <= 4 ? C.risk : C.teal)) }], { counts: [bins.map((b) => b.length)], fmt: (x) => Math.round(x * 100) + "%" });
    bar("cImp", imp.map((i) => NAMES[i.feature]), [{ data: imp.map((i) => i.auc_drop), backgroundColor: imp.map((i) => (["NumOfProducts", "IsActiveMember", "Balance", "Tenure", "HasCrCard"].includes(i.feature) ? C.teal : C.mute)) }], { horizontal: true, pct: false, fmt: (x) => x.toFixed(3), tick: (x) => x.toFixed(2) });
    const upd = () => { st.calc = { prod: +$("#cProdN").value, active: +$("#cAct2").value, tenure: +$("#cTen").value, card: +$("#cCd").value }; render(); };
    ["cProdN", "cAct2", "cTen", "cCd"].forEach((id) => ($("#" + id).onchange = upd));
  }

  function actions(v) {
    const hb = v.filter((r) => r[I.bal] >= 100000), hbi = hb.filter((r) => !r[I.active]), hba = hb.filter((r) => r[I.active]);
    const kept = Math.max(0, Math.round((churn(hbi) - churn(hba)) * hbi.length)), keptBal = kept * mean(hbi, I.bal);
    const one = v.filter((r) => r[I.prod] === 1), two = v.filter((r) => r[I.prod] === 2), over = v.filter((r) => r[I.prod] >= 3);
    const act1 = one.filter((r) => r[I.active] && !r[I.exit]);
    const old = v.filter((r) => r[I.age] > 50 && r[I.age] <= 60), oldI = old.filter((r) => !r[I.active]), oldA = old.filter((r) => r[I.active]);
    const cd = v.filter((r) => r[I.card]), nc = v.filter((r) => !r[I.card]);
    const rec = (n, t, p, big, small) => `<div class="rec"><div class="n">${n}</div><div><h3>${t}</h3><p>${p}</p></div><div class="ev"><b>${big}</b>${small}</div></div>`;
    main.innerHTML = head("Recommendations", "Five moves, ranked by the evidence behind them.",
      "Each recommendation is tied to a number from the customers in view. Estimates show what the data suggests, not a guaranteed result: this is one snapshot, so it shows association, not proof of cause.") + `
      <div class="card">
        ${rec("01", "Call inactive premium customers first", `${n0(hbi.filter((r) => !r[I.exit]).length)} customers hold €100k or more, are inactive and are still with the bank. If reactivation brought them to the churn rate of active premium customers (${pc(churn(hba))} instead of ${pc(churn(hbi))}), about ${n0(kept)} more would stay.`, isFinite(keptBal) ? eur(keptBal) : "n/a", "balances retained (estimate)")}
        ${rec("02", "Make the second product the standard bundle", `Churn falls from ${pc(churn(one))} with one product to ${pc(churn(two))} with two. ${n0(act1.length)} active single-product customers are the easiest cross-sell: they already use the bank.`, pc(churn(one) - churn(two), 0).replace("%", " pts"), "lower churn with 2 products")}
        ${rec("03", "Stop selling past two products", `${n0(over.length)} customers hold three or four products and ${pc(churn(over))} of them left. Review how these were sold and simplify holdings before adding more.`, pc(churn(over), 0), "churn at 3+ products")}
        ${rec("04", "Give customers aged 51 to 60 a relationship manager", `In this age band ${pc(churn(oldI))} of inactive customers left against ${pc(churn(oldA))} of active ones, the widest activity gap in the bank.`, isFinite(churn(oldI) / churn(oldA)) ? (churn(oldI) / churn(oldA)).toFixed(1) + "x" : "n/a", "inactive vs active churn")}
        ${rec("05", "Do not count on credit cards for loyalty", `Card holders churn at ${pc(churn(cd))} and non-holders at ${pc(churn(nc))}. Spend the retention budget on activity and the second product instead.`, isFinite(churn(nc) - churn(cd)) ? Math.abs((churn(nc) - churn(cd)) * 100).toFixed(1) + " pts" : "n/a", "difference in churn")}
      </div>
      <p class="foot">Data: European Bank customer file, 10,000 customers in France, Germany and Spain, single snapshot for 2025. No missing values and no duplicate customers. Premium means a balance of €100,000 or more unless the threshold is changed on the Premium tab.</p>`;
  }

  // ---------------------------------------------------------------- render + filters
  const TABS = { overview, products, premium, strength, actions };
  function render() {
    charts.forEach((c) => c.destroy()); charts = [];
    palette();
    const v = view();
    const nf = (st.active !== "all") + (st.geo.size < 3) + (st.pMin > 1 || st.pMax < 4) + (st.bal > 0) + (st.sal > 0) + (st.age > 18) + (st.card !== "all");
    const badge = $("#fActiveN"); badge.textContent = nf; badge.hidden = !nf;
    $("#nView").textContent = n0(v.length);
    if (!v.length) { main.innerHTML = `<div class="card"><div class="empty"><b>No customers match these filters.</b><br>Widen a filter or press Reset.</div></div>`; return; }
    TABS[st.tab](v);
  }
  function syncLabels() {
    $("#oProd").textContent = st.pMin === st.pMax ? String(st.pMin) : st.pMin + " to " + st.pMax;
    $("#oBal").textContent = st.bal ? eur(st.bal) + "+" : "Any"; $("#oSal").textContent = st.sal ? eur(st.sal) + "+" : "Any"; $("#oAge").textContent = st.age + "+";
  }
  function seg(id, key) { $$("#" + id + " button").forEach((b) => (b.onclick = () => { st[key] = b.dataset.v; $$("#" + id + " button").forEach((x) => x.classList.toggle("on", x === b)); render(); })); }
  seg("fActive", "active"); seg("fCard", "card");
  $$("#fGeo button").forEach((b) => (b.onclick = () => { const g = +b.dataset.v; if (st.geo.has(g)) { if (st.geo.size > 1) st.geo.delete(g); } else st.geo.add(g); b.classList.toggle("on", st.geo.has(g)); render(); }));
  $("#pMin").oninput = (e) => { st.pMin = +e.target.value; if (st.pMin > st.pMax) { st.pMax = st.pMin; $("#pMax").value = st.pMax; } syncLabels(); render(); };
  $("#pMax").oninput = (e) => { st.pMax = +e.target.value; if (st.pMax < st.pMin) { st.pMin = st.pMax; $("#pMin").value = st.pMin; } syncLabels(); render(); };
  $("#fBal").oninput = (e) => { st.bal = +e.target.value; syncLabels(); render(); };
  $("#fSal").oninput = (e) => { st.sal = +e.target.value; syncLabels(); render(); };
  $("#fAge").oninput = (e) => { st.age = +e.target.value; syncLabels(); render(); };
  $("#reset").onclick = () => {
    Object.assign(st, { active: "all", geo: new Set([0, 1, 2]), pMin: 1, pMax: 4, bal: 0, sal: 0, age: 18, card: "all" });
    $("#pMin").value = 1; $("#pMax").value = 4; $("#fBal").value = 0; $("#fSal").value = 0; $("#fAge").value = 18;
    $$("#fGeo button").forEach((b) => b.classList.add("on"));
    ["fActive", "fCard"].forEach((id) => $$("#" + id + " button").forEach((b) => b.classList.toggle("on", b.dataset.v === "all")));
    syncLabels(); render();
  };
  $$("#tabs button").forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b)); render(); window.scrollTo(0, 0); }));
  $("#fToggle").onclick = () => { const f = $("#filters"); const open = f.classList.toggle("open"); $("#fToggle").setAttribute("aria-expanded", open); };
  // redraw charts when the viewer's theme changes
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render); } catch (e) { /* older browsers */ }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  syncLabels(); render();
})();
