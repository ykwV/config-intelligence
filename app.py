import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

import streamlit as st
import pandas as pd
import plotly.express as px
import json
import os
import re
from google import genai
from analytics import ConfigAnalyticsEngine

# -------------------------------------------------------------
# PAGE CONFIGURATION
# -------------------------------------------------------------
st.set_page_config(page_title="ConfigIntel | OpenObserve", page_icon="🔭", layout="wide", initial_sidebar_state="expanded")

# -------------------------------------------------------------
# OPENOBSERVE ENTERPRISE CSS INJECTION
# -------------------------------------------------------------
st.markdown("""
    <style>
    /* Import modern fonts */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fira+Code:wght@400;500&display=swap');
    
    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
    
    /* OpenObserve Color Palette */
    :root { 
        --bg-app: #020817; 
        --bg-panel: #0f172a; 
        --border-color: #1e293b; 
        --accent: #4f46e5;
        --accent-hover: #6366f1;
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
    }
    
    /* Global Overrides */
    .stApp { background-color: var(--bg-app); }
    [data-testid="stSidebar"] { background-color: var(--bg-panel) !important; border-right: 1px solid var(--border-color); }
    
    /* Sleek KPI Cards */
    div[data-testid="metric-container"] {
        background-color: var(--bg-panel);
        border: 1px solid var(--border-color);
        padding: 1.25rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s ease, border-color 0.2s ease;
    }
    div[data-testid="metric-container"]:hover { border-color: var(--accent); transform: translateY(-2px); }
    div[data-testid="metric-container"] label { color: var(--text-muted) !important; font-size: 0.85rem !important; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    div[data-testid="metric-container"] div { color: var(--text-main) !important; font-size: 1.8rem !important; font-weight: 600; }
    
    /* OpenObserve Tab Routing */
    .stTabs [data-baseweb="tab-list"] { gap: 4px; background-color: transparent; border-bottom: 2px solid var(--border-color); }
    .stTabs [data-baseweb="tab"] { background-color: transparent; border: none; padding: 0.5rem 1rem; color: var(--text-muted); font-weight: 500; }
    .stTabs [aria-selected="true"] { color: var(--accent) !important; border-bottom: 2px solid var(--accent) !important; background-color: transparent !important; }
    
    /* Terminal / Log Viewer Console */
    .oo-console { 
        font-family: 'Fira Code', monospace; 
        background-color: #000000; 
        color: #a1a1aa; 
        padding: 1.25rem; 
        border: 1px solid var(--border-color);
        border-radius: 8px; 
        font-size: 0.8rem; 
        height: 450px; 
        overflow-y: auto; 
        line-height: 1.6;
        box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.25);
    }
    .oo-console .timestamp { color: #64748b; margin-right: 8px; }
    .oo-console .fatal { color: #f87171; font-weight: 600; }
    .oo-console .warn { color: #fbbf24; }
    .oo-console .info { color: #60a5fa; }
    .oo-console .highlight { background-color: rgba(248, 113, 113, 0.15); border-left: 2px solid #f87171; padding-left: 4px; display: block; }
    
    /* Custom Buttons */
    .stButton>button { background-color: var(--accent); color: white; border: none; border-radius: 6px; font-weight: 500; transition: all 0.2s ease; }
    .stButton>button:hover { background-color: var(--accent-hover); box-shadow: 0 0 10px rgba(99, 102, 241, 0.4); }
    
    /* Hide top bar & footer */
    header {visibility: hidden;}
    footer {visibility: hidden;}
    </style>
""", unsafe_allow_html=True)

# -------------------------------------------------------------
# ENGINE INITIALIZATION
# -------------------------------------------------------------
@st.cache_resource
def init_engine():
    return ConfigAnalyticsEngine("execution_data_master.csv", "system_execution_logs.jsonl")

try:
    engine = init_engine()
    df_raw = engine.df
except Exception as err:
    st.error(f"Engine Fault: {err}")
    st.stop()

