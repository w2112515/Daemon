/**
 * LND gRPC Client 封装
 * 
 * @trace Task-H-06: LND 双模式实现
 * @constraint 禁止硬编码 Macaroon 或 TLS 证书
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fs from 'fs';
import path from 'path';

/** LND gRPC 客户端配置 */
export interface LndGrpcConfig {
    host: string;
    port: number;
    macaroonPath: string;
    tlsCertPath: string;
}

/** AddInvoice 请求参数 */
export interface AddInvoiceRequest {
    memo: string;
    value_msat: number;
    expiry: number;
}

/** AddInvoice 响应 */
export interface AddInvoiceResponse {
    r_hash: Buffer;
    payment_request: string;
    add_index: number;
    payment_addr: Buffer;
}

/** LND RPC 客户端接口 */
export interface LndRpcClient {
    addInvoice(request: AddInvoiceRequest): Promise<AddInvoiceResponse>;
    lookupInvoice(rHash: Buffer): Promise<unknown>;
    close(): void;
}

/**
 * 创建 LND gRPC 客户端
 * 
 * @param config - gRPC 配置
 * @returns LND RPC 客户端
 * @throws Error 如果连接失败
 */
export async function createLndClient(config: LndGrpcConfig): Promise<LndRpcClient> {
    const { host, port, macaroonPath, tlsCertPath } = config;

    // 读取 TLS 证书
    if (!fs.existsSync(tlsCertPath)) {
        throw new Error(`LND TLS cert not found: ${tlsCertPath}`);
    }
    const tlsCert = fs.readFileSync(tlsCertPath);

    // 读取 Macaroon
    if (!fs.existsSync(macaroonPath)) {
        throw new Error(`LND Macaroon not found: ${macaroonPath}`);
    }
    const macaroon = fs.readFileSync(macaroonPath).toString('hex');

    // 加载 Lightning proto
    const protoPath = path.resolve(__dirname, '../../proto/lightning.proto');
    if (!fs.existsSync(protoPath)) {
        throw new Error(`Proto file not found: ${protoPath}. Please add LND proto files.`);
    }

    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });

    const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc as grpc.GrpcObject;

    // 创建 SSL 凭证
    const sslCreds = grpc.credentials.createSsl(tlsCert);

    // 创建 Macaroon 凭证
    const macaroonCreds = grpc.credentials.createFromMetadataGenerator(
        (
            _params: { service_url: string },
            callback: (error: Error | null, metadata?: grpc.Metadata) => void
        ) => {
            const metadata = new grpc.Metadata();
            metadata.add('macaroon', macaroon);
            callback(null, metadata);
        }
    );

    // 组合凭证
    const creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

    // 创建客户端
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LightningClient = lnrpc.Lightning as any;
    const client = new LightningClient(`${host}:${port}`, creds);

    console.log(`[LndGrpc] Connected to ${host}:${port}`);

    // 封装 Promise 接口
    return {
        addInvoice: (request: AddInvoiceRequest) =>
            new Promise<AddInvoiceResponse>((resolve, reject) => {
                client.AddInvoice(request, (err: Error | null, response: AddInvoiceResponse) => {
                    if (err) reject(err);
                    else resolve(response);
                });
            }),

        lookupInvoice: (rHash: Buffer) =>
            new Promise((resolve, reject) => {
                client.LookupInvoice({ r_hash: rHash }, (err: Error | null, response: unknown) => {
                    if (err) reject(err);
                    else resolve(response);
                });
            }),

        close: () => {
            client.close();
        },
    };
}

/** 
 * 尝试创建 LND 客户端，失败时返回 undefined
 * 
 * @param config - gRPC 配置
 * @returns LND RPC 客户端或 undefined
 */
export async function tryCreateLndClient(config: LndGrpcConfig): Promise<LndRpcClient | undefined> {
    try {
        return await createLndClient(config);
    } catch (error) {
        console.error('[LndGrpc] Failed to connect:', error instanceof Error ? error.message : error);
        return undefined;
    }
}
