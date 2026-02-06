/**
 * LND Real Service - Production-mode LND gRPC integration
 * 
 * @trace Task-P2-03: Real LND Integration
 * @constraint D-P2-03a~c: TLS/Macaroon verification required
 * @alignment Vol.2 §306 + S-P2-03
 */

import { createLndClient, LndGrpcConfig, LndRpcClient, tryCreateLndClient } from '../utils/lnd_grpc';

/** GetInfo 响应 */
export interface LndGetInfoResponse {
    identity_pubkey: string;
    alias: string;
    num_active_channels: number;
    num_peers: number;
    block_height: number;
    synced_to_chain: boolean;
    version: string;
    chains: Array<{ chain: string; network: string }>;
}

/** Invoice 创建参数 */
export interface CreateInvoiceParams {
    /** 金额 (毫聪) */
    amountMsats: number;
    /** 发票备注 */
    memo: string;
    /** 过期时间 (秒) */
    expirySeconds?: number;
}

/** Invoice 创建响应 */
export interface CreateInvoiceResponse {
    paymentHash: string;
    paymentRequest: string;
    addIndex: number;
    paymentAddr?: string;
}

/**
 * LND Real Service 类
 * 
 * 封装 LND gRPC 连接，提供高级服务接口
 */
export class LndRealService {
    private client?: LndRpcClient;
    private config: LndGrpcConfig;
    private connected = false;

    constructor(config?: Partial<LndGrpcConfig>) {
        this.config = {
            host: config?.host ?? process.env.LND_HOST ?? 'lnd',
            port: config?.port ?? parseInt(process.env.LND_GRPC_PORT ?? '10009', 10),
            macaroonPath: config?.macaroonPath ?? process.env.LND_MACAROON_PATH ?? '/app/.lnd/data/chain/bitcoin/regtest/admin.macaroon',
            tlsCertPath: config?.tlsCertPath ?? process.env.LND_TLS_CERT_PATH ?? '/app/.lnd/tls.cert',
        };
    }

    /**
     * 建立 LND gRPC 连接
     * @throws Error 如果连接失败
     */
    async connect(): Promise<void> {
        if (this.connected && this.client) return;

        console.log(`[LndRealService] Connecting to ${this.config.host}:${this.config.port}...`);

        this.client = await createLndClient(this.config);
        this.connected = true;

        console.log('[LndRealService] ✅ Connected successfully');
    }

    /**
     * 尝试连接，失败时返回 false
     */
    async tryConnect(): Promise<boolean> {
        try {
            this.client = await tryCreateLndClient(this.config);
            this.connected = !!this.client;
            return this.connected;
        } catch {
            return false;
        }
    }

    /**
     * 获取节点信息
     * @returns 节点基本信息
     */
    async getInfo(): Promise<LndGetInfoResponse> {
        await this.ensureConnected();

        if (!this.client) {
            throw new Error('LND client not available');
        }

        // 使用底层 gRPC 调用 GetInfo
        // 注意: 需要扩展 LndRpcClient 接口以支持 getInfo
        const rawClient = this.client as unknown as {
            _rawClient?: {
                GetInfo: (req: Record<string, never>, cb: (err: Error | null, res: LndGetInfoResponse) => void) => void;
            };
        };

        if (!rawClient._rawClient) {
            // 如果底层客户端不可用，返回占位数据
            console.warn('[LndRealService] GetInfo not available on current client interface');
            return {
                identity_pubkey: 'unavailable',
                alias: 'Daemon LND',
                num_active_channels: 0,
                num_peers: 0,
                block_height: 0,
                synced_to_chain: false,
                version: 'unknown',
                chains: [{ chain: 'bitcoin', network: 'regtest' }],
            };
        }

        return new Promise((resolve, reject) => {
            rawClient._rawClient!.GetInfo({}, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });
    }

    /**
     * 创建 Invoice
     * @param params - 创建参数
     * @returns Invoice 信息
     */
    async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResponse> {
        await this.ensureConnected();

        if (!this.client) {
            throw new Error('LND client not available');
        }

        const { amountMsats, memo, expirySeconds = 3600 } = params;

        const response = await this.client.addInvoice({
            memo,
            value_msat: amountMsats,
            expiry: expirySeconds,
        });

        return {
            paymentHash: response.r_hash.toString('hex'),
            paymentRequest: response.payment_request,
            addIndex: response.add_index,
            paymentAddr: response.payment_addr?.toString('hex'),
        };
    }

    /**
     * 查询 Invoice 状态
     * @param paymentHash - Payment Hash (hex)
     */
    async lookupInvoice(paymentHash: string): Promise<unknown> {
        await this.ensureConnected();

        if (!this.client) {
            throw new Error('LND client not available');
        }

        const rHash = Buffer.from(paymentHash, 'hex');
        return this.client.lookupInvoice(rHash);
    }

    /**
     * 关闭连接
     */
    close(): void {
        if (this.client) {
            this.client.close();
            this.connected = false;
            console.log('[LndRealService] Connection closed');
        }
    }

    /**
     * 检查是否已连接
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * 内部方法：确保已连接
     */
    private async ensureConnected(): Promise<void> {
        if (!this.connected || !this.client) {
            await this.connect();
        }
    }
}

// 单例实例
let _realServiceInstance: LndRealService | null = null;

/**
 * 获取 LND Real Service 单例
 */
export function getLndRealService(): LndRealService {
    if (!_realServiceInstance) {
        _realServiceInstance = new LndRealService();
    }
    return _realServiceInstance;
}

/**
 * 重置 LND Real Service (测试用)
 */
export function resetLndRealService(): void {
    if (_realServiceInstance) {
        _realServiceInstance.close();
        _realServiceInstance = null;
    }
}
