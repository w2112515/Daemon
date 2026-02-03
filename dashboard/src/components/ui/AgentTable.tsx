import type { FC } from "react";
import { AgentStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { formatLastSeen, formatSats } from "@/lib/format";

interface AgentTableProps {
    agents: AgentStatus[];
    isLoading?: boolean;
    onAgentClick?: (agent: AgentStatus) => void;
}

const BudgetBar: FC<{ used: number; limit: number }> = ({ used, limit }) => {
    const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const isWarning = percent > 80;

    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden">
                <div
                    className={cn(
                        "h-full transition-all duration-300",
                        isWarning ? "bg-primary" : "bg-green-500"
                    )}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <span className={cn("text-xs font-mono", isWarning ? "text-primary" : "text-zinc-500")}>
                {percent.toFixed(0)}%
            </span>
        </div>
    );
};

export const AgentTable: FC<AgentTableProps> = ({ agents, isLoading, onAgentClick }) => {
    return (
        <div className="bg-card border border-border rounded-sm overflow-hidden">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-zinc-900 border-b border-border">
                        {["Status", "Agent", "Last Seen", "Payments", "Spent", "Budget Used"].map((head) => (
                            <th key={head} className="text-left px-4 py-3 text-xs text-muted font-semibold uppercase tracking-wider">
                                {head}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {isLoading ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-muted">
                                Loading agents...
                            </td>
                        </tr>
                    ) : agents.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-muted">
                                No agents connected
                            </td>
                        </tr>
                    ) : (
                        agents.map((agent) => (
                            <tr
                                key={agent.agent_id}
                                onClick={() => onAgentClick?.(agent)}
                                className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                            >
                                <td className="px-4 py-3">
                                    <StatusBadge status={agent.status} />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-zinc-200">{agent.alias || agent.agent_id.slice(0, 12)}</div>
                                    <div className="text-xs text-muted font-mono">{agent.agent_id.slice(0, 16)}...</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-zinc-300 font-mono">
                                    {formatLastSeen(agent.last_seen)}
                                </td>
                                <td className="px-4 py-3 text-sm text-zinc-300 font-mono">
                                    {agent.total_payments}
                                </td>
                                <td className="px-4 py-3 text-sm text-zinc-300 font-mono">
                                    {formatSats(agent.total_spent_sats)}
                                </td>
                                <td className="px-4 py-3">
                                    <BudgetBar used={agent.hourly_budget_used} limit={agent.hourly_budget_limit} />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};
