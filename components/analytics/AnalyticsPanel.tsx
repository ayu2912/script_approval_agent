"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface KPIs {
  pending: number;
  avgApprovalHours: number | null;
  chasersSent: number;
  approvalRate: number | null;
}

interface TimelineEntry {
  date: string;
  created: number;
  approved: number;
}

interface ScriptRow {
  id: string;
  title: string;
  clientName: string;
  status: string;
  qualityScore: number | null;
  sentAt: string | null;
  approvalTime: number | null;
  chasersSent: number;
}

interface ClientOption {
  id: string;
  name: string;
}

interface AnalyticsData {
  kpis: KPIs;
  statusDistribution: Record<string, number>;
  timeline: TimelineEntry[];
  scripts: ScriptRow[];
  clients: ClientOption[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#888888",
  pending_review: "#F97316",
  approved: "#22C55E",
  rejected: "#EF4444",
  overdue: "#F59E0B",
  changes_requested: "#FB923C",
  closed: "#666666",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  overdue: "Overdue",
  changes_requested: "Changes Requested",
  closed: "Closed",
};

const RANGE_OPTIONS = [
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
  { label: "All time", value: "all" },
];

type SortKey = keyof ScriptRow;
type SortDir = "asc" | "desc";

export default function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string>("");
  const [range, setRange] = useState<string>("30");
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sparklines, setSparklines] = useState<Record<string, { day: string; value: number }[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set("client_id", clientId);
      params.set("range", range);
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.ok) {
        const json: AnalyticsData = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/analytics/sparklines")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSparklines(d); });
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortedScripts(): ScriptRow[] {
    if (!data) return [];
    return [...data.scripts].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const aStr = String(av);
      const bStr = String(bv);
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  const donutData = data
    ? Object.entries(data.statusDistribution).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count,
        color: STATUS_COLORS[status] ?? "#888888",
      }))
    : [];

  function formatDate(iso: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function scoreColor(score: number | null): string {
    if (score == null) return "text-[var(--muted)]";
    if (score >= 8) return "text-emerald-400";
    if (score >= 5) return "text-amber-400";
    return "text-red-400";
  }

  function statusColor(status: string): string {
    return STATUS_COLORS[status] ?? "#888888";
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <p className="text-[13px] text-[var(--muted)]">Loading analytics...</p>
      </div>
    );
  }

  if (!data) return null;

  const { kpis } = data;

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Pending Review" value={kpis.pending} sparkline={sparklines.pending} />
        <KPICard
          label="Avg Approval Time"
          value={kpis.avgApprovalHours != null ? `${kpis.avgApprovalHours}h` : "-"}
          sparkline={sparklines.approvalHours}
        />
        <KPICard label="Chasers Sent" value={kpis.chasersSent} sparkline={sparklines.chasers} />
        <KPICard
          label="Approval Rate"
          value={kpis.approvalRate != null ? `${kpis.approvalRate}%` : "-"}
          sparkline={sparklines.approvals}
        />
      </div>

      <div className="flex items-center gap-4">
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="h-8 px-3 text-[13px] rounded-lg bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] outline-none"
        >
          <option value="">All clients</option>
          {data.clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`h-8 px-3 text-[13px] rounded-lg border transition-colors ${
                range === opt.value
                  ? "bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]"
                  : "bg-[var(--input-bg)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading && (
          <span className="text-[11px] text-[var(--muted)]">Updating...</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-3">
            Scripts Over Time
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                }}
              />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) =>
                  new Date(String(v)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="created" stroke="#F97316" strokeWidth={2} dot={false} name="Created" />
              <Line type="monotone" dataKey="approved" stroke="#38BDF8" strokeWidth={2} dot={false} name="Approved" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-3">
            Status Distribution
          </p>
          {donutData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-[11px] text-[var(--muted)]">
                      {d.name} ({d.value})
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[var(--muted)] text-center mt-16">No data</p>
          )}
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--muted)]">
                <Th onClick={() => handleSort("title")}>Title{sortIndicator("title")}</Th>
                <Th onClick={() => handleSort("clientName")}>Client{sortIndicator("clientName")}</Th>
                <Th onClick={() => handleSort("status")}>Status{sortIndicator("status")}</Th>
                <Th onClick={() => handleSort("qualityScore")}>Quality{sortIndicator("qualityScore")}</Th>
                <Th onClick={() => handleSort("sentAt")}>Sent{sortIndicator("sentAt")}</Th>
                <Th onClick={() => handleSort("approvalTime")}>Approval Time{sortIndicator("approvalTime")}</Th>
                <Th onClick={() => handleSort("chasersSent")}>Chasers{sortIndicator("chasersSent")}</Th>
              </tr>
            </thead>
            <tbody>
              {sortedScripts().map(s => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <td className="px-4 py-2.5 text-[var(--text)] font-medium truncate max-w-[200px]">
                    {s.title}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">{s.clientName}</td>
                  <td className="px-4 py-2.5">
                    <span style={{ color: statusColor(s.status) }} className="text-[13px]">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 ${scoreColor(s.qualityScore)}`}>
                    {s.qualityScore != null ? s.qualityScore.toFixed(1) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">{formatDate(s.sentAt)}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">
                    {s.approvalTime != null ? `${s.approvalTime}h` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">{s.chasersSent}</td>
                </tr>
              ))}
              {data.scripts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                    No scripts found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, sparkline }: { label: string; value: string | number; sparkline?: { day: string; value: number }[] }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="text-[28px] font-semibold text-[var(--text)] mt-1">{value}</p>
      {sparkline && sparkline.length > 0 && (
        <ResponsiveContainer width="100%" height={32}>
          <LineChart data={sparkline}>
            <Line type="monotone" dataKey="value" stroke="var(--muted)" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-left cursor-pointer select-none hover:text-[var(--text)] transition-colors"
    >
      {children}
    </th>
  );
}
