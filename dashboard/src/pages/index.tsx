/**
 * Fleet Observer Dashboard - 主页面
 *
 * @trace Vol.UI §8, S-UI-07 | DoD: D-UI-04~07
 * @description Agent 舰队监控仪表板，显示所有连接 Agent 的实时状态
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { AgentStatus, TelemetryStats } from '../types';
import { StatusBadge } from '../components/ui/StatusBadge';
import { DataCard } from '../components/ui/DataCard';
import { AgentTable } from '../components/ui/AgentTable';
import { formatSats, formatLastSeen } from '../lib/format';
import { cn } from '../lib/utils';
import { Link as IconLink, Unplug as IconUnplug } from 'lucide-react';

// Agent Details Drawer (Internal Component for now, or move to S-UI-04 later)
const AgentDrawer: React.FC<{
    agent: AgentStatus | null;
    onClose: () => void;
}> = ({ agent, onClose }) => {
    if (!agent) return null;

    const budgetPercent = agent.hourly_budget_limit > 0
        ? Math.min(100, (agent.hourly_budget_used / agent.hourly_budget_limit) * 100)
        : 0;

    // Warning if > 80% used
    const isBudgetWarning = budgetPercent > 80;

    return (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-card border-l border-border shadow-2xl p-6 overflow-y-auto z-50">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-zinc-100">Agent Details</h2>
                <button
                    onClick={onClose}
                    className="text-muted hover:text-zinc-200 text-2xl leading-none"
                    aria-label="Close"
                >
                    ×
                </button>
            </div>

            <div className="flex items-center mb-4">
                <StatusBadge status={agent.status} />
                <span className="ml-2 text-lg font-medium text-zinc-100">
                    {agent.alias || agent.agent_id.slice(0, 8)}
                </span>
            </div>

            <div className="text-xs font-mono text-muted mb-6">
                ID: {agent.agent_id}
            </div>

            <div className="grid gap-4">
                <DataCard title="Last Seen" value={formatLastSeen(agent.last_seen)} />
                <DataCard title="Total Payments" value={agent.total_payments.toString()} />
                <DataCard title="Total Spent" value={formatSats(agent.total_spent_sats)} />
                <DataCard
                    title="Errors"
                    value={agent.error_count.toString()}
                    variant={agent.error_count > 0 ? 'error' : 'default'}
                />

                <div className="mt-2 bg-zinc-900/50 p-4 rounded-sm border border-zinc-800">
                    <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Hourly Budget</div>
                    <div className="h-2 bg-zinc-800 rounded-sm overflow-hidden mb-2">
                        <div
                            className={cn("h-full transition-all duration-300", isBudgetWarning ? "bg-primary" : "bg-green-500")}
                            style={{ width: `${budgetPercent}%` }}
                        />
                    </div>
                    <div className="text-xs text-zinc-200 font-mono text-right">
                        {formatSats(agent.hourly_budget_used)} / {formatSats(agent.hourly_budget_limit)}
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Connection Badge Component */
const ConnectionBadge: React.FC<{ status: 'connected' | 'disconnected' | 'error' }> = ({ status }) => {
    const config = {
        connected: { color: 'bg-green-500', label: 'Gateway Online', text: 'text-green-500' },
        disconnected: { color: 'bg-zinc-500', label: 'Disconnected', text: 'text-zinc-500' },
        error: { color: 'bg-red-500', label: 'Connection Error', text: 'text-red-500' },
    };
    const { color, label, text } = config[status];

    return (
        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900/50 rounded-full border border-zinc-800">
            <span className={cn("w-1.5 h-1.5 rounded-full", color, status === 'connected' && 'animate-pulse')} />
            <span className={cn("text-[10px] uppercase tracking-wider font-medium", text)}>
                {label}
            </span>
        </div>
    );
};

