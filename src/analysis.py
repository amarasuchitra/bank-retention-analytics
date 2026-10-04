"""Customer engagement and product utilisation analysis for retention.

Run:  python src/analysis.py
Reads data/European_Bank.csv, writes outputs/metrics.json (every number used in the
paper and dashboard) and web/data.js (one compact row per customer for the dashboard).
"""
import json
import os

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIGH_BALANCE = 100_000          # "premium" threshold used throughout (close to the lower quartile of funded accounts)
PROFILES = ["Active engaged", "Active, low product", "Inactive, high balance", "Inactive disengaged"]


def load():
    d = pd.read_csv(os.path.join(ROOT, "data", "European_Bank.csv"))
    checks = {
        "rows": len(d), "missing_values": int(d.isna().sum().sum()),
        "duplicate_customers": int(d.CustomerId.duplicated().sum()),
        "binary_ok": bool(all(set(d[c].unique()) <= {0, 1} for c in ["HasCrCard", "IsActiveMember", "Exited"])),
        "products_range": [int(d.NumOfProducts.min()), int(d.NumOfProducts.max())],
        "countries": sorted(d.Geography.unique()),
    }
    return d, checks


def profile(d):
    return np.select(
        [(d.IsActiveMember == 1) & (d.NumOfProducts >= 2), (d.IsActiveMember == 1),
         (d.IsActiveMember == 0) & (d.Balance >= HIGH_BALANCE)],
        PROFILES[:3], PROFILES[3])


def rsi(d):
    """Relationship Strength Index, 0-100. Transparent points, not a fitted model.
    Product fit 50 (two products is the sweet spot, one is shallow, three or more is over-sold),
    activity 30, tenure up to 15, credit card 5."""
    product_fit = d.NumOfProducts.map({1: 20, 2: 50}).fillna(0)
    return (product_fit + 30 * d.IsActiveMember + 15 * d.Tenure / 10 + 5 * d.HasCrCard).round(0).astype(int)


def rate(d, by):
    g = d.groupby(by, observed=True).Exited.agg(["mean", "size", "sum"]).reset_index()
    return [{**{k: (r[k] if isinstance(r[k], str) else (int(r[k]) if float(r[k]).is_integer() else float(r[k]))) for k in (by if isinstance(by, list) else [by])},
             "churn": round(float(r["mean"]), 4), "customers": int(r["size"]), "left": int(r["sum"])} for _, r in g.iterrows()]


def wilson(k, n, z=1.96):
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(float(c - h), 4), round(float(c + h), 4)]


def chi2(d, col):
    t = pd.crosstab(d[col], d.Exited)
    c, p, *_ = stats.chi2_contingency(t)
    n = t.values.sum()
    v = np.sqrt(c / (n * (min(t.shape) - 1)))
    return {"chi2": round(float(c), 1), "p": float(p), "cramers_v": round(float(v), 3)}


class Blend:
    """Average of XGBoost, LightGBM and CatBoost probabilities: the most accurate option in src/model_benchmark.py."""
    def __init__(self):
        from catboost import CatBoostClassifier
        from lightgbm import LGBMClassifier
        from xgboost import XGBClassifier
        self.models = [
            XGBClassifier(n_estimators=400, learning_rate=.03, max_depth=4, subsample=.8, colsample_bytree=.8, min_child_weight=3, reg_lambda=2, n_jobs=4, random_state=0, verbosity=0),
            LGBMClassifier(n_estimators=400, learning_rate=.03, num_leaves=15, min_child_samples=30, subsample=.8, subsample_freq=1, colsample_bytree=.8, reg_lambda=2, n_jobs=4, random_state=0, verbose=-1),
            CatBoostClassifier(iterations=600, learning_rate=.04, depth=5, l2_leaf_reg=4, random_seed=0, verbose=0, thread_count=4)]

    def fit(self, X, y):
        for m in self.models:
            m.fit(X, y)
        return self

    def predict_proba(self, X):
        return np.mean([m.predict_proba(X) for m in self.models], axis=0)


def features(d, cols=None):
    X = d[["CreditScore", "Age", "Tenure", "Balance", "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary"]].copy()
    X["Female"] = (d.Gender == "Female").astype(int)
    X["Germany"] = (d.Geography == "Germany").astype(int)
    X["Spain"] = (d.Geography == "Spain").astype(int)
    return X[cols] if cols else X


def oof(make, X, y, cv):
    p = np.zeros(len(y))
    for tr, te in cv.split(X, y):
        p[te] = make().fit(X.iloc[tr], y.iloc[tr]).predict_proba(X.iloc[te])[:, 1]
    return p


