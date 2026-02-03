/**
 * useWalletAuth - WebLN 钱包连接 Hook
 * 
 * 来源: Vol.2 S-UI-09
 * 用途: Fleet Observer Dashboard 钱包身份验证
 * DoD: D-UI-05 (Alby 连接成功，显示 Pubkey 前 8 位)
 */

import { useState, useEffect, useCallback } from 'react';

// WebLN 类型定义
interface WebLNProvider {
    enable: () => Promise<void>;
    getInfo: () => Promise<{ node: { pubkey: string; alias?: string } }>;
    makeInvoice: (args: { amount: number; memo?: string }) => Promise<{ paymentRequest: string }>;
    sendPayment: (paymentRequest: string) => Promise<{ preimage: string }>;
}

interface WalletState {
    isConnected: boolean;
    isConnecting: boolean;
    pubkey: string | null;
    alias: string | null;
    error: string | null;
}

interface UseWalletAuthReturn extends WalletState {
    connect: () => Promise<void>;
    disconnect: () => void;
    shortPubkey: string | null;
    provider: WebLNProvider | null;
}

declare global {
    interface Window {
        webln?: WebLNProvider;
    }
}

const STORAGE_KEY = 'daemon_wallet_auth';

/**
 * WebLN 钱包连接 Hook
 * 支持 Alby、Zeus 等 WebLN 兼容钱包
 */
export function useWalletAuth(): UseWalletAuthReturn {
    const [state, setState] = useState<WalletState>({
        isConnected: false,
        isConnecting: false,
        pubkey: null,
        alias: null,
        error: null,
    });
    const [provider, setProvider] = useState<WebLNProvider | null>(null);

    // 自动重连 (从 localStorage 恢复)
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.pubkey && window.webln) {
                    // 尝试自动重连
                    connectWallet();
                }
            } catch {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 检测 WebLN 可用性
    useEffect(() => {
        const checkWebLN = () => {
            if (typeof window !== 'undefined' && window.webln) {
                setProvider(window.webln);
            }
        };

        // 立即检查
        checkWebLN();

        // 监听 webln:enabled 事件 (部分钱包异步注入)
        window.addEventListener('webln:enabled', checkWebLN);

        return () => {
            window.removeEventListener('webln:enabled', checkWebLN);
        };
    }, []);

    const connectWallet = useCallback(async () => {
        if (!window.webln) {
            setState((prev: WalletState) => ({
                ...prev,
                error: 'WebLN 钱包未检测到。请安装 Alby 或其他 WebLN 兼容钱包。',
            }));
            return;
        }

        setState((prev: WalletState) => ({ ...prev, isConnecting: true, error: null }));

        try {
            // 请求钱包授权
            await window.webln.enable();

            // 获取节点信息
            const info = await window.webln.getInfo();
            const pubkey = info.node.pubkey;
            const alias = info.node.alias || null;

            // 更新状态
            setState({
                isConnected: true,
                isConnecting: false,
                pubkey,
                alias,
                error: null,
            });

            setProvider(window.webln);

            // 持久化连接状态
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ pubkey, alias }));

            console.log('[WalletAuth] Connected:', pubkey.slice(0, 8));
        } catch (err) {
            const message = err instanceof Error ? err.message : '连接钱包失败';
            setState((prev: WalletState) => ({
                ...prev,
                isConnecting: false,
                error: message,
            }));
            console.error('[WalletAuth] Connection failed:', err);
        }
    }, []);

    const disconnect = useCallback(() => {
        setState({
            isConnected: false,
            isConnecting: false,
            pubkey: null,
            alias: null,
            error: null,
        });
        setProvider(null);
        localStorage.removeItem(STORAGE_KEY);
        console.log('[WalletAuth] Disconnected');
    }, []);

    // 计算短 pubkey (前 8 位)
    const shortPubkey = state.pubkey ? state.pubkey.slice(0, 8) : null;

    return {
        ...state,
        connect: connectWallet,
        disconnect,
        shortPubkey,
        provider,
    };
}

export default useWalletAuth;