export default function FleetObserverPage(): JSX.Element {
    const { isConnected, shortPubkey, connect, disconnect, error: walletError } = useWalletAuth();
    const [agents, setAgents] = useState<AgentStatus[]>([]);
    const [stats, setStats] = useState<TelemetryStats | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
    const [circuitState, setCircuitState] = useState<'NORMAL' | 'READ_ONLY' | 'FROZEN'>('NORMAL');

    // API Base URL
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    /** Check Gateway Health */
    const checkHealth = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/telemetry/health`);
            if (res.ok) {
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('error');
            }
        } catch {
            setConnectionStatus('disconnected');
        }
    }, [API_BASE]);

    /** Load Circuit Breaker Status (Task-I-02) */
    const loadCircuitStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/circuit-status`);
            if (res.ok) {
                const data = await res.json();
                setCircuitState(data.state);
            }
        } catch (err) {
            console.error('[FleetObserver] Failed to load circuit status:', err);
        }
    }, [API_BASE]);

    /** Load Agents (Mock Data - Phase 0) */
    const loadAgents = useCallback(async () => {
        setLoading(true);
        try {
            // Phase 0: Mock Data
            const mockAgents: AgentStatus[] = [
                {
                    agent_id: 'agt_001_demo_alpha',
                    alias: 'Alpha Bot',
                    status: 'online',
                    last_seen: new Date().toISOString(),
                    total_payments: 42,
                    total_spent_sats: 125000,
                    hourly_budget_used: 15000,
                    hourly_budget_limit: 50000,
                    error_count: 0,
                },
                {
                    agent_id: 'agt_002_demo_beta',
                    alias: 'Beta Trader',
                    status: 'warning',
                    last_seen: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
                    total_payments: 18,
                    total_spent_sats: 45000,
                    hourly_budget_used: 42000,
                    hourly_budget_limit: 50000,
                    error_count: 2,
                },
                {
                    agent_id: 'agt_003_demo_gamma',
                    status: 'offline',
                    last_seen: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                    total_payments: 5,
                    total_spent_sats: 12000,
                    hourly_budget_used: 0,
                    hourly_budget_limit: 25000,
                    error_count: 0,
                },
            ];
            setAgents(mockAgents);
        } finally {
            setLoading(false);
        }
    }, []);

    /** Load Telemetry Stats */
    const loadStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/telemetry/stats`, {
                headers: {
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_TELEMETRY_SECRET || 'dev-secret-change-in-production'}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (err) {
            console.error('[FleetObserver] Failed to load stats:', err);
        }
    }, [API_BASE]);

    // Initial Load & Polling
    useEffect(() => {
        checkHealth();
        loadAgents();
        loadStats();
        loadCircuitStatus();

        // 30s Polling
        const interval = setInterval(() => {
            checkHealth();
            loadAgents();
            loadStats();
            loadCircuitStatus();
        }, 30000);

        return () => clearInterval(interval);
    }, [checkHealth, loadAgents, loadStats, loadCircuitStatus]);

    return (
        <div className="min-h-screen bg-background text-zinc-100 font-sans selection:bg-primary/20">
            {/* Header */}
            <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                        <span className="text-primary">⚡</span> Fleet Observer
                    </h1>
                    <ConnectionBadge status={connectionStatus} />
                    {circuitState !== 'NORMAL' && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-500 text-xs font-medium rounded-sm border border-red-500/30">
                            ⚠ Circuit: {circuitState}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {stats && (
                        <span className="text-xs text-muted font-mono hidden md:inline-block">
                            {stats.unique_agents} agents | {stats.total_events} events
                        </span>
                    )}

                    {isConnected ? (
                        <button
                            onClick={disconnect}
                            className="bg-zinc-800 hover:bg-zinc-700 text-green-400 border border-zinc-700 rounded-sm px-4 py-2 text-xs font-mono flex items-center gap-2 transition-colors"
                        >
                            <IconLink size={12} />
                            {shortPubkey}...
                        </button>
                    ) : (
                        <button
                            onClick={connect}
                            className="bg-primary hover:bg-primary/90 text-black border border-primary rounded-sm px-4 py-2 text-sm font-medium transition-colors shadow-[0_0_10px_rgba(247,147,26,0.3)]"
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
            </header>

            {walletError && (
                <div className="bg-red-500/10 border-b border-red-500/50 px-6 py-3 text-red-500 text-sm">
                    {walletError}
                </div>
            )}

            {/* Main Content */}
            <main className="p-6 max-w-7xl mx-auto space-y-8">
                {/* Metrics Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DataCard
                        title="Online Agents"
                        value={agents.filter(a => a.status === 'online').length.toString()}
                        subValue={`/ ${agents.length}`}
                    />
                    <DataCard
                        title="Total Payments"
                        value={agents.reduce((sum, a) => sum + a.total_payments, 0).toString()}
                    />
                    <DataCard
                        title="Total Spent"
                        value={formatSats(agents.reduce((sum, a) => sum + a.total_spent_sats, 0))}
                    />
                    <DataCard
                        title="Errors (24h)"
                        value={agents.reduce((sum, a) => sum + a.error_count, 0).toString()}
                        variant={agents.some(a => a.error_count > 0) ? "error" : "default"}
                    />
                </div>

                {/* Agent Table */}
                <div className="space-y-4">
                    <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
                        Active Agents
                        <span className="text-xs text-muted font-normal bg-zinc-900 px-2 py-0.5 rounded-full border border-border">
                            {agents.length}
                        </span>
                    </h2>
                    <AgentTable
                        agents={agents}
                        isLoading={loading}
                        onAgentClick={setSelectedAgent}
                    />
                </div>
            </main>

            {/* Agent Details Drawer & Overlay */}
            {selectedAgent && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                        onClick={() => setSelectedAgent(null)}
                    />
                    <AgentDrawer agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
                </>
            )}
        </div>
    );
}