# -------------------------------------------------------------
# SIDEBAR (Global Filters)
# -------------------------------------------------------------
with st.sidebar:
    st.markdown("<h2 style='color: white; margin-bottom: 0px;'>🔭 OpenObserve</h2><p style='color: #94a3b8; font-size: 0.85rem; margin-top: 0px;'>ConfigIntel Observability Platform</p>", unsafe_allow_html=True)
    st.divider()
    
    st.markdown("### 📥 Ingestion Streams")
    uploaded_csv = st.file_uploader("Telemetry Stream (.csv)", type=["csv"], label_visibility="collapsed")
    uploaded_jsonl = st.file_uploader("Trace Stream (.jsonl)", type=["jsonl", "txt"], label_visibility="collapsed")

    if uploaded_csv:
        df_uploaded = pd.read_csv(uploaded_csv)
        new_logs = {json.loads(line.decode("utf-8").strip())["run_id"]: json.loads(line.decode("utf-8").strip()) for line in uploaded_jsonl if line.strip()} if uploaded_jsonl else None
        engine.update_data(df_uploaded, new_logs)
        df_raw = engine.df
        st.success(f"Ingested {len(df_raw):,} records.")

    st.markdown("### 🎛️ Global Context")
    selected_workloads = st.multiselect("Workload Context", df_raw["Workload_Type"].dropna().unique(), default=df_raw["Workload_Type"].dropna().unique())
    selected_memory = st.multiselect("DUT Allocations", df_raw["Memory_Alloc"].dropna().unique(), default=df_raw["Memory_Alloc"].dropna().unique())
    selected_status = st.multiselect("Outcome Filter", df_raw["Status"].dropna().unique(), default=df_raw["Status"].dropna().unique())

    if st.button("🔄 Sync Pipeline", use_container_width=True):
        st.toast("Intelligence Pipeline Synced successfully!")

# Apply Filters
active_df = df_raw[(df_raw["Workload_Type"].isin(selected_workloads)) & (df_raw["Memory_Alloc"].isin(selected_memory)) & (df_raw["Status"].isin(selected_status))]

# -------------------------------------------------------------
# MAIN DASHBOARD TABS
# -------------------------------------------------------------
st.markdown("<h3 style='font-weight: 500; margin-bottom: 20px;'>Unified Observability Hub</h3>", unsafe_allow_html=True)

tab_overview, tab_logs, tab_diff, tab_copilot = st.tabs([
    "📊 Unified Overview", 
    "🗄️ Logs & Data Explorer", 
    "🔍 Root Cause Diffs", 
    "🤖 Intelligence Copilot"
])

# -------------------------------------------------------------
# TAB 1: UNIFIED OVERVIEW
# -------------------------------------------------------------
with tab_overview:
    total_runs = len(active_df)
    fail_rate = ((active_df["Status"] == "FAIL").sum() / total_runs * 100) if total_runs > 0 else 0.0
    
    kpi1, kpi2, kpi3, kpi4 = st.columns(4)
    kpi1.metric("Total Ingested Executions", f"{total_runs:,}")
    kpi2.metric("System Failure Rate", f"{fail_rate:.2f}%", delta=f"{fail_rate:.2f}%", delta_color="inverse")
    kpi3.metric("P99 Execution Latency", f"{(active_df['Execution_Time_sec'].quantile(0.99) if total_runs > 0 else 0):.2f} s")
    kpi4.metric("Regression Reliability", f"{(100.0 - fail_rate):.2f}%")

    st.markdown("<br>", unsafe_allow_html=True)
    dash_col1, dash_col2 = st.columns(2)
    
    with dash_col1:
        st.markdown("<h5 style='color: #f8fafc; font-weight: 500;'>SHAP Parameter Attribution (XGBoost)</h5>", unsafe_allow_html=True)
        top_importances = engine.get_feature_importance(top_n=8)
        fig_imp = px.bar(
            top_importances, x="Importance_Score", y="Feature", orientation="h", color="Impact_Direction",
            color_discrete_map={"Increases Risk ⚠️": "#f87171", "Decreases Risk ✅": "#10b981"},
            template="plotly_dark", height=380
        )
        fig_imp.update_layout(
            yaxis={'categoryorder': 'total ascending'},
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            showlegend=False,
            hoverlabel=dict(bgcolor="#0b1120", font_size=12, font_family="monospace", font_color="#f8fafc", bordercolor="#334155")
        )
        st.plotly_chart(fig_imp, use_container_width=True)

    with dash_col2:
        st.markdown("<h5 style='color: #f8fafc; font-weight: 500;'>PPA Pareto Optimization Map</h5>", unsafe_allow_html=True)
        pareto_data = engine.get_pareto_front()
        fig_pareto = px.scatter(
            pareto_data.sample(min(1000, len(pareto_data)), random_state=42),
            x="Execution_Time_sec", y="Peak_Memory_GB", color="Is_Pareto",
            hover_data=["Run_ID", "Memory_Alloc"],
            color_discrete_map={True: "#10b981", False: "#334155"},
            template="plotly_dark", height=380
        )
        fig_pareto.update_layout(
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            showlegend=False,
            hoverlabel=dict(bgcolor="#0b1120", font_size=12, font_family="monospace", font_color="#f8fafc", bordercolor="#334155")
        )
        st.plotly_chart(fig_pareto, use_container_width=True)

    # DIRECT NATIVE PLOTS GENERATED BY XGBOOST & SHAP
    st.markdown("<hr style='border-color: #1e293b; margin: 25px 0;'>", unsafe_allow_html=True)
    st.markdown("<h5 style='color: #f8fafc; font-weight: 500; margin-bottom: 5px;'>Direct Native Plots Generated by Machine Learning Engine</h5>", unsafe_allow_html=True)
    st.caption("Native high-resolution artifacts directly exported from XGBoost (xgb.plot_importance) and SHAP (shap.summary_plot)")
    
    xgb_img_path = "frontend/public/xgboost_importance.png"
    shap_img_path = "frontend/public/xgboost_shap_summary.png"
    if not os.path.exists(xgb_img_path) or not os.path.exists(shap_img_path):
        engine.generate_plots("frontend/public")
        
    img_col1, img_col2 = st.columns(2)
    with img_col1:
        st.markdown("<p style='color: #818cf8; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px;'>Direct XGBoost Native Feature Importance (F-Score)</p>", unsafe_allow_html=True)
        if os.path.exists(xgb_img_path):
            st.image(xgb_img_path, caption="Exported via xgb.plot_importance across all tree splits", use_container_width=True)
        else:
            st.info("Generating XGBoost plot artifact...")
    with img_col2:
        st.markdown("<p style='color: #34d399; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px;'>Direct SHAP Beeswarm Summary Distribution</p>", unsafe_allow_html=True)
        if os.path.exists(shap_img_path):
            st.image(shap_img_path, caption="Exported via shap.summary_plot (TreeExplainer log-odds impact)", use_container_width=True)
        else:
            st.info("Generating SHAP plot artifact...")

