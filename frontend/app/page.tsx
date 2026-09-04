/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Key,
  Layers,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const emptySubscribe = () => () => {};

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface DashboardData {
  kpis: {
    total_runs: number;
    failure_rate: number;
    avg_latency: number;
    p99_latency: number;
    reliability: number;
  };
  shap_metrics: Array<{
    Feature: string;
    Importance_Score: number;
    Impact_Direction: string;
  }>;
  pareto_front: Array<{
    Run_ID: string;
    Execution_Time_sec: number;
    Peak_Memory_GB: number;
    Is_Pareto: boolean;
    Throughput_MBps: number;
    Memory_Alloc?: string;
  }>;
  workload_distribution?: Record<string, number>;
  pass_runs: string[];
  fail_runs: string[];
}

interface RunRecord {
  Run_ID: string;
  Config_ID: string;
  Status: string;
  Execution_Time_sec: number;
  Peak_Memory_GB: number;
  Throughput_MBps: number;
  Workload_Type: string;
  Cache_Policy: string;
  Scheduler: string;
  Feature_Flag_X: boolean;
}

interface TraceEvent {
  timestamp: string;
  level: string;
  msg: string;
}

interface DiffParam {
  Parameter: string;
  PASS_Baseline: string;
  FAIL_Target: string;
  State: string;
}

interface ParetoDataPoint {
  Run_ID: string;
  Execution_Time_sec: number;
  Peak_Memory_GB: number;
  Is_Pareto: boolean;
  Throughput_MBps: number;
  Memory_Alloc?: string;
}

interface TooltipPayloadItem<T> {
  name?: string;
  value?: number | string;
  unit?: string;
  dataKey?: string;
  payload?: T;
}

const CustomParetoTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<TooltipPayloadItem<ParetoDataPoint>>;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0];
  const d = raw?.payload;
  if (!d) return null;

  const runId = d.Run_ID || "Execution Trace";
  const isPareto = Boolean(d.Is_Pareto);
  const execTime = d.Execution_Time_sec;
  const peakMem = d.Peak_Memory_GB;
  const throughput = d.Throughput_MBps;
  const alloc = d.Memory_Alloc;

  return (
    <div
      style={{ backgroundColor: "#0b1120", borderColor: "#334155", color: "#f8fafc" }}
      className="border p-3.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono min-w-[220px] pointer-events-none"
    >
      <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-800">
        <span style={{ color: "#ffffff" }} className="font-bold text-xs tracking-wide">
          {runId}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            isPareto
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "bg-slate-800 text-slate-300 border border-slate-700"
          }`}
        >
          {isPareto ? "Pareto Optimal" : "Standard Run"}
        </span>
      </div>
      <div className="space-y-1.5" style={{ color: "#e2e8f0" }}>
        {execTime !== undefined && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Execution Time:</span>
            <strong style={{ color: "#ffffff" }} className="font-bold">{execTime}s</strong>
          </div>
        )}
        {peakMem !== undefined && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Peak Memory:</span>
            <strong style={{ color: "#ffffff" }} className="font-bold">{peakMem} GB</strong>
          </div>
        )}
        {throughput !== undefined && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Throughput:</span>
            <strong style={{ color: "#34d399" }} className="font-bold">{throughput} MB/s</strong>
          </div>
        )}
        {alloc && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Allocation:</span>
            <span style={{ color: "#a5b4fc" }} className="font-medium">{alloc}</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface ShapDataPoint {
  Feature: string;
  Importance_Score: number;
  Impact_Direction: string;
}

const CustomShapTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<TooltipPayloadItem<ShapDataPoint>>;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0];
  const d = raw?.payload;
  if (!d) return null;

  const feature = d.Feature || "Feature";
  const direction = d.Impact_Direction || "";
  const isRisk = direction.includes("Increases");
  const score = d.Importance_Score;

  return (
    <div
      style={{ backgroundColor: "#0b1120", borderColor: "#334155", color: "#f8fafc" }}
      className="border p-3.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono min-w-[220px] pointer-events-none"
    >
      <div
        style={{ color: "#ffffff", borderColor: "#1e293b" }}
        className="font-bold text-xs mb-2 pb-1.5 border-b tracking-wide"
      >
        {feature}
      </div>
      <div className="space-y-1.5" style={{ color: "#e2e8f0" }}>
        {direction && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Risk Impact:</span>
            <strong style={{ color: isRisk ? "#f87171" : "#34d399" }} className="font-bold">
              {direction}
            </strong>
          </div>
        )}
        {score !== undefined && (
          <div className="flex justify-between gap-4">
            <span style={{ color: "#94a3b8" }}>Importance Score:</span>
            <strong style={{ color: "#a5b4fc" }} className="font-bold">
              {Number(score).toFixed(4)}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ObservabilityDashboard() {
  const mounted = useMounted();
  const [activeTab, setActiveTab] = useState<"overview" | "explorer" | "diff" | "copilot">("overview");
  const [overviewViewMode, setOverviewViewMode] = useState<"all" | "interactive" | "xgboost_png" | "shap_png">("all");
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string; desc: string } | null>(null);

  // Backend Health & Data
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ingestion Modal
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestSuccessMsg, setIngestSuccessMsg] = useState<string | null>(null);

  // Explorer State
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [totalRunsCount, setTotalRunsCount] = useState(0);
  const [runsPage, setRunsPage] = useState(0);
  const [runsStatusFilter, setRunsStatusFilter] = useState<string>("ALL");
  const [runsSearch, setRunsSearch] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetails, setSelectedRunDetails] = useState<Record<string, unknown> | null>(null);
  const [selectedRunTrace, setSelectedRunTrace] = useState<TraceEvent[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  // Diff State
  const [diffPassId, setDiffPassId] = useState<string>("");
  const [diffFailId, setDiffFailId] = useState<string>("");
  const [diffParams, setDiffParams] = useState<DiffParam[]>([]);
  const [diffLogPass, setDiffLogPass] = useState<TraceEvent[]>([]);
  const [diffLogFail, setDiffLogFail] = useState<TraceEvent[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  // Copilot State
  const [copilotMode, setCopilotMode] = useState<"Native" | "Gemini">("Native");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [copilotQuery, setCopilotQuery] = useState<string>("");
  const [copilotResponse, setCopilotResponse] = useState<string | null>(null);
  const [copilotSummary, setCopilotSummary] = useState<string | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const inspectRun = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    setTraceLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/run/${runId}`);
      setSelectedRunDetails(res.data.details || null);
      setSelectedRunTrace(res.data.events || []);
    } catch (err: unknown) {
      console.error("Failed to fetch trace:", err);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const fetchRuns = useCallback(async (page: number, status: string, search: string) => {
    try {
      const limit = 15;
      const offset = page * limit;
      const params: Record<string, string | number> = { limit, offset };
      if (status !== "ALL") params.status = status;
      if (search.trim()) params.search = search.trim();

      const res = await axios.get(`${API_BASE}/api/runs`, { params });
      setRuns(res.data.runs || []);
      setTotalRunsCount(res.data.total || 0);

      if (res.data.runs && res.data.runs.length > 0 && !selectedRunId) {
        inspectRun(res.data.runs[0].Run_ID);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch runs:", err);
    }
  }, [inspectRun, selectedRunId]);

  const fetchHealthAndDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const healthRes = await axios.get(`${API_BASE}/api/health`, { timeout: 4000 });
      if (healthRes.data.status === "healthy") {
        setBackendHealthy(true);
      }

      const dashRes = await axios.get(`${API_BASE}/api/dashboard`);
      setDashboardData(dashRes.data);

      if (dashRes.data.pass_runs?.length && dashRes.data.fail_runs?.length) {
        setDiffPassId(dashRes.data.pass_runs[0]);
        setDiffFailId(dashRes.data.fail_runs[0]);
      }

      await fetchRuns(0, "ALL", "");
    } catch (err: unknown) {
      console.error("Connection error:", err);
      setBackendHealthy(false);
      let detail = "Could not connect to ConfigIntel backend on " + API_BASE;
      if (axios.isAxiosError(err)) {
        detail = err.response?.data?.detail || err.message;
      } else if (err instanceof Error) {
        detail = err.message;
      }
      setErrorMsg(detail);
    } finally {
      setLoading(false);
    }
  }, [fetchRuns]);

  useEffect(() => {
    let ignore = false;
    const init = async () => {
      try {
        const healthRes = await axios.get(`${API_BASE}/api/health`, { timeout: 4000 });
        if (!ignore && healthRes.data.status === "healthy") {
          setBackendHealthy(true);
        }

        const dashRes = await axios.get(`${API_BASE}/api/dashboard`);
        if (!ignore) {
          setDashboardData(dashRes.data);
          if (dashRes.data.pass_runs?.length && dashRes.data.fail_runs?.length) {
            setDiffPassId(dashRes.data.pass_runs[0]);
            setDiffFailId(dashRes.data.fail_runs[0]);
          }
        }

        const res = await axios.get(`${API_BASE}/api/runs`, { params: { limit: 15, offset: 0 } });
        if (!ignore) {
          setRuns(res.data.runs || []);
          setTotalRunsCount(res.data.total || 0);
          if (res.data.runs && res.data.runs.length > 0) {
            inspectRun(res.data.runs[0].Run_ID);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setBackendHealthy(false);
          let detail = "Could not connect to ConfigIntel backend on " + API_BASE;
          if (axios.isAxiosError(err)) {
            detail = err.response?.data?.detail || err.message;
          } else if (err instanceof Error) {
            detail = err.message;
          }
          setErrorMsg(detail);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    init();
    return () => {
      ignore = true;
    };
  }, [inspectRun]);

  // Diff Fetcher
  const computeDiff = useCallback(async (passId: string, failId: string) => {
    if (!passId || !failId) return;
    setDiffLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/diff`, {
        params: { pass_id: passId, fail_id: failId },
      });
      setDiffParams(res.data.params || []);
      setDiffLogPass(res.data.log_p || []);
      setDiffLogFail(res.data.log_f || []);
    } catch (err: unknown) {
      console.error("Diff error:", err);
    } finally {
      setDiffLoading(false);
    }
  }, []);

  const handleComputeDiff = () => {
    computeDiff(diffPassId, diffFailId);
  };

  const handleTabChange = (tab: "overview" | "explorer" | "diff" | "copilot") => {
    setActiveTab(tab);
    if (tab === "diff" && diffPassId && diffFailId && diffParams.length === 0) {
      computeDiff(diffPassId, diffFailId);
    }
  };

  // Copilot Actions
  const handleExecuteCopilotQuery = async (queryText?: string) => {
    const q = queryText || copilotQuery;
    if (!q.trim()) return;
    setCopilotLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/copilot/chat`, {
        query: q,
        mode: copilotMode,
        gemini_key: geminiKey,
      });
      setCopilotResponse(res.data.response);
    } catch (err: unknown) {
      let msg = "Unknown error querying copilot";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.detail || err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setCopilotResponse(`Error querying copilot: ${msg}`);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/copilot/summary`, {
        query: "",
        mode: copilotMode,
        gemini_key: geminiKey,
      });
      setCopilotSummary(res.data.summary);
    } catch (err: unknown) {
      let msg = "Failed to generate summary";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.detail || err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setCopilotSummary(`Failed to generate summary: ${msg}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Ingestion Submit
  const handleIngestSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setIngestLoading(true);
    setIngestSuccessMsg(null);
    try {
      const formData = new FormData();
      formData.append("csv_file", csvFile);
      if (jsonlFile) {
        formData.append("jsonl_file", jsonlFile);
      }
      const res = await axios.post(`${API_BASE}/api/ingest`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setIngestSuccessMsg(res.data.message || "Data stream successfully ingested!");
      setTimeout(() => {
        setShowIngestModal(false);
        fetchHealthAndDashboard();
      }, 1200);
    } catch (err: unknown) {
      let msg = "Ingestion error";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.detail || err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      alert(`Ingestion error: ${msg}`);
    } finally {
      setIngestLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col font-sans">
      {/* TOP NAVIGATION BAR */}
      <header className="border-b border-slate-800/80 bg-[#090d1a]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="h-full w-full bg-[#090d1a] rounded-[11px] flex items-center justify-center">
              <Activity className="h-5 w-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                ConfigIntel
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                Observability
              </span>
            </div>
            <p className="text-xs text-slate-400">Execution Log & Parameter Analytics Platform</p>
          </div>
        </div>

        {/* Action Controls & Backend Status */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                backendHealthy
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                  : "bg-rose-500"
              }`}
            />
            <span className="text-slate-300 font-mono text-[11px]">
              {backendHealthy ? "API Online (8000)" : "API Disconnected"}
            </span>
          </div>

          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs font-medium transition-all shadow-sm"
          >
            <UploadCloud className="h-4 w-4" />
            Ingest Stream
          </button>

          <button
            onClick={fetchHealthAndDashboard}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* DISCONNECTED WARNING BANNER */}
      {backendHealthy === false && (
        <div className="bg-rose-950/40 border-b border-rose-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <span>
              <strong>Backend Disconnected:</strong> {errorMsg || `FastAPI server is not responding at ${API_BASE}. Ensure python main.py is running.`}
            </span>
          </div>
          <button
            onClick={fetchHealthAndDashboard}
            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* TAB NAVIGATION */}
        <div className="flex border-b border-slate-800 gap-1 bg-slate-900/40 p-1 rounded-xl w-fit">
          <button
            onClick={() => handleTabChange("overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "overview"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Unified Overview
          </button>
          <button
            onClick={() => handleTabChange("explorer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "explorer"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Terminal className="h-4 w-4" />
            Trace & Log Explorer
          </button>
          <button
            onClick={() => handleTabChange("diff")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "diff"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <ArrowRightLeft className="h-4 w-4" />
            Root Cause Diffs
          </button>
          <button
            onClick={() => handleTabChange("copilot")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "copilot"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Bot className="h-4 w-4" />
            AI Copilot & Insights
          </button>
        </div>

        {/* TAB 1: UNIFIED OVERVIEW */}
        {activeTab === "overview" && dashboardData && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Top 4 KPI Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 relative overflow-hidden group hover:border-indigo-500/50 transition-all shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Ingested Runs</span>
                  <Layers className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-white">
                  {dashboardData.kpis.total_runs.toLocaleString()}
                </div>
                <p className="text-xs text-slate-500 mt-1">Telemetry stream synchronized</p>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 relative overflow-hidden group hover:border-rose-500/50 transition-all shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">System Failure Rate</span>
                  <ShieldAlert className="h-4 w-4 text-rose-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {dashboardData.kpis.failure_rate}%
                  </span>
                  <span className="text-xs font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                    High Alert
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Ground truth risk vectors detected</p>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-rose-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 relative overflow-hidden group hover:border-amber-500/50 transition-all shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">P99 Execution Latency</span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-white">
                  {dashboardData.kpis.p99_latency.toFixed(1)}s
                </div>
                <p className="text-xs text-slate-500 mt-1">Avg latency: {dashboardData.kpis.avg_latency.toFixed(1)}s</p>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 relative overflow-hidden group hover:border-emerald-500/50 transition-all shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Reliability Score</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {dashboardData.kpis.reliability}%
                  </span>
                  <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Stable execution nodes ratio</p>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* View Mode Switcher: All Views vs Interactive Charts vs Direct XGBoost PNG vs SHAP PNG */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b1120] border border-slate-800 p-2.5 rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium pl-2">Display Format:</span>
                <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs flex-wrap gap-1">
                  <button
                    onClick={() => setOverviewViewMode("all")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                      overviewViewMode === "all"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    All Views (Interactive + Direct PNGs)
                  </button>
                  <button
                    onClick={() => setOverviewViewMode("interactive")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                      overviewViewMode === "interactive"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Interactive Only
                  </button>
                  <button
                    onClick={() => setOverviewViewMode("xgboost_png")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                      overviewViewMode === "xgboost_png"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Direct XGBoost Plot (PNG)
                  </button>
                  <button
                    onClick={() => setOverviewViewMode("shap_png")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                      overviewViewMode === "shap_png"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Direct SHAP Plot (PNG)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pr-2 text-xs">
                <a
                  href="/xgboost_importance.png"
                  download="xgboost_importance.png"
                  className="flex items-center gap-1 text-slate-400 hover:text-white font-medium transition-colors"
                  title="Download Native XGBoost Feature Importance PNG"
                >
                  <Download className="h-3.5 w-3.5" />
                  XGBoost PNG
                </a>
                <span className="text-slate-700">|</span>
                <a
                  href="/xgboost_shap_summary.png"
                  download="xgboost_shap_summary.png"
                  className="flex items-center gap-1 text-slate-400 hover:text-white font-medium transition-colors"
                  title="Download SHAP Summary Beeswarm PNG"
                >
                  <Download className="h-3.5 w-3.5" />
                  SHAP PNG
                </a>
              </div>
            </div>

            {/* SECTION 1: INTERACTIVE CHARTS (Shown in 'all' and 'interactive' modes) */}
            {(overviewViewMode === "all" || overviewViewMode === "interactive") && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
                {/* SHAP Feature Attribution */}
                <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-100 text-sm">SHAP Parameter Attribution (XGBoost)</h3>
                      <p className="text-xs text-slate-400">Ranked influence score on system outcome (Q1)</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="flex items-center gap-1 text-rose-400">
                        <span className="h-2 w-2 rounded bg-rose-500" /> Increases Risk
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="h-2 w-2 rounded bg-emerald-500" /> Decreases Risk
                      </span>
                      <button
                        onClick={() => setOverviewViewMode("xgboost_png")}
                        className="ml-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded transition-colors"
                        title="View direct PNG generated by XGBoost"
                      >
                        <ImageIcon className="h-3 w-3" />
                        Native PNG
                      </button>
                    </div>
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={dashboardData.shap_metrics}
                        margin={{ top: 10, right: 20, left: 70, bottom: 5 }}
                      >
                        <XAxis
                          type="number"
                          stroke="#475569"
                          fontSize={11}
                          tickLine={false}
                          domain={[0, "auto"]}
                        />
                        <YAxis
                          type="category"
                          dataKey="Feature"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={90}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                          wrapperStyle={{ outline: "none", zIndex: 100 }}
                          contentStyle={{
                            backgroundColor: "#0b1120",
                            borderColor: "#334155",
                            color: "#f8fafc",
                          }}
                          itemStyle={{ color: "#f8fafc" }}
                          content={<CustomShapTooltip />}
                        />
                        <Bar dataKey="Importance_Score" radius={[0, 4, 4, 0]}>
                          {dashboardData.shap_metrics.map((entry, index) => {
                            const isRisk = entry.Impact_Direction.includes("Increases");
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={isRisk ? "#f87171" : "#10b981"}
                                fillOpacity={0.85}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* PPA Pareto Optimization Map */}
                <div className="bg-[#0b1120] border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-100 text-sm">PPA Pareto Optimization Map (Q2)</h3>
                      <p className="text-xs text-slate-400">Execution Latency vs Peak Memory Tradeoff</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Pareto Optimal
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-slate-600" /> Non-Optimal Run
                      </span>
                    </div>
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                        <XAxis
                          type="number"
                          dataKey="Execution_Time_sec"
                          name="Execution Time"
                          unit="s"
                          stroke="#475569"
                          fontSize={11}
                          label={{ value: "Execution Time (s)", position: "insideBottom", offset: -10, fill: "#64748b", fontSize: 11 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="Peak_Memory_GB"
                          name="Peak Memory"
                          unit="GB"
                          stroke="#475569"
                          fontSize={11}
                          label={{ value: "Peak Memory (GB)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
                        />
                        <ZAxis range={[25, 25]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3", stroke: "#64748b" }}
                          wrapperStyle={{ outline: "none", zIndex: 100 }}
                          contentStyle={{
                            backgroundColor: "#0b1120",
                            borderColor: "#334155",
                            color: "#f8fafc",
                          }}
                          itemStyle={{ color: "#f8fafc" }}
                          content={<CustomParetoTooltip />}
                        />
                        <Scatter
                          name="Executions"
                          data={dashboardData.pareto_front}
                        >
                          {dashboardData.pareto_front.map((entry, index) => (
                            <Cell
                              key={`scatter-cell-${index}`}
                              fill={entry.Is_Pareto ? "#10b981" : "#334155"}
                              fillOpacity={entry.Is_Pareto ? 1 : 0.4}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: DIRECT NATIVE PLOTS GENERATED BY XGBOOST & SHAP (Directly visible in 'all' mode) */}
            {overviewViewMode === "all" && (
              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 shadow-md flex flex-col gap-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                      Direct Native Plots Generated by Machine Learning Engine (XGBoost & SHAP PNGs)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Exported directly from the trained gradient boosted ensemble across 10,000 runs using <code className="text-indigo-300 bg-black/40 px-1 py-0.5 rounded font-mono">xgb.plot_importance</code> and <code className="text-indigo-300 bg-black/40 px-1 py-0.5 rounded font-mono">shap.summary_plot</code>
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" /> Live Model Artifacts
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Card 1: XGBoost Native Importance */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-indigo-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Direct XGBoost Feature Importance (<code className="text-indigo-300 font-mono text-[11px]">F-Score</code>)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setLightboxImage({
                            src: "/xgboost_importance.png",
                            title: "Direct XGBoost Feature Importance Plot",
                            desc: "Exported directly from xgb.plot_importance across all trained decision tree splits."
                          })}
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Zoom In / Fullscreen"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href="/xgboost_importance.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Open Full Resolution in New Tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href="/xgboost_importance.png"
                          download="xgboost_importance.png"
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Download PNG"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>

                    <div
                      onClick={() => setLightboxImage({
                        src: "/xgboost_importance.png",
                        title: "Direct XGBoost Feature Importance Plot",
                        desc: "Exported directly from xgb.plot_importance across all trained decision tree splits."
                      })}
                      className="cursor-pointer relative rounded-lg overflow-hidden border border-slate-800/80 bg-black/60 p-2 flex items-center justify-center group-hover:border-indigo-500/30 transition-all"
                    >
                      <img
                        src="/xgboost_importance.png"
                        alt="Direct XGBoost Feature Importance Plot"
                        className="max-h-[320px] w-full object-contain rounded transition-transform group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-mono text-white pointer-events-none backdrop-blur-[1px]">
                        <ZoomIn className="h-4 w-4" /> Click to Expand Full Resolution
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed font-sans">
                      <strong className="text-slate-200">Native F-Score:</strong> Measures how many times a feature is split upon in the boosted trees. <code className="text-rose-300 font-mono">Feature_Flag_X</code> and <code className="text-rose-300 font-mono">Random_Seed_Group</code> dominate decision paths.
                    </div>
                  </div>

                  {/* Card 2: SHAP Beeswarm Summary */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Direct SHAP Beeswarm Summary (<code className="text-indigo-300 font-mono text-[11px]">shap.summary_plot</code>)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setLightboxImage({
                            src: "/xgboost_shap_summary.png",
                            title: "Direct SHAP Beeswarm Summary Plot",
                            desc: "Exported directly from shap.summary_plot showing exact value impact distribution per run."
                          })}
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Zoom In / Fullscreen"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href="/xgboost_shap_summary.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Open Full Resolution in New Tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href="/xgboost_shap_summary.png"
                          download="xgboost_shap_summary.png"
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                          title="Download PNG"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>

                    <div
                      onClick={() => setLightboxImage({
                        src: "/xgboost_shap_summary.png",
                        title: "Direct SHAP Beeswarm Summary Plot",
                        desc: "Exported directly from shap.summary_plot showing exact value impact distribution per run."
                      })}
                      className="cursor-pointer relative rounded-lg overflow-hidden border border-slate-800/80 bg-black/60 p-2 flex items-center justify-center group-hover:border-emerald-500/30 transition-all"
                    >
                      <img
                        src="/xgboost_shap_summary.png"
                        alt="Direct SHAP Beeswarm Summary Plot"
                        className="max-h-[320px] w-full object-contain rounded transition-transform group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-mono text-white pointer-events-none backdrop-blur-[1px]">
                        <ZoomIn className="h-4 w-4" /> Click to Expand Full Resolution
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed font-sans">
                      <strong className="text-slate-200">SHAP Distribution:</strong> Each dot is one execution. Red dots represent high parameter values; rightward shift indicates increased failure probability log-odds.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: DIRECT XGBOOST PLOT FULL WIDTH (When 'xgboost_png' selected) */}
            {overviewViewMode === "xgboost_png" && (
              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 shadow-md flex flex-col gap-4 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                      Direct Native Plot Generated by XGBoost (<code className="text-indigo-300 bg-black/40 px-1 py-0.5 rounded font-mono">xgb.plot_importance</code>)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Exported directly from the trained gradient boosted decision trees across 10,000 execution runs
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      onClick={() => setLightboxImage({
                        src: "/xgboost_importance.png",
                        title: "Direct XGBoost Feature Importance Plot",
                        desc: "Exported directly from xgb.plot_importance across all trained decision tree splits."
                      })}
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      <ZoomIn className="h-3.5 w-3.5" /> Fullscreen
                    </button>
                    <span className="text-slate-700">|</span>
                    <a
                      href="/xgboost_importance.png"
                      download="xgboost_importance.png"
                      className="flex items-center gap-1 text-slate-300 hover:text-white font-medium"
                    >
                      <Download className="h-3.5 w-3.5" /> Download PNG
                    </a>
                  </div>
                </div>
                <div
                  onClick={() => setLightboxImage({
                    src: "/xgboost_importance.png",
                    title: "Direct XGBoost Feature Importance Plot",
                    desc: "Exported directly from xgb.plot_importance across all trained decision tree splits."
                  })}
                  className="cursor-pointer rounded-xl overflow-hidden border border-slate-800 bg-black/50 p-4 flex items-center justify-center hover:border-slate-700 transition-colors"
                >
                  <img
                    src="/xgboost_importance.png"
                    alt="Direct XGBoost Feature Importance Plot"
                    className="max-h-[550px] w-auto rounded-lg shadow-xl object-contain border border-slate-800/80"
                  />
                </div>
                <div className="text-xs text-slate-300 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-white">XGBoost Native F-Score Attribution:</strong> The F-score metric reflects the frequency with which a feature was chosen to split decision tree leaves. Notice that <code className="text-rose-300 bg-black/40 px-1 py-0.5 rounded font-mono">Feature_Flag_X</code> and <code className="text-rose-300 bg-black/40 px-1 py-0.5 rounded font-mono">Random_Seed_Group</code> dominate tree decision splits across the ensemble.
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: DIRECT SHAP SUMMARY BEESWARM FULL WIDTH (When 'shap_png' selected) */}
            {overviewViewMode === "shap_png" && (
              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 shadow-md flex flex-col gap-4 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      Direct SHAP Beeswarm Summary Plot (<code className="text-indigo-300 bg-black/40 px-1 py-0.5 rounded font-mono">shap.summary_plot</code>)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Exported directly from SHAP TreeExplainer showing exact value impact distribution per run
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      onClick={() => setLightboxImage({
                        src: "/xgboost_shap_summary.png",
                        title: "Direct SHAP Beeswarm Summary Plot",
                        desc: "Exported directly from shap.summary_plot showing exact value impact distribution per run."
                      })}
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      <ZoomIn className="h-3.5 w-3.5" /> Fullscreen
                    </button>
                    <span className="text-slate-700">|</span>
                    <a
                      href="/xgboost_shap_summary.png"
                      download="xgboost_shap_summary.png"
                      className="flex items-center gap-1 text-slate-300 hover:text-white font-medium"
                    >
                      <Download className="h-3.5 w-3.5" /> Download PNG
                    </a>
                  </div>
                </div>
                <div
                  onClick={() => setLightboxImage({
                    src: "/xgboost_shap_summary.png",
                    title: "Direct SHAP Beeswarm Summary Plot",
                    desc: "Exported directly from shap.summary_plot showing exact value impact distribution per run."
                  })}
                  className="cursor-pointer rounded-xl overflow-hidden border border-slate-800 bg-black/50 p-4 flex items-center justify-center hover:border-slate-700 transition-colors"
                >
                  <img
                    src="/xgboost_shap_summary.png"
                    alt="Direct SHAP Beeswarm Summary Plot"
                    className="max-h-[550px] w-auto rounded-lg shadow-xl object-contain border border-slate-800/80"
                  />
                </div>
                <div className="text-xs text-slate-300 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-white">SHAP Value Distribution:</strong> Each dot corresponds to an individual execution. Red represents high parameter values (e.g. Feature Flag X enabled), while blue represents low values. A rightward displacement demonstrates positive contribution to failure log-odds.
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Insight Summary Card */}
            <div className="bg-gradient-to-r from-indigo-950/30 via-slate-900/40 to-slate-900/20 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-4">
              <Sparkles className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" />
              <div className="text-xs leading-relaxed text-slate-300">
                <strong className="text-indigo-300 font-semibold">Autonomous Insight:</strong> Combining{" "}
                <code className="bg-black/40 text-emerald-300 px-1 py-0.5 rounded">Adaptive Cache Policy</code> with{" "}
                <code className="bg-black/40 text-emerald-300 px-1 py-0.5 rounded">Dynamic Scheduler</code> achieves the highest Pareto efficiency (22% faster execution, 22% higher throughput). Conversely,{" "}
                <code className="bg-black/40 text-rose-300 px-1 py-0.5 rounded">Feature_Flag_X</code> is identified as the #1 failure driver, participating in ~78% of fatal terminations.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRACE & LOG EXPLORER */}
        {activeTab === "explorer" && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0b1120] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Run ID, Config, Error code..."
                    value={runsSearch}
                    onChange={(e) => {
                      setRunsSearch(e.target.value);
                      fetchRuns(0, runsStatusFilter, e.target.value);
                    }}
                    className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-900 border border-slate-750 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
                  {["ALL", "PASS", "FAIL"].map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setRunsStatusFilter(st);
                        setRunsPage(0);
                        fetchRuns(0, st, runsSearch);
                      }}
                      className={`px-3 py-1 rounded-md font-medium transition-all ${
                        runsStatusFilter === st
                          ? st === "FAIL"
                            ? "bg-rose-600 text-white"
                            : st === "PASS"
                            ? "bg-emerald-600 text-white"
                            : "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Matched: <strong>{totalRunsCount.toLocaleString()}</strong> runs</span>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    disabled={runsPage === 0}
                    onClick={() => {
                      const nextP = runsPage - 1;
                      setRunsPage(nextP);
                      fetchRuns(nextP, runsStatusFilter, runsSearch);
                    }}
                    className="p-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 font-mono text-slate-300">Page {runsPage + 1}</span>
                  <button
                    disabled={(runsPage + 1) * 15 >= totalRunsCount}
                    onClick={() => {
                      const nextP = runsPage + 1;
                      setRunsPage(nextP);
                      fetchRuns(nextP, runsStatusFilter, runsSearch);
                    }}
                    className="p-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Split View: Telemetry Table + Live Trace Console */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Runs Table */}
              <div className="lg:col-span-7 bg-[#0b1120] border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col">
                <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Execution Telemetry Records
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">Click row to stream trace</span>
                </div>
                <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Run ID</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Latency</th>
                        <th className="py-2.5 px-3">Memory</th>
                        <th className="py-2.5 px-3">Workload</th>
                        <th className="py-2.5 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {runs.map((r) => {
                        const isSelected = r.Run_ID === selectedRunId;
                        return (
                          <tr
                            key={r.Run_ID}
                            onClick={() => inspectRun(r.Run_ID)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-950/40 border-l-2 border-indigo-500 text-white"
                                : "hover:bg-slate-800/40 text-slate-300"
                            }`}
                          >
                            <td className="py-2.5 px-3 font-semibold text-slate-200">{r.Run_ID}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.Status === "FAIL"
                                    ? "bg-rose-500/15 border border-rose-500/30 text-rose-400"
                                    : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                                }`}
                              >
                                {r.Status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">{r.Execution_Time_sec}s</td>
                            <td className="py-2.5 px-3">{r.Peak_Memory_GB} GB</td>
                            <td className="py-2.5 px-3 text-slate-400 font-sans">{r.Workload_Type}</td>
                            <td className="py-2.5 px-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inspectRun(r.Run_ID);
                                }}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-sans transition-colors"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {runs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                            No telemetry runs matched your filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live Trace Viewer Console */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 shadow-md flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs font-semibold text-slate-200">
                        Live Trace Stream: <span className="font-mono text-indigo-400">{selectedRunId || "None"}</span>
                      </span>
                    </div>
                    {selectedRunDetails && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {String(selectedRunDetails.Config_ID || "")} | {String(selectedRunDetails.Cache_Policy || "")}
                      </span>
                    )}
                  </div>

                  {traceLoading ? (
                    <div className="h-[420px] flex items-center justify-center text-xs text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin text-indigo-400 mr-2" />
                      Streaming execution logs...
                    </div>
                  ) : (
                    <div className="oo-console">
                      {selectedRunTrace.map((e, idx) => {
                        const lvl = e.level || "INFO";
                        const isFatal = lvl === "FATAL";
                        const isWarn = lvl === "WARN";
                        return (
                          <div key={idx} className={isFatal ? "highlight" : "py-0.5"}>
                            <span className="timestamp">[{e.timestamp || "00:00:00.000"}]</span>
                            <span className={isFatal ? "fatal" : isWarn ? "warn" : "info"}>
                              {lvl}
                            </span>
                            : <span>{e.msg}</span>
                          </div>
                        );
                      })}
                      {selectedRunTrace.length === 0 && (
                        <div className="text-slate-500 italic">No trace events recorded for this execution.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ROOT CAUSE DIFFS */}
        {activeTab === "diff" && dashboardData && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Diff Selectors */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">Execution Divergence Analytics (Q6)</h3>
                  <p className="text-xs text-slate-400">Compare parameters and execution logs between passing and failing executions</p>
                </div>
                <button
                  onClick={handleComputeDiff}
                  disabled={diffLoading}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${diffLoading ? "animate-spin" : ""}`} />
                  Compute Divergence
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-emerald-400 mb-1.5 block">
                    Baseline (Passing Run)
                  </label>
                  <select
                    value={diffPassId}
                    onChange={(e) => setDiffPassId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {dashboardData.pass_runs.map((id) => (
                      <option key={id} value={id}>
                        {id} (PASS)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-rose-400 mb-1.5 block">
                    Target (Failing Run)
                  </label>
                  <select
                    value={diffFailId}
                    onChange={(e) => setDiffFailId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {dashboardData.fail_runs.map((id) => (
                      <option key={id} value={id}>
                        {id} (FAIL)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Parameter Divergence Table */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-xl overflow-hidden shadow-md">
              <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Configuration Parameter Divergence Table
                </span>
                <span className="text-[11px] text-rose-400 font-mono">
                  {diffParams.filter((p) => p.State === "MISMATCH").length} mismatches identified
                </span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Parameter</th>
                    <th className="py-2.5 px-4 text-emerald-400">PASS Baseline ({diffPassId})</th>
                    <th className="py-2.5 px-4 text-rose-400">FAIL Target ({diffFailId})</th>
                    <th className="py-2.5 px-4">Divergence State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {diffParams.map((p, idx) => {
                    const isMismatch = p.State === "MISMATCH";
                    return (
                      <tr
                        key={idx}
                        className={
                          isMismatch
                            ? "bg-rose-950/20 text-rose-200 font-semibold"
                            : "text-slate-300 hover:bg-slate-900/30"
                        }
                      >
                        <td className="py-2.5 px-4 text-slate-100">{p.Parameter}</td>
                        <td className="py-2.5 px-4 text-emerald-300">{p.PASS_Baseline}</td>
                        <td className="py-2.5 px-4 text-rose-300">{p.FAIL_Target}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isMismatch
                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-400"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {p.State}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {diffParams.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500 font-sans">
                        Select a passing and failing run above and click Compute Divergence.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Side by Side Trace Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 shadow-md flex flex-col gap-2">
                <span className="text-xs font-mono text-emerald-400 font-semibold pb-1 border-b border-slate-800">
                  TRACE STREAM: {diffPassId} (PASS)
                </span>
                <div className="oo-console h-64">
                  {diffLogPass.map((e, idx) => (
                    <div key={idx} className="py-0.5">
                      <span className="timestamp">[{e.timestamp}]</span>
                      <span className="info">{e.level}</span>: <span>{e.msg}</span>
                    </div>
                  ))}
                  {diffLogPass.length === 0 && <div className="text-slate-500 italic">No trace recorded.</div>}
                </div>
              </div>

              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 shadow-md flex flex-col gap-2">
                <span className="text-xs font-mono text-rose-400 font-semibold pb-1 border-b border-slate-800">
                  TRACE STREAM: {diffFailId} (FAIL)
                </span>
                <div className="oo-console h-64">
                  {diffLogFail.map((e, idx) => {
                    const isFatal = e.level === "FATAL";
                    return (
                      <div key={idx} className={isFatal ? "highlight" : "py-0.5"}>
                        <span className="timestamp">[{e.timestamp}]</span>
                        <span className={isFatal ? "fatal" : e.level === "WARN" ? "warn" : "info"}>
                          {e.level}
                        </span>
                        : <span>{e.msg}</span>
                      </div>
                    );
                  })}
                  {diffLogFail.length === 0 && <div className="text-slate-500 italic">No trace recorded.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AI COPILOT */}
        {activeTab === "copilot" && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Copilot Config Header */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                    <Bot className="h-4 w-4 text-indigo-400" />
                    Dual-Engine Diagnostic Assistant
                  </h3>
                  <p className="text-xs text-slate-400">
                    Query telemetry using Native XGBoost SHAP logic or Google Gemini GenAI
                  </p>
                </div>

                {/* Mode Selector */}
                <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setCopilotMode("Native")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                      copilotMode === "Native"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Native XGBoost SHAP
                  </button>
                  <button
                    onClick={() => setCopilotMode("Gemini")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                      copilotMode === "Gemini"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Google Gemini GenAI
                  </button>
                </div>
              </div>

              {/* Gemini Key Input (Optional if mode is Gemini) */}
              {copilotMode === "Gemini" && (
                <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                  <Key className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="password"
                    placeholder="Enter Gemini API Key (optional - defaults to server GEMINI_API_KEY)"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 w-full focus:outline-none placeholder-slate-500 font-mono"
                  />
                </div>
              )}

              {/* Executive Summary Button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">
                  Generate comprehensive 3-section AI engineering summary
                </span>
                <button
                  onClick={handleGenerateSummary}
                  disabled={summaryLoading}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-md shadow-indigo-600/30"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${summaryLoading ? "animate-spin" : ""}`} />
                  {summaryLoading ? "Generating Analysis..." : "Generate Executive Summary"}
                </button>
              </div>
            </div>

            {/* Generated Summary Card */}
            {copilotSummary && (
              <div className="bg-[#0b1120] border border-indigo-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                    <Sparkles className="h-4 w-4" />
                    Executive Verification Summary
                  </div>
                  <button
                    onClick={() => setCopilotSummary(null)}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed">
                  <ReactMarkdown>{copilotSummary}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Natural Language Query Box */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-md flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-300">Natural Language Verification Query</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="e.g. Determine the risk vector of Feature Flag X, or evaluate Memory_Alloc_64GB"
                      value={copilotQuery}
                      onChange={(e) => setCopilotQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleExecuteCopilotQuery()}
                      className="w-full bg-slate-900 border border-slate-750 rounded-lg px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => handleExecuteCopilotQuery()}
                    disabled={copilotLoading}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/30 disabled:opacity-50"
                  >
                    <Send className={`h-3.5 w-3.5 ${copilotLoading ? "animate-spin" : ""}`} />
                    Query
                  </button>
                </div>
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="text-[11px] font-mono text-slate-500">Suggested:</span>
                {[
                  "Feature_Flag_X",
                  "Random_Seed_Group",
                  "Workload_Type_Write-Heavy",
                  "Memory_Alloc_64GB",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setCopilotQuery(prompt);
                      handleExecuteCopilotQuery(prompt);
                    }}
                    className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-indigo-300 text-[11px] font-mono transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Copilot Response Display */}
              {copilotResponse && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 mt-2">
                  <div className="text-xs font-semibold text-indigo-400 mb-2 flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    Response from {copilotMode === "Native" ? "Native SHAP Engine" : "Gemini GenAI"}
                  </div>
                  <div className="prose prose-invert prose-xs max-w-none text-slate-200">
                    <ReactMarkdown>{copilotResponse}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* DATA INGESTION MODAL */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Ingest Telemetry Stream</h3>
              </div>
              <button
                onClick={() => setShowIngestModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleIngestSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Telemetry CSV File <span className="text-rose-400">*</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setCsvFile(e.target.files?.[0] || null)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Trace Log JSONL File <span className="text-slate-500">(Optional)</span>
                </label>
                <input
                  type="file"
                  accept=".jsonl,.txt"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setJsonlFile(e.target.files?.[0] || null)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                />
              </div>

              {ingestSuccessMsg && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs p-2.5 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {ingestSuccessMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ingestLoading || !csvFile}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {ingestLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {ingestLoading ? "Ingesting..." : "Upload & Sync"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL-RESOLUTION PLOT LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0b1120] border border-slate-700/80 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-scaleUp"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <ImageIcon className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">{lightboxImage.title}</h3>
                  <p className="text-xs text-slate-400">{lightboxImage.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={lightboxImage.src}
                  download={lightboxImage.src.replace("/", "")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/30"
                >
                  <Download className="h-3.5 w-3.5" /> Download High-Res
                </a>
                <button
                  onClick={() => setLightboxImage(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 flex items-center justify-center bg-black/70 overflow-auto max-h-[75vh]">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="max-h-[68vh] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
