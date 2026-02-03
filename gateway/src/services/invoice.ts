/**
 * Invoice Service - BOLT11 Invoice 生成服务
 * 
 * @trace Vol.2 S-P0-05, Task-20
 * @constraint D-GW-03: Invoice 可解析
 * @alignment 提供真实 Invoice 生成能力供 L402 Middleware 使用
 */

import crypto from 'crypto';
import { InvoiceResult } from '../controllers/lnd';
import { LndRpcClient, tryCreateLndClient } from '../utils/lnd_grpc';

/** LND 运行模式 */
export type LndMode = 'mock' | 'real';

/**
 * 获取 LND 运行模式
 * @returns 'mock' (默认) 或 'real'
 */
export function getLndMode(): LndMode {
    const mode = process.env.LND_MODE?.toLowerCase() ?? 'mock';
    if (mode === 'real') {
        console.log('[InvoiceService] Running in REAL LND mode');
        return 'real';
    }
    // D-H-06b: Mock 模式必须输出警告
    console.warn('[InvoiceService] ⚠️ Running in MOCK mode - invoices are simulated');
    return 'mock';
}

/** Invoice 服务配置 */
interface InvoiceServiceConfig {
    /** LND 主机地址 */
    host: string;
    /** LND gRPC 端口 */
    port: number;
    /** Macaroon 路径 */
    macaroonPath: string;
    /** TLS 证书路径 */
    tlsCertPath: string;
    /** 默认过期时间 (秒) */
    defaultExpirySeconds: number;
}

/** Invoice 创建参数 */
export interface CreateInvoiceParams {
    /** 金额 (毫聪) */
    amountMsats: number;
    /** 发票备注 */
    memo: string;
    /** 过期时间 (秒) */
    expirySeconds?: number;
    /** 服务标识 (用于 Caveat) */
    service?: string;
}

/** Invoice 查询结果 */
export interface InvoiceStatus {
    /** Payment Hash */
    paymentHash: string;
    /** 是否已支付 */
    settled: boolean;
    /** 支付时间 (Unix timestamp) */
    settledAt?: number;
    /** Preimage (已支付时返回) */
    preimage?: string;
}

/**
 * Invoice 服务类
 * 
 * 封装 BOLT11 Invoice 的创建、查询、验证
 * - Mock 模式: 本地模拟 (LND_MODE=mock, 默认)
 * - Real 模式: 连接真实 LND gRPC (LND_MODE=real)
 */
export class InvoiceService {
    private config: InvoiceServiceConfig;
    private mode: LndMode;
    private lndClient?: LndRpcClient;
    private preimageCache: Map<string, string> = new Map();
    private invoiceCache: Map<string, InvoiceResult & { settled: boolean }> = new Map();
    private initialized = false;

    constructor(config?: Partial<InvoiceServiceConfig>) {
        this.config = {
            host: config?.host ?? process.env.LND_HOST ?? 'localhost',
            port: config?.port ?? parseInt(process.env.LND_GRPC_PORT ?? '10009', 10),
            macaroonPath: config?.macaroonPath ?? process.env.LND_MACAROON_PATH ?? '/app/.lnd/admin.macaroon',
            tlsCertPath: config?.tlsCertPath ?? process.env.LND_TLS_CERT_PATH ?? '/app/.lnd/tls.cert',
            defaultExpirySeconds: config?.defaultExpirySeconds ?? 3600,
        };
        this.mode = getLndMode();
    }

    /**
     * 初始化服务 (延迟加载 LND 客户端)
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        if (this.mode === 'real') {
            this.lndClient = await tryCreateLndClient({
                host: this.config.host,
                port: this.config.port,
                macaroonPath: this.config.macaroonPath,
                tlsCertPath: this.config.tlsCertPath,
            });

            if (!this.lndClient) {
                console.warn('[InvoiceService] ⚠️ LND connection failed, falling back to MOCK mode');
                this.mode = 'mock';
            }
        }

        this.initialized = true;
    }

    /** 获取当前运行模式 */
    getMode(): LndMode {
        return this.mode;
    }

    /**
     * 创建 Invoice (模式自动分发)
     * 
     * @param params - Invoice 创建参数
     * @returns Invoice 创建结果
     */
    async create(params: CreateInvoiceParams): Promise<InvoiceResult> {
        await this.initialize();

        if (this.mode === 'real' && this.lndClient) {
            return this._createRealInvoice(params);
        }
        return this._createMockInvoice(params);
    }

    /**
     * 创建真实 Invoice (通过 LND gRPC)
     */
    private async _createRealInvoice(params: CreateInvoiceParams): Promise<InvoiceResult> {
        const { amountMsats, memo, expirySeconds = this.config.defaultExpirySeconds } = params;

        if (!this.lndClient) {
            throw new Error('LND client not initialized');
        }

        const response = await this.lndClient.addInvoice({
            memo,
            value_msat: amountMsats,
            expiry: expirySeconds,
        });

        const paymentHash = response.r_hash.toString('hex');
        const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;

        const invoice: InvoiceResult = {
            paymentRequest: response.payment_request,
            paymentHash,
            amountMsats,
            expiresAt,
        };

        // 缓存状态 (用于查询)
        this.invoiceCache.set(paymentHash, { ...invoice, settled: false });

        console.log(`[InvoiceService] Real Invoice: ${paymentHash.substring(0, 16)}... ${amountMsats}msats`);

        return invoice;
    }