# -------------------------------------------------------------
# TAB 2: LOGS & DATA EXPLORER
# -------------------------------------------------------------
with tab_logs:
    st.markdown("<h5 style='color: #f8fafc; margin-bottom: 15px;'>Visual Query Builder</h5>", unsafe_allow_html=True)
    
    with st.container():
        qb_c1, qb_c2, qb_c3, qb_c4 = st.columns([2, 1, 2, 2])
        filter_col = qb_c1.selectbox("Field", options=["Select Field..."] + list(active_df.columns), label_visibility="collapsed")
        filter_op = qb_c2.selectbox("Operator", options=["==", "!=", ">", "<", "Contains"], label_visibility="collapsed")
        filter_val = qb_c3.text_input("Value", placeholder="Search value...", label_visibility="collapsed")
        search_query = qb_c4.text_input("🔍 Full-Text Search", placeholder="e.g. ERR_MEM_OVERFLOW", label_visibility="collapsed")
        
        query_df = active_df.copy()
        if filter_col != "Select Field..." and filter_val:
            try:
                if filter_op == "==": query_df = query_df[query_df[filter_col].astype(str) == filter_val]
                elif filter_op == "!=": query_df = query_df[query_df[filter_col].astype(str) != filter_val]
                elif filter_op == "Contains": query_df = query_df[query_df[filter_col].astype(str).str.contains(filter_val, case=False, na=False)]
                elif filter_op == ">": query_df = query_df[pd.to_numeric(query_df[filter_col]) > float(filter_val)]
                elif filter_op == "<": query_df = query_df[pd.to_numeric(query_df[filter_col]) < float(filter_val)]
            except Exception: pass
        
        if search_query:
            mask = query_df.astype(str).apply(lambda x: x.str.contains(search_query, case=False)).any(axis=1)
            query_df = query_df[mask]

    st.caption(f"Matched Telemetry Records: {len(query_df):,}")
    st.dataframe(query_df, use_container_width=True, height=200)
    
    st.markdown("<h5 style='color: #f8fafc; margin-top: 20px;'>Live Trace Viewer</h5>", unsafe_allow_html=True)
    inspect_run = st.selectbox("Inspect Trace ID:", options=["Select Execution Trace..."] + query_df["Run_ID"].head(100).tolist(), label_visibility="collapsed")
    
    if inspect_run != "Select Execution Trace...":
        _, raw_logs = engine.get_run_details(inspect_run)
        log_html = '<div class="oo-console">'
        for e in raw_logs:
            lvl = e.get('level', 'INFO')
            css = "fatal" if lvl in ["FATAL", "ERROR"] else "warn" if lvl == "WARN" else "info"
            wrap = "highlight" if lvl == "FATAL" else ""
            log_html += f"<span class='{wrap}'><span class='timestamp'>[{e.get('timestamp')}]</span> <span class='{css}'>{lvl}</span>: {e.get('msg')}</span><br>"
        log_html += '</div>'
        st.markdown(log_html, unsafe_allow_html=True)

