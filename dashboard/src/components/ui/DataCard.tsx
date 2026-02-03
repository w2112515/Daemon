import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DataCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    variant?: "default" | "error";
    className?: string;
    children?: ReactNode;
    highlight?: boolean; // Compatible with old prop name if needed, or mapped to variant
}

export const DataCard: FC<DataCardProps> = ({
    title,
    value,
    subValue,
    variant = "default",
    highlight,
    className,
    children
}) => {
    const finalVariant = highlight ? "error" : variant;

    return (
        <div className={cn(
            "border rounded-sm p-4 flex flex-col gap-1 transition-colors",
            finalVariant === "error"
                ? "border-red-500/50 bg-red-500/10"
                : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50",
            className
        )}>
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{title}</h3>
            <div className={cn("text-2xl font-mono text-zinc-100 mt-1", finalVariant === 'error' && "text-red-400")}>{value}</div>
            {subValue && (
                <span className="text-xs text-zinc-500 font-mono">{subValue}</span>
            )}
            {children}
        </div>
    );
};
