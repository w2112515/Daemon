/**
 * LND Controller for Gateway
 * 
 * @trace Vol.2 S-P0-04, Vol.1 §2.2
 * @description 提供 Invoice 生成能力，用于 L402 挑战
 */

import crypto from 'crypto';

/** Mock preimage 存储 (dev/demo only) */
const mockPreimageStore = new Map<string, string>();

/** Invoice 创建结果 */
export interface InvoiceResult {
    paymentRequest: string;     // bolt11 invoice
    paymentHash: string;        // hex (32 bytes)
    amountMsats: number;
    expiresAt: number;          // unix timestamp
}

/** LND gRPC 配置 (从环境变量读取) */
interface LNDConfig {
    host: string;
    port: number;
    macaroonPath: string;
    tlsCertPath: string;
}

/**
 * 从环境变量获取 LND 配置
 */
function getLNDConfig(): LNDConfig {
    return {
        host: process.env.LND_HOST || 'localhost',
        port: parseInt(process.env.LND_GRPC_PORT || '10009', 10),
        macaroonPath: process.env.LND_MACAROON_PATH || '/app/.lnd/admin.macaroon',
        tlsCertPath: process.env.LND_TLS_CERT_PATH || '/app/.lnd/tls.cert',
    };
}

/**
 * 创建 Invoice (用于 L402 挑战)
 * 
 * @param amountMsats - 金额 (毫聪)
 * @param memo - 发票备注
 * @param expirySeconds - 过期时间 (秒)
 * @returns Invoice 创建结果
 * 
 * @note 当前使用 Mock 实现，正式环境需连接 LND gRPC
 */
export async function createInvoice(
    amountMsats: number,
    memo: string,
    expirySeconds = 3600,
): Promise<InvoiceResult> {
    const config = getLNDConfig();

    // TODO: 实现真实 LND gRPC 调用
    // 当前使用 Mock 实现供测试和开发

    // 生成 Mock preimage 和 payment hash
    const preimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest('hex');

    // 生成 Mock bolt11 invoice
    // 格式: lnbc<amount><unit><hash_partial>
    const amountSats = Math.floor(amountMsats / 1000);
    const paymentRequest = `lnbc${amountSats}n1p${paymentHash.substring(0, 52)}`;

    const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;

    // 存储 preimage 供 mock 支付查询
    mockPreimageStore.set(paymentHash, preimage.toString('hex'));

    console.log(`[LND] Mock Invoice created: ${paymentHash.substring(0, 16)}... ${amountMsats}msats`);

    return {
        paymentRequest,
        paymentHash,
        amountMsats,
        expiresAt,
    };
}

/**
 * 查询 Mock preimage (dev/demo only)
 * 
 * @param paymentHash - 32-byte hex payment hash
 * @returns preimage hex or null
 */
export function getMockPreimage(paymentHash: string): string | null {
    return mockPreimageStore.get(paymentHash) ?? null;
}

/**
 * 验证 Preimage 是否匹配 Payment Hash
 * 
 * @param preimage - 32-byte hex preimage
 * @param paymentHash - 32-byte hex payment hash
 * @returns true if preimage matches
 */
export function verifyPreimage(preimage: string, paymentHash: string): boolean {
    if (preimage.length !== 64 || paymentHash.length !== 64) {
        return false;
    }

    const computed = crypto.createHash('sha256')
        .update(Buffer.from(preimage, 'hex'))
        .digest('hex');

    return computed === paymentHash;
}