    /**
     * 创建 Mock Invoice (本地模拟)
     */
    private _createMockInvoice(params: CreateInvoiceParams): InvoiceResult {
        const { amountMsats, memo, expirySeconds = this.config.defaultExpirySeconds } = params;

        // 生成 preimage 和 payment hash
        const preimage = crypto.randomBytes(32);
        const paymentHash = crypto.createHash('sha256').update(preimage).digest('hex');

        // 缓存 preimage (用于后续验证)
        this.preimageCache.set(paymentHash, preimage.toString('hex'));

        // 生成 BOLT11 Invoice (Mock 格式)
        const amountSats = Math.floor(amountMsats / 1000);
        const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;
        const paymentRequest = this._generateBolt11(amountSats, paymentHash, memo, expiresAt);

        const invoice: InvoiceResult = {
            paymentRequest,
            paymentHash,
            amountMsats,
            expiresAt,
        };

        // 缓存 Invoice 状态
        this.invoiceCache.set(paymentHash, { ...invoice, settled: false });

        console.log(`[InvoiceService] Mock Invoice: ${paymentHash.substring(0, 16)}... ${amountMsats}msats`);

        return invoice;
    }

    /**
     * 模拟支付 Invoice (测试用)
     * 
     * @param paymentHash - Payment Hash
     * @returns Preimage (如果存在)
     */
    async simulatePayment(paymentHash: string): Promise<string | null> {
        const cached = this.invoiceCache.get(paymentHash);
        if (!cached) return null;

        const preimage = this.preimageCache.get(paymentHash);
        if (!preimage) return null;

        // 标记为已支付
        cached.settled = true;
        this.invoiceCache.set(paymentHash, cached);

        console.log(`[InvoiceService] Simulated payment for: ${paymentHash.substring(0, 16)}...`);
        return preimage;
    }

    /**
     * 查询 Invoice 状态
     * 
     * @param paymentHash - Payment Hash
     * @returns Invoice 状态
     */
    async getStatus(paymentHash: string): Promise<InvoiceStatus | null> {
        const cached = this.invoiceCache.get(paymentHash);
        if (!cached) return null;

        const preimage = cached.settled ? this.preimageCache.get(paymentHash) : undefined;

        return {
            paymentHash,
            settled: cached.settled,
            settledAt: cached.settled ? Math.floor(Date.now() / 1000) : undefined,
            preimage,
        };
    }

    /**
     * 验证 Preimage 是否匹配 Payment Hash
     * 
     * @param preimage - 32-byte hex preimage
     * @param paymentHash - 32-byte hex payment hash
     * @returns true if valid
     */
    verifyPreimage(preimage: string, paymentHash: string): boolean {
        if (preimage.length !== 64 || paymentHash.length !== 64) {
            return false;
        }

        const computed = crypto.createHash('sha256')
            .update(Buffer.from(preimage, 'hex'))
            .digest('hex');

        return computed === paymentHash;
    }

    /**
     * 生成 BOLT11 格式发票字符串 (Mock 实现)
     * 
     * BOLT11 格式简化版:
     * - 前缀: lnbc (bitcoin mainnet) / lntb (testnet) / lnbcrt (regtest)
     * - 金额 + 单位
     * - 数据部分
     */
    private _generateBolt11(
        amountSats: number,
        paymentHash: string,
        memo: string,
        expiresAt: number,
    ): string {
        // 网络前缀 (根据环境变量判断)
        const network = process.env.LND_NETWORK ?? 'regtest';
        const prefix = network === 'mainnet' ? 'lnbc'
            : network === 'signet' ? 'lntbs'
                : 'lnbcrt';

        // 金额编码 (使用 'n' 表示 nano-btc = 100 sats)
        const amountEncoded = amountSats >= 100
            ? `${Math.floor(amountSats / 100)}n`
            : `${amountSats * 1000}p`; // 使用 pico-btc

        // 简化的数据部分 (仅包含 payment hash 前缀)
        const dataHash = paymentHash.substring(0, 52);
        const timestamp = Math.floor(Date.now() / 1000).toString(36);

        // 组装 bolt11 字符串
        return `${prefix}${amountEncoded}1${timestamp}${dataHash}`;
    }

    /**
     * 清理过期 Invoice (可选的内存管理)
     */
    async cleanup(): Promise<number> {
        const now = Math.floor(Date.now() / 1000);
        let cleaned = 0;

        for (const [hash, invoice] of this.invoiceCache) {
            if (invoice.expiresAt < now && !invoice.settled) {
                this.invoiceCache.delete(hash);
                this.preimageCache.delete(hash);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[InvoiceService] Cleaned ${cleaned} expired invoices`);
        }

        return cleaned;
    }
}

// 单例实例
let _instance: InvoiceService | null = null;

/**
 * 获取 Invoice 服务单例
 */
export function getInvoiceService(): InvoiceService {
    if (!_instance) {
        _instance = new InvoiceService();
    }
    return _instance;
}

/**
 * 重置 Invoice 服务 (测试用)
 */
export function resetInvoiceService(): void {
    _instance = null;
}