def model(d):
    """Out-of-fold churn risk from the blend, plus what drives it. Headline accuracy figures come from
    the repeated benchmark (outputs/benchmark.json, outputs/reliability.json) when those files exist."""
    import warnings
    warnings.filterwarnings("ignore")
    X, y = features(d), d.Exited
    cv = StratifiedKFold(5, shuffle=True, random_state=42)
    risk = oof(Blend, X, y, cv)
    out = {"Blend": {"auc": round(float(roc_auc_score(y, risk)), 3), "avg_precision": round(float(average_precision_score(y, risk)), 3)}}
    lr = Pipeline([("s", StandardScaler()), ("m", LogisticRegression(max_iter=2000))])
    out["Logistic regression"] = {"auc": round(float(roc_auc_score(y, cross_val_predict(lr, X, y, cv=cv, method="predict_proba")[:, 1])), 3)}
    beh = ["IsActiveMember", "NumOfProducts", "HasCrCard", "Tenure", "Balance"]
    dem = ["Age", "CreditScore", "EstimatedSalary", "Female", "Germany", "Spain"]
    out["Behaviour only"] = {"auc": round(float(roc_auc_score(y, oof(Blend, features(d, beh), y, cv))), 3)}
    out["Demographics only"] = {"auc": round(float(roc_auc_score(y, oof(Blend, features(d, dem), y, cv))), 3)}
    # importance: loss of out-of-fold AUC when one field is shuffled in the held-out fold (country = both flags together)
    groups = {c: [c] for c in ["Age", "NumOfProducts", "Balance", "IsActiveMember", "EstimatedSalary", "CreditScore", "Tenure", "HasCrCard"]}
    groups["Geography"], groups["Gender"] = ["Germany", "Spain"], ["Female"]
    drops = {g: [] for g in groups}
    rng = np.random.default_rng(42)
    for tr, te in cv.split(X, y):
        m = Blend().fit(X.iloc[tr], y.iloc[tr]); Xt = X.iloc[te]; base = roc_auc_score(y.iloc[te], m.predict_proba(Xt)[:, 1])
        for g, cols in groups.items():
            Xp = Xt.copy(); idx = rng.permutation(len(Xp)); Xp[cols] = Xt[cols].values[idx]
            drops[g].append(base - roc_auc_score(y.iloc[te], m.predict_proba(Xp)[:, 1]))
    out["importance"] = [{"feature": g, "auc_drop": round(float(np.mean(v)), 4)} for g, v in sorted(drops.items(), key=lambda t: -np.mean(t[1]))]
    top = np.argsort(-risk)[: len(d) // 10]
    out["top_decile_capture"] = round(float(y.iloc[top].sum() / y.sum()), 3)
    out["top_decile_churn"] = round(float(y.iloc[top].mean()), 3)
    for name in ["benchmark", "reliability"]:
        f = os.path.join(ROOT, "outputs", name + ".json")
        if os.path.exists(f):
            out[name] = json.load(open(f))
    return out, risk


def main():
    d, checks = load()
    d["Profile"] = profile(d)
    d["RSI"] = rsi(d)
    d["HighBalance"] = (d.Balance >= HIGH_BALANCE).astype(int)
    d["AgeBand"] = pd.cut(d.Age, [0, 30, 40, 50, 60, 120], labels=["18-30", "31-40", "41-50", "51-60", "61+"]).astype(str)
    d["RSITier"] = pd.cut(d.RSI, [-1, 49, 79, 100], labels=["Weak (0-49)", "Moderate (50-79)", "Strong (80-100)"]).astype(str)
    d["BalSal"] = np.where(d.EstimatedSalary > 0, d.Balance / d.EstimatedSalary, 0)
    d["Mismatch"] = np.select([(d.Balance == 0) & (d.EstimatedSalary >= 100_000), d.Balance >= 2 * d.EstimatedSalary],
                              ["High salary, empty account", "Balance over twice salary"], "Balanced")
    ml, risk = model(d)
    d["Risk"] = risk

    act, inact = d[d.IsActiveMember == 1], d[d.IsActiveMember == 0]
    hb = d[d.HighBalance == 1]
    hbi = hb[hb.IsActiveMember == 0]
    card, nocard = d[d.HasCrCard == 1], d[d.HasCrCard == 0]
    one, two = d[d.NumOfProducts == 1], d[d.NumOfProducts == 2]
    many = d[d.NumOfProducts >= 3]
    sticky = d[(d.IsActiveMember == 1) & (d.NumOfProducts == 2)]
    kpis = {
        "overall_churn": round(float(d.Exited.mean()), 4),
        "engagement_retention_ratio": round(float(inact.Exited.mean() / act.Exited.mean()), 2),
        "active_churn": round(float(act.Exited.mean()), 4), "inactive_churn": round(float(inact.Exited.mean()), 4),
        "product_depth_index": round(float((1 - two.Exited.mean()) / (1 - one.Exited.mean())), 2),
        "one_product_churn": round(float(one.Exited.mean()), 4), "two_product_churn": round(float(two.Exited.mean()), 4),
        "three_plus_churn": round(float(many.Exited.mean()), 4), "three_plus_customers": int(len(many)),
        "three_plus_ci": wilson(int(many.Exited.sum()), len(many)),
        "high_balance_disengagement_rate": round(float(len(hbi) / len(hb)), 4),
        "high_balance_inactive_churn": round(float(hbi.Exited.mean()), 4), "high_balance_inactive_customers": int(len(hbi)),
        "high_balance_churn": round(float(hb.Exited.mean()), 4), "other_balance_churn": round(float(d[d.HighBalance == 0].Exited.mean()), 4),
        "balance_at_risk": round(float(hbi.Balance.sum()), 0), "balance_lost_hbi": round(float(hbi[hbi.Exited == 1].Balance.sum()), 0),
        "credit_card_stickiness": round(float((1 - card.Exited.mean()) - (1 - nocard.Exited.mean())) * 100, 2),
        "card_churn": round(float(card.Exited.mean()), 4), "no_card_churn": round(float(nocard.Exited.mean()), 4),
        "rsi_mean": round(float(d.RSI.mean()), 1), "rsi_stayed": round(float(d[d.Exited == 0].RSI.mean()), 1), "rsi_left": round(float(d[d.Exited == 1].RSI.mean()), 1),
        "sticky_churn": round(float(sticky.Exited.mean()), 4), "sticky_customers": int(len(sticky)),
    }
    # what-if: bring inactive high-balance customers to the churn rate of active high-balance ones
    hba = hb[hb.IsActiveMember == 1]
    saved = (hbi.Exited.mean() - hba.Exited.mean()) * len(hbi)
    kpis["whatif_customers_kept"] = int(round(saved))
    kpis["whatif_balance_kept"] = round(float(saved * hbi.Balance.mean()), 0)
    kpis["high_balance_active_churn"] = round(float(hba.Exited.mean()), 4)

    tables = {
        "by_active": rate(d, "IsActiveMember"), "by_products": rate(d, "NumOfProducts"),
        "by_active_products": rate(d, ["IsActiveMember", "NumOfProducts"]), "by_profile": rate(d, "Profile"),
        "by_card": rate(d, "HasCrCard"), "by_country": rate(d, "Geography"), "by_gender": rate(d, "Gender"),
        "by_age_active": rate(d, ["AgeBand", "IsActiveMember"]), "by_balance_active": rate(d, ["HighBalance", "IsActiveMember"]),
        "by_rsi_tier": rate(d, "RSITier"), "by_mismatch": rate(d, "Mismatch"), "by_tenure": rate(d, "Tenure"),
        "by_country_products": rate(d, ["Geography", "NumOfProducts"]),
    }
    d["RSIBin"] = (d.RSI // 10 * 10).clip(upper=90)
    tables["by_rsi_bin"] = rate(d, "RSIBin")
    tests = {c: chi2(d, c) for c in ["IsActiveMember", "NumOfProducts", "HasCrCard", "HighBalance", "Geography", "Gender"]}
    rho = stats.spearmanr(d.RSI, d.Exited)
    tests["rsi_spearman"] = {"rho": round(float(rho.statistic), 3), "p": float(rho.pvalue)}
    tests["rsi_auc"] = round(float(roc_auc_score(d.Exited, -d.RSI)), 3)

    os.makedirs(os.path.join(ROOT, "outputs"), exist_ok=True)
    metrics = {"checks": checks, "high_balance_threshold": HIGH_BALANCE, "kpis": kpis, "tables": tables, "tests": tests, "model": ml}
    json.dump(metrics, open(os.path.join(ROOT, "outputs", "metrics.json"), "w"), indent=1)

    geo = {"France": 0, "Germany": 1, "Spain": 2}
    rows = [[int(r.CustomerId), r.Surname, geo[r.Geography], 1 if r.Gender == "Female" else 0, int(r.Age), int(r.Tenure), int(round(r.Balance)),
             int(r.NumOfProducts), int(r.HasCrCard), int(r.IsActiveMember), int(round(r.EstimatedSalary)), int(r.Exited), int(r.CreditScore),
             int(r.RSI), int(round(r.Risk * 100))] for r in d.itertuples()]
    with open(os.path.join(ROOT, "web", "data.js"), "w") as f:
        f.write("window.BANK=" + json.dumps({"cols": ["id", "name", "geo", "female", "age", "tenure", "balance", "products", "card", "active", "salary", "exited", "credit", "rsi", "risk"],
                                              "rows": rows, "model": ml, "tests": tests}, separators=(",", ":")) + ";")
    d.drop(columns=["RSIBin"]).to_csv(os.path.join(ROOT, "outputs", "customers_scored.csv"), index=False)
    return metrics


if __name__ == "__main__":
    m = main()
    print(json.dumps(m["kpis"], indent=1)); print(json.dumps(m["model"], indent=1)); print(json.dumps(m["tests"], indent=1))
    for k in ["by_profile", "by_rsi_tier", "by_rsi_bin", "by_mismatch"]:
        print(k); [print("  ", r) for r in m["tables"][k]]
