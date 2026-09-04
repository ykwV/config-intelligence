import os
import json
import warnings
import pandas as pd
import numpy as np
import xgboost as xgb
import shap

warnings.filterwarnings("ignore", category=FutureWarning)

class ConfigAnalyticsEngine:
    def __init__(self, csv_path="execution_data_master.csv", jsonl_path="system_execution_logs.jsonl"):
        self.df = pd.DataFrame()
        self.logs_dict = {}
        self.feature_importance_df = pd.DataFrame()
        self.pareto_df = pd.DataFrame()
        
        # Auto-load datasets if available on disk
        if csv_path and os.path.exists(csv_path):
            self.load_from_files(csv_path, jsonl_path if (jsonl_path and os.path.exists(jsonl_path)) else None)

    def load_from_files(self, csv_path, jsonl_path=None):
        """Loads data from file paths on disk."""
        try:
            self.df = pd.read_csv(csv_path)
            self.logs_dict = {}
            if jsonl_path and os.path.exists(jsonl_path):
                with open(jsonl_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            item = json.loads(line)
                            self.logs_dict[item['run_id']] = item
            self._train_risk_model()
        except Exception as e:
            print(f"Warning: Failed to load initial data from files: {e}")

    def update_from_memory(self, csv_file_obj, jsonl_lines=None):
        """Real-time data recalculation from API file uploads."""
        self.df = pd.read_csv(csv_file_obj)
        self.logs_dict = {}
        if jsonl_lines:
            for line in jsonl_lines:
                if isinstance(line, bytes):
                    line_str = line.decode('utf-8', errors='ignore').strip()
                else:
                    line_str = str(line).strip()
                if line_str:
                    try:
                        item = json.loads(line_str)
                        self.logs_dict[item['run_id']] = item
                    except json.JSONDecodeError:
                        continue
        self._train_risk_model()

    def update_data(self, df, logs_dict=None):
        """Direct DataFrame update (used by Streamlit)."""
        self.df = df.copy()
        if logs_dict is not None:
            self.logs_dict = logs_dict
        self._train_risk_model()

    def _train_risk_model(self):
        """Trains XGBoost and extracts SHAP metrics for Explainability."""
        if self.df.empty:
            self.feature_importance_df = pd.DataFrame(columns=['Feature', 'Importance_Score', 'Impact_Direction'])
            return

        exclude_cols = ['Run_ID', 'Config_ID', 'Outcome_Binary', 'Status', 'Execution_Time_sec', 'Throughput_MBps', 'Peak_Memory_GB']
        feature_cols = [c for c in self.df.columns if c not in exclude_cols]
        
        if not feature_cols or 'Outcome_Binary' not in self.df.columns:
            return

        X_raw = self.df[feature_cols]
        self.X_encoded = pd.get_dummies(X_raw, drop_first=True)
        self.y = self.df['Outcome_Binary']
        
        # Skip training if only one class exists
        if len(np.unique(self.y)) < 2:
            self.feature_importance_df = pd.DataFrame(columns=['Feature', 'Importance_Score', 'Impact_Direction'])
            return

        self.xgb_model = xgb.XGBClassifier(
            n_estimators=100, 
            max_depth=6, 
            learning_rate=0.1, 
            random_state=42, 
            eval_metric='logloss'
        )
        self.xgb_model.fit(self.X_encoded, self.y)
        
        explainer = shap.TreeExplainer(self.xgb_model)
        self.shap_values = explainer.shap_values(self.X_encoded)
        
        mean_abs_shap = np.abs(self.shap_values).mean(axis=0)
        
        # Calculate impact direction via correlation between feature values and SHAP values
        impact_directions = []
        for i in range(self.X_encoded.shape[1]):
            feat_vals = self.X_encoded.iloc[:, i].to_numpy(dtype=float)
            shap_vals = self.shap_values[:, i]
            # Avoid nan if constant
            std_feat = np.std(feat_vals)
            std_shap = np.std(shap_vals)
            if std_feat > 1e-6 and std_shap > 1e-6:
                corr = np.corrcoef(feat_vals, shap_vals)[0, 1]
                impact_directions.append('Increases Risk ⚠️' if corr > 0 else 'Decreases Risk ✅')
            else:
                impact_directions.append('Neutral / Invariant')

        self.feature_importance_df = pd.DataFrame({
            'Feature': self.X_encoded.columns,
            'Importance_Score': mean_abs_shap,
            'Impact_Direction': impact_directions
        }).sort_values(by='Importance_Score', ascending=False).reset_index(drop=True)

        self.generate_plots()

    def generate_plots(self, output_dir="frontend/public"):
        """Generates direct XGBoost and SHAP plot PNGs for the dashboard."""
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            
            os.makedirs(output_dir, exist_ok=True)
            plt.style.use('dark_background')
            
            # 1. Native XGBoost Feature Importance Plot
            fig, ax = plt.subplots(figsize=(10, 6), dpi=150)
            xgb.plot_importance(self.xgb_model, max_num_features=12, ax=ax, height=0.6, color='#6366f1', grid=True)
            ax.set_title('XGBoost Native Feature Importance (F-Score)', fontsize=14, pad=12, color='#f8fafc', fontweight='bold')
            ax.set_xlabel('F-Score (Weight)', fontsize=11, labelpad=8, color='#cbd5e1')
            ax.set_ylabel('Features', fontsize=11, labelpad=8, color='#cbd5e1')
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, 'xgboost_importance.png'), facecolor='#0b1120', edgecolor='none')
            plt.close()

            # 2. SHAP Summary Beeswarm Plot
            plt.figure(figsize=(10, 6), dpi=150)
            shap.summary_plot(self.shap_values, self.X_encoded, max_display=12, show=False)
            plt.title('SHAP Value Impact on Failure Probability (Log-Odds)', fontsize=13, pad=12, color='#f8fafc', fontweight='bold')
            plt.xlabel('SHAP value (impact on failure model output)', fontsize=11, labelpad=8, color='#cbd5e1')
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, 'xgboost_shap_summary.png'), facecolor='#0b1120', edgecolor='none')
            plt.close()
        except Exception as e:
            print(f"Notice: Could not generate direct PNG plots: {e}")

    def get_feature_importance(self, top_n=8):
        """Returns top feature importances as a DataFrame (used by Streamlit)."""
        if self.feature_importance_df.empty:
            return pd.DataFrame(columns=['Feature', 'Importance_Score', 'Impact_Direction'])
        return self.feature_importance_df.head(top_n)


    def get_pareto_front(self):
        """Calculates and returns Pareto frontier DataFrame (used by Streamlit)."""
        if self.df.empty:
            return pd.DataFrame()
            
        valid_runs = self.df[self.df['Status'] == 'PASS'].copy()
        if valid_runs.empty:
            return pd.DataFrame()
            
        sorted_runs = valid_runs.sort_values(by=['Execution_Time_sec', 'Peak_Memory_GB'], ascending=[True, True])
        pareto_ids = []
        min_memory = float('inf')
        for _, row in sorted_runs.iterrows():
            if row['Peak_Memory_GB'] < min_memory:
                pareto_ids.append(row['Run_ID'])
                min_memory = row['Peak_Memory_GB']
        
        valid_runs['Is_Pareto'] = valid_runs['Run_ID'].isin(pareto_ids)
        self.pareto_df = valid_runs
        return valid_runs

    def get_run_details(self, run_id):
        """Returns details and trace events for a specific run (used by Streamlit & API)."""
        if self.df.empty:
            return {}, [{"timestamp": "00:00:00.000", "level": "INFO", "msg": "No dataset loaded."}]
            
        matching = self.df[self.df['Run_ID'] == run_id]
        details = matching.iloc[0].to_dict() if not matching.empty else {}
        
        raw_logs = self.logs_dict.get(run_id, {}).get("events", [
            {"timestamp": "00:00:00.000", "level": "INFO", "msg": f"No detailed trace log registered for run {run_id}"}
        ])
        return details, raw_logs

    def _ensure_critical_columns(self):
        """Ensures all baseline columns exist with sensible defaults regardless of ingested schema."""
        if self.df.empty:
            return
        if 'Run_ID' not in self.df.columns:
            self.df['Run_ID'] = [f"RUN_{i:05d}" for i in range(len(self.df))]
        if 'Status' not in self.df.columns:
            if 'Outcome_Binary' in self.df.columns:
                self.df['Status'] = self.df['Outcome_Binary'].apply(lambda x: 'FAIL' if x == 1 else 'PASS')
            elif 'Error_Type' in self.df.columns:
                self.df['Status'] = self.df['Error_Type'].apply(
                    lambda x: 'FAIL' if pd.notna(x) and str(x).strip().lower() not in ['none', 'nan', '', '0'] else 'PASS'
                )
            else:
                self.df['Status'] = 'PASS'
        if 'Outcome_Binary' not in self.df.columns:
            self.df['Outcome_Binary'] = (self.df['Status'] == 'FAIL').astype(int)
        if 'Execution_Time_sec' not in self.df.columns:
            self.df['Execution_Time_sec'] = 100.0
        if 'Peak_Memory_GB' not in self.df.columns:
            self.df['Peak_Memory_GB'] = 16.0
        if 'Throughput_MBps' not in self.df.columns:
            self.df['Throughput_MBps'] = 500.0
        if 'Memory_Alloc' not in self.df.columns:
            self.df['Memory_Alloc'] = '32GB'
        if 'Workload_Type' not in self.df.columns:
            self.df['Workload_Type'] = 'Standard'

    def get_dashboard_data(self):
        """Packages Q1 and Q2 data for the React/Next.js Unified Overview."""
        if self.df.empty:
            return None
            
        self._ensure_critical_columns()
        total_runs = len(self.df)
        status_col = self.df['Status']
        fail_count = int((status_col == 'FAIL').sum())
        fail_rate = (fail_count / total_runs * 100) if total_runs > 0 else 0.0
        
        exec_col = self.df['Execution_Time_sec']
        avg_latency = float(exec_col.mean()) if total_runs > 0 else 0.0
        p99_latency = float(exec_col.quantile(0.99)) if total_runs > 0 else 0.0
        
        # Pareto Calculation
        valid_runs = self.df[status_col == 'PASS'].copy()
        pareto_points = []
        if not valid_runs.empty and 'Peak_Memory_GB' in valid_runs.columns:
            sorted_runs = valid_runs.sort_values(by=['Execution_Time_sec', 'Peak_Memory_GB'], ascending=[True, True])
            pareto_ids = []
            min_memory = float('inf')
            for _, row in sorted_runs.iterrows():
                if row['Peak_Memory_GB'] < min_memory:
                    pareto_ids.append(row['Run_ID'])
                    min_memory = row['Peak_Memory_GB']
            
            valid_runs['Is_Pareto'] = valid_runs['Run_ID'].isin(pareto_ids)
            sample_df = valid_runs.sample(min(500, len(valid_runs)), random_state=42)
            cols = [c for c in ['Run_ID', 'Execution_Time_sec', 'Peak_Memory_GB', 'Is_Pareto', 'Throughput_MBps', 'Memory_Alloc'] if c in sample_df.columns]
            pareto_points = sample_df[cols].to_dict(orient='records')
        
        # Workload breakdown
        workload_counts = self.df['Workload_Type'].value_counts().to_dict() if 'Workload_Type' in self.df.columns else {}

        pass_runs = self.df[status_col == 'PASS']['Run_ID'].head(50).tolist() if 'Run_ID' in self.df.columns else []
        fail_runs = self.df[status_col == 'FAIL']['Run_ID'].head(50).tolist() if 'Run_ID' in self.df.columns else []

        shap_metrics = self.feature_importance_df.head(10).to_dict(orient='records') if not self.feature_importance_df.empty else []

        return {
            "kpis": {
                "total_runs": total_runs,
                "failure_rate": round(fail_rate, 2),
                "avg_latency": round(avg_latency, 2),
                "p99_latency": round(p99_latency, 2),
                "reliability": round(100.0 - fail_rate, 2)
            },
            "shap_metrics": shap_metrics,
            "pareto_front": pareto_points,
            "workload_distribution": workload_counts,
            "pass_runs": pass_runs,
            "fail_runs": fail_runs
        }

    def compute_run_diff(self, run_pass_id, run_fail_id, as_df=False):
        """Answers Q6 for the Diff Inspector."""
        if self.df.empty:
            return [] if not as_df else pd.DataFrame(), [], []
            
        pass_matches = self.df[self.df['Run_ID'] == run_pass_id]
        fail_matches = self.df[self.df['Run_ID'] == run_fail_id]
        
        if pass_matches.empty or fail_matches.empty:
            empty_diff = [{"Parameter": "Status", "PASS_Baseline": "Not Found", "FAIL_Target": "Not Found", "State": "MISMATCH"}]
            return (pd.DataFrame(empty_diff) if as_df else empty_diff), [], []
            
        row_pass = pass_matches.iloc[0]
        row_fail = fail_matches.iloc[0]
        
        tracked_keys = ['Cache_Policy', 'Scheduler', 'Feature_Flag_X', 'Compiler_Opt', 'Memory_Alloc', 'Random_Seed_Group', 'Workload_Type', 'Traffic_Pattern']
        param_diffs = []
        for key in tracked_keys:
            val_p = str(row_pass.get(key, 'N/A'))
            val_f = str(row_fail.get(key, 'N/A'))
            param_diffs.append({
                "Parameter": key,
                "PASS_Baseline": val_p,
                "FAIL_Target": val_f,
                "State": "MISMATCH" if val_p != val_f else "MATCH"
            })

        log_p = self.logs_dict.get(run_pass_id, {}).get("events", [{"msg": "No trace found", "level": "INFO", "timestamp": "00:00:00.000"}])
        log_f = self.logs_dict.get(run_fail_id, {}).get("events", [{"msg": "No trace found", "level": "INFO", "timestamp": "00:00:00.000"}])
        
        return (pd.DataFrame(param_diffs) if as_df else param_diffs), log_p, log_f

    def get_runs_list(self, limit=50, offset=0, status=None, search=None):
        """Returns paginated/searchable runs for the Live Explorer."""
        if self.df.empty:
            return {"total": 0, "runs": []}
            
        filtered = self.df
        if status and status.upper() in ["PASS", "FAIL"]:
            filtered = filtered[filtered['Status'] == status.upper()]
        if search:
            search_str = str(search).strip()
            mask = filtered.astype(str).apply(lambda col: col.str.contains(search_str, case=False, na=False)).any(axis=1)
            filtered = filtered[mask]
            
        total = len(filtered)
        key_cols = ['Run_ID', 'Config_ID', 'Status', 'Execution_Time_sec', 'Peak_Memory_GB', 'Throughput_MBps', 'Workload_Type', 'Cache_Policy', 'Scheduler', 'Feature_Flag_X']
        cols = [c for c in key_cols if c in filtered.columns]
        
        slice_df = filtered[cols].iloc[offset:offset+limit]
        return {
            "total": total,
            "runs": slice_df.to_dict(orient='records')
        }

    def get_system_context(self):
        if self.df.empty: return "No data loaded in engine."
        total_runs = len(self.df)
        fail_count = int((self.df['Status'] == 'FAIL').sum())
        fail_rate = (fail_count / total_runs * 100) if total_runs > 0 else 0.0
        top_risks = self.feature_importance_df.head(5).to_dict('records')
        return f"SYSTEM METRICS:\n- Total Runs: {total_runs}\n- Failure Rate: {fail_rate:.2f}%\n- Top Failure Drivers (SHAP): {top_risks}"
    
    def search_shap_metrics(self, query):
        if self.feature_importance_df.empty:
            return []
        query_clean = str(query).lower().replace(" ", "_")
        matches = self.feature_importance_df[self.feature_importance_df['Feature'].str.lower().str.contains(query_clean, na=False)]
        return matches.to_dict(orient='records')