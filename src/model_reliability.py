"""Reliability check for the top models: false alarms, calibration, accuracy, F1.
Run: python src/model_reliability.py   (out-of-fold, stratified 5-fold x3)"""
import json, os, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    pass
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.ensemble import GradientBoostingClassifier
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = pd.read_csv(os.path.join(ROOT, "data", "European_Bank.csv")); y = d.Exited.values
X = d[["CreditScore", "Age", "Tenure", "Balance", "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary"]].copy()
X["Female"] = (d.Gender == "Female").astype(int)
for g in ["Germany", "Spain"]: X[g] = (d.Geography == g).astype(int)
M = {"Gradient boosting (current)": lambda: GradientBoostingClassifier(random_state=0),
     "XGBoost": lambda: XGBClassifier(n_estimators=400, learning_rate=.03, max_depth=4, subsample=.8, colsample_bytree=.8, min_child_weight=3, reg_lambda=2, n_jobs=4, random_state=0, verbosity=0),
     "LightGBM": lambda: LGBMClassifier(n_estimators=400, learning_rate=.03, num_leaves=15, min_child_samples=30, subsample=.8, subsample_freq=1, colsample_bytree=.8, reg_lambda=2, n_jobs=4, random_state=0, verbose=-1),
     "CatBoost": lambda: CatBoostClassifier(iterations=600, learning_rate=.04, depth=5, l2_leaf_reg=4, random_seed=0, verbose=0, thread_count=4)}
S = list(RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42).split(X, y))
P = {}
for n, mk in M.items():
    p = np.zeros((3, len(y)))
    for k, (tr, te) in enumerate(S): p[k // 5, te] = mk().fit(X.iloc[tr], y[tr]).predict_proba(X.iloc[te])[:, 1]
    P[n] = p
P["Blend (XGB + LGBM + CatBoost)"] = (P["XGBoost"] + P["LightGBM"] + P["CatBoost"]) / 3
def ece(p, y, bins=10):
    e = 0
    for lo in np.linspace(0, 1, bins + 1)[:-1]:
        m = (p >= lo) & (p < lo + 1 / bins)
        if m.any(): e += m.mean() * abs(p[m].mean() - y[m].mean())
    return e
out = {}
for n, p3 in P.items():
    r = {k: [] for k in ["auc", "accuracy", "precision", "recall", "f1", "false_alarms", "brier", "ece", "confident_wrong", "f1_tuned", "threshold"]}
    for i, p in enumerate(p3):
        h = p > .5
        r["auc"].append(roc_auc_score(y, p)); r["accuracy"].append(accuracy_score(y, h)); r["precision"].append(precision_score(y, h)); r["recall"].append(recall_score(y, h)); r["f1"].append(f1_score(y, h))
        r["false_alarms"].append(int((h & (y == 0)).sum())); r["brier"].append(brier_score_loss(y, p)); r["ece"].append(ece(p, y))
        r["confident_wrong"].append(int((((p > .9) & (y == 0)) | ((p < .1) & (y == 1))).sum()))
        o = np.mean([p3[j] for j in range(3) if j != i], axis=0); ts = np.linspace(.15, .6, 46); t = ts[np.argmax([f1_score(y, o > t) for t in ts])]
        r["f1_tuned"].append(f1_score(y, p > t)); r["threshold"].append(t)
    out[n] = {k: round(float(np.mean(v)), 4) for k, v in r.items()}
    print(f"{n:32s}", out[n])
json.dump(out, open(os.path.join(ROOT, "outputs", "reliability.json"), "w"), indent=1)