# -------------------------------------------------------------
# TAB 3: ROOT CAUSE DIFFS
# -------------------------------------------------------------
with tab_diff:
    st.markdown("<h5 style='color: #f8fafc; margin-bottom: 15px;'>Execution Divergence Analytics</h5>", unsafe_allow_html=True)
    col_sel_p, col_sel_f = st.columns(2)
    selected_pass = col_sel_p.selectbox("Baseline (Passing Node)", options=active_df[active_df["Status"] == "PASS"]["Run_ID"].head(50))
    selected_fail = col_sel_f.selectbox("Target (Failing Node)", options=active_df[active_df["Status"] == "FAIL"]["Run_ID"].head(50))
    
    if selected_pass and selected_fail:
        param_table, log_p, log_f = engine.compute_run_diff(selected_pass, selected_fail)
        if isinstance(param_table, list):
            param_table = pd.DataFrame(param_table)
            
        def color_diff(val):
            return 'background-color: rgba(248, 113, 113, 0.15); color: #f87171' if val == 'MISMATCH' else 'color: #94a3b8'

        styled_df = param_table.style
        if hasattr(styled_df, 'map'):
            styled_df = styled_df.map(color_diff, subset=['State'])
        else:
            styled_df = styled_df.applymap(color_diff, subset=['State'])
        st.dataframe(styled_df, use_container_width=True)
        
        c_log1, c_log2 = st.columns(2)
        with c_log1:
            st.markdown(f"<span style='color:#94a3b8; font-size:12px;'>TRACE STREAM: {selected_pass}</span>", unsafe_allow_html=True)
            st.markdown('<div class="oo-console">' + '<br>'.join([f"<span class='timestamp'>[{e.get('timestamp')}]</span> <span class='info'>{e.get('level')}</span>: {e.get('msg')}" for e in log_p]) + '</div>', unsafe_allow_html=True)
        with c_log2:
            st.markdown(f"<span style='color:#94a3b8; font-size:12px;'>TRACE STREAM: {selected_fail}</span>", unsafe_allow_html=True)
            f_logs_fmt = []
            for e in log_f:
                lvl = e.get('level', 'INFO')
                css = "fatal" if lvl == "FATAL" else "warn" if lvl == "WARN" else "info"
                wrap = "highlight" if lvl == "FATAL" else ""
                f_logs_fmt.append(f"<span class='{wrap}'><span class='timestamp'>[{e.get('timestamp')}]</span> <span class='{css}'>{lvl}</span>: {e.get('msg')}</span>")
            st.markdown('<div class="oo-console">' + '<br>'.join(f_logs_fmt) + '</div>', unsafe_allow_html=True)

# -------------------------------------------------------------
# TAB 4: AI COPILOT
# -------------------------------------------------------------
with tab_copilot:
    st.markdown("<h5 style='color: #f8fafc;'>Dual-Engine Diagnostic Assistant</h5>", unsafe_allow_html=True)
    query_mode = st.radio("Intelligence Route:", ["Native XGBoost SHAP Logic", "Google Gemini Trace Summarization"], horizontal=True)

    c1, c2 = st.columns([3, 1])
    user_query = c1.text_input("Observability Query:", placeholder="e.g. Determine the risk vector of Feature Flag X")
    gemini_key = c2.text_input("Gemini API Key (GenAI mode):", type="password", value=os.environ.get("GEMINI_API_KEY", ""))

    if st.button("Execute Natural Language Query", use_container_width=True):
        if not user_query:
            st.warning("Please provide a query string.")
        else:
            if query_mode == "Native XGBoost SHAP Logic":
                matches = engine.search_shap_metrics(user_query)
                if isinstance(matches, list):
                    matches = pd.DataFrame(matches)
                if not matches.empty:
                    for _, row in matches.iterrows():
                        impact = "INCREASES" if "Increases" in str(row['Impact_Direction']) else "DECREASES"
                        st.info(f"**Target Parsed:** `{row['Feature']}`")
                        st.markdown(f"> **SHAP Analysis:** Natively **{impact}** failure probability.\n> **Vector Weight:** `{row['Importance_Score']:.4f}`")
                else:
                    st.warning("Native engine bypassed: Parameter not identified in high-weight SHAP vectors.")

            else:
                if not gemini_key:
                    st.error("Gemini Auth Key required for trace summarization.")
                else:
                    try:
                        client = genai.Client(api_key=gemini_key)
                        resp = client.models.generate_content(
                            model='gemini-2.5-flash',
                            contents=f"You are an OpenObserve AI Assistant. System Failure Rate: {fail_rate:.1f}%. Query: {user_query}. Analyze root causes directly."
                        )
                        st.markdown(f"> {resp.text}")
                    except Exception as e:
                        st.error(f"GenAI Stream Error: {e}")