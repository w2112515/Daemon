import type { FC } from "react";
import { cn } from "@/lib/utils";
import { AgentStatus } from "@/types";

interface StatusBadgeProps {
    status: AgentStatus['status'] | 'error' | 'stale';
    className?: string;
}

const statusConfig = {
    online: { color: "bg-green-500", ping: "bg-green-400", label: "Online" },
    stale: { color: "bg-yellow-500", ping: null, label: "Stale" },
    warning: { color: "bg-yellow-500", ping: null, label: "Warning" },
    offline: { color: "bg-gray-500", ping: null, label: "Offline" },
    error: { color: "bg-red-500", ping: "bg-red-500", label: "Error" },
};

export const StatusBadge: FC<StatusBadgeProps> = ({ status, className }) => {
    // Map 'warning' to 'stale' visual if needed, or keep separate. 
    // Spec uses 'stale' but AgentStatus has 'warning'. default mapping warning -> warning
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.offline;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <span className="relative flex h-2.5 w-2.5">
                {(config.ping) && (
                    <span className={cn(
                        "absolute inline-flex h-full w-full rounded-full opacity-75",
                        status === 'error' ? 'animate-ping duration-75' : 'animate-ping',
                        config.ping
                    )} />
                )}
                <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", config.color)} />
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                {config.label}
            </span>
        </div>
    );
};
