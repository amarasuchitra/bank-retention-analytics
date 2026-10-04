# Retention Intelligence: Customer Engagement and Product Utilisation Analytics

Why do bank customers leave? This project answers it through behaviour (activity, products held) instead of demographics, using 10,000 customer records from a European bank (France, Germany, Spain; 20.4% churn).

**Live dashboard:** https://bank-retention-analytics.streamlit.app

## Key findings

| Finding | Evidence |
|---|---|
| Inactive customers leave almost twice as often | 26.9% vs 14.3% |
| Two products is the sweet spot | 27.7% (one) to 7.6% (two) to 85.9% (three or four, 326 customers) |
| A high balance does not protect | 25.2% churn at EUR 100k+ vs 15.9% for the rest |
| At-risk premium customers | 2,356 inactive high-balance customers, 32.8% churn |
| Credit cards do not hold customers | 20.2% vs 20.8%, not significant (p = 0.49) |
| Relationship Strength Index tiers | Weak 42.1%, Moderate 15.0%, Strong 5.6% |
| Churn model | Blend of XGBoost, LightGBM and CatBoost: AUC 0.869, accuracy 86.6% (best of seven models, no data leakage) |

## What is in this repository

```
data/European_Bank.csv        the dataset
src/analysis.py               validation, profiles, KPIs, index, churn model
src/model_benchmark.py        seven-model comparison and the SMOTE leakage test
src/model_reliability.py      false alarms, calibration, accuracy and F1 for the top models
outputs/metrics.json          every number used in the dashboard
outputs/customers_scored.csv  each customer with profile, index, tier and risk
web/                          the dashboard (HTML, CSS, JavaScript)
streamlit_app/app.py          Streamlit entry point that serves the dashboard
```

## Run it

```bash
pip install -r requirements.txt -r requirements-analysis.txt
python src/analysis.py            # rebuilds outputs/ and web/data.js (about 1 minute)
streamlit run streamlit_app/app.py
```

## Deploy on Streamlit Community Cloud

New app to pick this repository to main file path `streamlit_app/app.py` to Deploy.

## Dashboard

Five views: Engagement, Products, Premium at risk, Relationship strength, Recommendations. The filters on the left (engagement, country, products held, minimum balance, minimum salary, minimum age, credit card) apply to every view, and every number recalculates from the customers in view. The Premium view has an adjustable balance threshold and a downloadable call list ranked by churn risk.

## Method in brief

- **Profiles:** active engaged; active, low product; inactive, high balance; inactive disengaged.
- **KPIs:** Engagement Retention Ratio, Product Depth Index, High-Balance Disengagement Rate, Credit Card Stickiness Score, Relationship Strength Index.
- **Relationship Strength Index (0-100):** product fit 50 (two products 50, one 20, three or more 0) + active 30 + tenure 1.5 per year + credit card 5.
- **Churn model:** a blend of XGBoost, LightGBM and CatBoost on ten fields, the most accurate of seven models compared (`src/model_benchmark.py`, `src/model_reliability.py`). Risk scores are out-of-fold, so each customer is scored by a model that did not see them. No oversampling is used: the benchmark shows that SMOTE before splitting inflates AUC from 0.830 to 0.923.

## Limits

One snapshot with no dates: the analysis shows association, not cause. Only the product count is known, not which products. The three-or-more-products group is small.

Author: Amara Suchitra, Department of AIML, Sai Vidya Institute of Technology, Bengaluru.
