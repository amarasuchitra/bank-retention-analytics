"""Model benchmark: which churn model is most accurate on this data, measured honestly.

Run:  python src/model_benchmark.py     (about 3 minutes)
Every score is out-of-fold from the same repeated stratified 5-fold split (3 repeats, 15 fits per model),
so no model is scored on customers it was trained on. Writes outputs/benchmark.json.
"""
import json, os, warnings
import numpy as np, pandas as pd
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, average_precision_score, f1_score, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = pd.read_csv(os.path.join(ROOT, "data", "European_Bank.csv"))
y = d.Exited.values

def base(d):
    X = d[["CreditScore", "Age", "Tenure", "Balance", "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary"]].copy()
    X["Female"] = (d.Gender == "Female").astype(int)
    for g in ["Germany", "Spain"]: X[g] = (d.Geography == g).astype(int)
    return X

def engineered(d):
    X = base(d)
    X["ZeroBalance"] = (d.Balance == 0).astype(int)
    X["BalanceToSalary"] = d.Balance / (d.EstimatedSalary + 1)
    X["ProductsXActive"] = d.NumOfProducts * d.IsActiveMember
    X["OverSold"] = (d.NumOfProducts >= 3).astype(int)
    X["TwoProducts"] = (d.NumOfProducts == 2).astype(int)
    X["AgeXInactive"] = d.Age * (1 - d.IsActiveMember)
    X["TenureByAge"] = d.Tenure / d.Age
    X["CreditByAge"] = d.CreditScore / d.Age
    return X

RKF = RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42)
SPLITS = list(RKF.split(d, y))

def oof(make, X):
    """Mean out-of-fold probability over the 3 repeats, plus per-fold AUCs."""
    P = np.zeros((3, len(y))); aucs = []
    for k, (tr, te) in enumerate(SPLITS):
        m = make(); m.fit(X.iloc[tr], y[tr]); p = m.predict_proba(X.iloc[te])[:, 1]
        P[k // 5, te] = p; aucs.append(roc_auc_score(y[te], p))
    return P, aucs

def summary(P, aucs):
    acc = np.mean([accuracy_score(y, p > .5) for p in P]); f1 = np.mean([f1_score(y, p > .5) for p in P])
    ap = np.mean([average_precision_score(y, p) for p in P])
    # F1 at a threshold chosen on the other repeats (never on the customers being scored in that repeat's average)
    f1t = []
    for r in range(3):
        others = np.mean([P[j] for j in range(3) if j != r], axis=0)
        ts = np.linspace(.15, .6, 46); best = ts[np.argmax([f1_score(y, others > t) for t in ts])]
        f1t.append(f1_score(y, P[r] > best))
    top = []
    for p in P:
        idx = np.argsort(-p)[: len(y) // 10]; top.append(y[idx].sum() / y.sum())
    return {"auc": round(float(np.mean(aucs)), 4), "auc_sd": round(float(np.std(aucs)), 4), "avg_precision": round(float(ap), 4),
            "accuracy": round(float(acc), 4), "f1_at_0.5": round(float(f1), 4), "f1_tuned": round(float(np.mean(f1t)), 4), "top_decile_capture": round(float(np.mean(top)), 4)}

MODELS = {
    "Logistic regression": lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
    "Random forest": lambda: RandomForestClassifier(500, min_samples_leaf=3, n_jobs=-1, random_state=0),
    "Gradient boosting (sklearn, default)": lambda: GradientBoostingClassifier(random_state=0),
    "XGBoost": lambda: XGBClassifier(n_estimators=400, learning_rate=.03, max_depth=4, subsample=.8, colsample_bytree=.8, min_child_weight=3, reg_lambda=2, n_jobs=4, random_state=0, verbosity=0),
    "LightGBM": lambda: LGBMClassifier(n_estimators=400, learning_rate=.03, num_leaves=15, min_child_samples=30, subsample=.8, subsample_freq=1, colsample_bytree=.8, reg_lambda=2, n_jobs=4, random_state=0, verbose=-1),
    "CatBoost": lambda: CatBoostClassifier(iterations=600, learning_rate=.04, depth=5, l2_leaf_reg=4, random_seed=0, verbose=0, thread_count=4),
}
res, keep = {}, {}
for fs_name, X in [("original fields", base(d)), ("engineered features", engineered(d))]:
    for name, make in MODELS.items():
        P, a = oof(make, X); key = f"{name} | {fs_name}"; res[key] = summary(P, a); keep[key] = (P, a)
        print(f"{key:62s}", res[key], flush=True)

# blend of the three boosted libraries on the better feature set for each
best_fs = {n: max(["original fields", "engineered features"], key=lambda f: res[f"{n} | {f}"]["auc"]) for n in ["XGBoost", "LightGBM", "CatBoost"]}
Pb = np.mean([keep[f"{n} | {best_fs[n]}"][0] for n in best_fs], axis=0)
ab = [roc_auc_score(y[te], Pb[k // 5, te]) for k, (tr, te) in enumerate(SPLITS)]
res["Blend: XGBoost + LightGBM + CatBoost"] = summary(Pb, ab); print("Blend", res["Blend: XGBoost + LightGBM + CatBoost"])

# why some published scores are higher: oversampling before splitting leaks synthetic copies of test customers into training
from imblearn.over_sampling import SMOTE
Xb = base(d); Xs, ys = SMOTE(random_state=0).fit_resample(Xb, y)
p = cross_val_predict(RandomForestClassifier(300, n_jobs=-1, random_state=0), Xs, ys, cv=StratifiedKFold(5, shuffle=True, random_state=0), method="predict_proba")[:, 1]
leak = {"auc": round(float(roc_auc_score(ys, p)), 4), "accuracy": round(float(accuracy_score(ys, p > .5)), 4), "f1": round(float(f1_score(ys, p > .5)), 4)}
# the correct way: oversample only inside each training fold, score on untouched customers
pc = np.zeros(len(y))
for tr, te in StratifiedKFold(5, shuffle=True, random_state=0).split(Xb, y):
    Xa, ya = SMOTE(random_state=0).fit_resample(Xb.iloc[tr], y[tr]); pc[te] = RandomForestClassifier(300, n_jobs=-1, random_state=0).fit(Xa, ya).predict_proba(Xb.iloc[te])[:, 1]
right = {"auc": round(float(roc_auc_score(y, pc)), 4), "accuracy": round(float(accuracy_score(y, pc > .5)), 4), "f1": round(float(f1_score(y, pc > .5)), 4)}
print("SMOTE before split (leaky):", leak); print("SMOTE inside folds (correct):", right)
json.dump({"models": res, "best_feature_set": best_fs, "smote_leaky": leak, "smote_correct": right, "protocol": "repeated stratified 5-fold x3, out-of-fold"}, open(os.path.join(ROOT, "outputs", "benchmark.json"), "w"), indent=1)
