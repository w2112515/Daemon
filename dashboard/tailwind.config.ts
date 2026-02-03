import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#0A0A0B",
                card: "#141417",
                primary: "#F7931A", // Bitcoin Orange
                secondary: "#CCFF00", // Acid Lime
                muted: "#6B7280", // Technical Gray
                border: "#27272A", // Microlines
            },
            fontFamily: {
                mono: ["var(--font-jetbrains-mono)"],
                sans: ["var(--font-inter)"],
            },
            borderRadius: {
                lg: "0",
                md: "0",
                sm: "2px",
            },
        },
    },
    plugins: [],
};
export default config;
