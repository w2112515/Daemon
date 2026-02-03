export interface AgentStatus {
    agent_id: string;
    alias?: string;
    status: 'online' | 'offline' | 'warning';
    last_seen: string;
    total_payments: number;
    total_spent_sats: number;
    hourly_budget_used: number;
    hourly_budget_limit: number;
    error_count: number;
}

export interface TelemetryStats {
    total_events: number;
    event_counts: Record<string, number>;
    unique_agents: number;
    storage_usage: string;
}
