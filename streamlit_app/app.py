"""Retention Intelligence: customer engagement and product utilisation dashboard.

Run locally:  streamlit run streamlit_app/app.py
Deploy:       Streamlit Community Cloud, main file path streamlit_app/app.py

The dashboard is one self-contained page (web/). Streamlit serves it and keeps it in
the scored customers in web/data.js, which src/analysis.py builds from data/European_Bank.csv.
"""
import os

import streamlit as st
import streamlit.components.v1 as components

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
FILES = ["index.html", "app.css", "app.js", "data.js"]
CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"

st.set_page_config(page_title="Retention Intelligence · European Bank", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
#MainMenu, footer, header[data-testid="stHeader"], [data-testid="stToolbar"] {display:none !important;}
.block-container, .stMainBlockContainer {padding:0 !important; max-width:100% !important;}
.stApp > header {display:none;}
[data-testid="stAppViewContainer"] > .main {padding:0;}
iframe {display:block; border:0;}
</style>""", unsafe_allow_html=True)

if not os.path.exists(os.path.join(WEB, "data.js")):
    st.error("web/data.js is missing. Run `python src/analysis.py` once to build it, then reload.")
    st.stop()


def read(name):
    with open(os.path.join(WEB, name), encoding="utf-8") as f:
        return f.read()


@st.cache_data(show_spinner=False)
def page(version):
    html = read("index.html")
    html = html.replace('<link rel="stylesheet" href="app.css">', "<style>" + read("app.css") + "</style>")
    chart = os.path.join(WEB, "vendor", "chart.umd.min.js")
    if not os.path.exists(chart):   # no bundled copy: load Chart.js from the CDN instead
        html = html.replace('<script src="vendor/chart.umd.min.js"></script>', f'<script src="{CHART_CDN}"></script>')
    for src in ["vendor/chart.umd.min.js", "data.js", "app.js"]:
        if os.path.exists(os.path.join(WEB, src)):
            html = html.replace(f'<script src="{src}"></script>', "<script>" + read(src).replace("</script>", "<\\/script>") + "</script>")
    return html


version = tuple(os.path.getmtime(os.path.join(WEB, f)) for f in FILES)
components.html(page(version), height=940, scrolling=True)
