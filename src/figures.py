"""Figures for the paper. Run after analysis.py:  python src/figures.py"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = json.load(open(os.path.join(ROOT, "outputs", "metrics.json")))
T, K = M["tables"], M["kpis"]
TEAL, RISK, GREY, INK = "#0B7A75", "#C4421A", "#B4BECC", "#0F1C2E"
plt.rcParams.update({"font.family": "serif", "font.size": 8, "axes.spines.top": False, "axes.spines.right": False, "axes.edgecolor": "#888", "axes.linewidth": .6})
base = K["overall_churn"]
col = lambda v: RISK if v > base else TEAL
out = lambda n: os.path.join(ROOT, "paper", n)

def label(ax, bars, vals, horiz=False):
    for b, v in zip(bars, vals):
        if horiz: ax.text(b.get_width() + .008, b.get_y() + b.get_height() / 2, f"{v*100:.1f}%", va="center", fontsize=7)
        else: ax.text(b.get_x() + b.get_width() / 2, b.get_height() + .012, f"{v*100:.0f}%" if v > .995 else f"{v*100:.1f}%", ha="center", fontsize=7)

# Fig 1: profiles and products
fig, ax = plt.subplots(1, 3, figsize=(7.1, 2.3), gridspec_kw={"width_ratios": [1.25, 1, 1.25]})
order = ["Active engaged", "Active, low product", "Inactive disengaged", "Inactive, high balance"]
p = {r["Profile"]: r for r in T["by_profile"]}; v = [p[o]["churn"] for o in order]
b = ax[0].barh([o.replace(", ", ",\n") for o in order][::-1], v[::-1], color=[col(x) for x in v[::-1]], height=.6); label(ax[0], b, v[::-1], True)
ax[0].set_xlim(0, .42); ax[0].set_title("(a) Engagement profile", fontsize=8); ax[0].axvline(base, color=INK, lw=.6, ls="--")
v = [r["churn"] for r in T["by_products"]]
b = ax[1].bar(["1", "2", "3", "4"], v, color=[col(x) for x in v], width=.6); label(ax[1], b, v); ax[1].set_ylim(0, 1.12); ax[1].set_title("(b) Number of products", fontsize=8); ax[1].axhline(base, color=INK, lw=.6, ls="--")
ages = ["18-30", "31-40", "41-50", "51-60", "61+"]; a = {(r["AgeBand"], r["IsActiveMember"]): r["churn"] for r in T["by_age_active"]}
x = range(5); w = .38
ax[2].bar([i - w / 2 for i in x], [a[(g, 1)] for g in ages], w, color=TEAL, label="Active"); ax[2].bar([i + w / 2 for i in x], [a[(g, 0)] for g in ages], w, color=RISK, label="Inactive")
ax[2].set_xticks(list(x)); ax[2].set_xticklabels(ages); ax[2].set_ylim(0, 1); ax[2].legend(frameon=False, fontsize=7); ax[2].set_title("(c) Age band and activity", fontsize=8)
for k in (1, 2): ax[k].yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1, 0))
ax[0].xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1, 0))
fig.tight_layout(); fig.savefig(out("fig_churn.png"), dpi=300); plt.close(fig)

# Fig 2: balance x activity
fig, ax = plt.subplots(figsize=(3.3, 2.0))
g = {(r["HighBalance"], r["IsActiveMember"]): r["churn"] for r in T["by_balance_active"]}
labs = ["Standard,\nactive", "Standard,\ninactive", "Premium,\nactive", "Premium,\ninactive"]; v = [g[(0, 1)], g[(0, 0)], g[(1, 1)], g[(1, 0)]]
b = ax.bar(labs, v, color=[TEAL, RISK, TEAL, RISK], width=.6); label(ax, b, v); ax.set_ylim(0, .4); ax.axhline(base, color=INK, lw=.6, ls="--"); ax.text(-.45, base + .006, "average", fontsize=6.5, ha="left")
ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1, 0)); ax.set_ylabel("Churn rate")
fig.tight_layout(); fig.savefig(out("fig_premium.png"), dpi=300); plt.close(fig)

# Fig 3: RSI bands
fig, ax = plt.subplots(figsize=(3.3, 2.0))
r = T["by_rsi_bin"]; v = [x["churn"] for x in r]; labs = [f'{x["RSIBin"]}' for x in r]
b = ax.bar(labs, v, color=[RISK if x["RSIBin"] < 50 else TEAL for x in r], width=.7)
for bb, x in zip(b, r): ax.text(bb.get_x() + bb.get_width() / 2, bb.get_height() + .015, f'{x["churn"]*100:.0f}', ha="center", fontsize=6.5)
ax.set_ylim(0, 1.05); ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1, 0)); ax.set_xlabel("Relationship Strength Index (lower edge of 10-point band)"); ax.set_ylabel("Churn rate")
ax.axvline(4.5, color=INK, lw=.6, ls="--"); ax.text(4.6, .9, "threshold 50", fontsize=6.5)
fig.tight_layout(); fig.savefig(out("fig_rsi.png"), dpi=300); plt.close(fig)
print("figures written")
