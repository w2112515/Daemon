/**
 * Eliza LND Real Mode Service
 * 
 * Real LND gRPC integration for Eliza L402 Plugin
 * 
 * @trace Task-P2-05: Eliza LND Real Mode
 * @constraint D-P2-05a~c: Real LND connection with TLS/Macaroon
 * @alignment Vol.2 §308 + S-P2-05
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'fs';
import * as path from 'path';

import type {
    LndConfig,
    WalletBalance,
    Invoice,
    LndInfo,
} from './types';

/** LND Real Service 配置 */
export interface LndRealConfig {
    /** LND 主机地址 */
    host: string;
    /** LND gRPC 端口 */
    port: number;
    /** Macaroon 文件路径 */
    macaroonPath: string;
    /** TLS 证书路径 */
    tlsCertPath: string;
}

/** gRPC AddInvoice 响应 */
interface AddInvoiceResponse {
    r_hash: Buffer;
    payment_request: string;
    add_index: number;
}

/** gRPC GetInfo 响应 */
interface GetInfoResponse {
    identity_pubkey: string;
    alias: string;
    synced_to_chain: boolean;
}

/** gRPC ChannelBalance 响应 */
interface ChannelBalanceResponse {
    balance: number;
    pending_open_balance: number;
}

/**
 * LND Real Mode Service
 * 
 * Connects to LND via gRPC with TLS and Macaroon authentication
 */
export class LndRealModeService {
    private config: LndRealConfig;
    private client: grpc.Client | null = null;
    private connected = false;

    constructor(config?: Partial<LndRealConfig>) {
        this.config = {
            host: config?.host ?? process.env.LND_HOST ?? 'lnd',
            port: config?.port ?? parseInt(process.env.LND_GRPC_PORT ?? '10009', 10),
            macaroonPath: config?.macaroonPath ?? process.env.LND_MACAROON_PATH ?? '/app/.lnd/data/chain/bitcoin/regtest/admin.macaroon',
            tlsCertPath: config?.tlsCertPath ?? process.env.LND_TLS_CERT_PATH ?? '/app/.lnd/tls.cert',
        };
    }

    /**
     * Connect to LND node
     */
    async connect(): Promise<void> {
        if (this.connected) return;

        // Verify files exist
        if (!fs.existsSync(this.config.tlsCertPath)) {
            throw new Error(`TLS cert not found: ${this.config.tlsCertPath}`);
        }
        if (!fs.existsSync(this.config.macaroonPath)) {
            throw new Error(`Macaroon not found: ${this.config.macaroonPath}`);
        }

        // Load TLS cert
        const tlsCert = fs.readFileSync(this.config.tlsCertPath);

        // Load Macaroon
        const macaroon = fs.readFileSync(this.config.macaroonPath).toString('hex');

        // Load proto definition
        const protoPath = this.findProtoPath();
        if (!protoPath) {
            throw new Error('lightning.proto not found');
        }

        const packageDefinition = protoLoader.loadSync(protoPath, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        });

        const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc as grpc.GrpcObject;

        // Create credentials
        const sslCreds = grpc.credentials.createSsl(tlsCert);
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
        const creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

        // Create client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const LightningClient = lnrpc.Lightning as any;
        this.client = new LightningClient(
            `${this.config.host}:${this.config.port}`,
            creds
        );

        this.connected = true;
        console.log(`[LndRealMode] Connected to ${this.config.host}:${this.config.port}`);
    }

    /**
     * Find lightning.proto file
     */
    private findProtoPath(): string | null {
        // Use current file location for path resolution
        const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
        const searchPaths = [
            path.resolve(currentDir, '../../../gateway/proto/lightning.proto'),
            path.resolve(currentDir, '../../proto/lightning.proto'),
            '/app/gateway/proto/lightning.proto',
            process.env.PROTO_PATH ?? '',
        ];

        for (const p of searchPaths) {
            if (p && fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    }

    /**
     * Get node info
     */
    async getInfo(): Promise<LndInfo> {
        if (!this.client || !this.connected) {
            throw new Error('LND not connected');
        }

        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.client as any).GetInfo({}, (err: Error | null, response: GetInfoResponse) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        pubkey: response.identity_pubkey,
                        alias: response.alias,
                        syncedToChain: response.synced_to_chain,
                    });
                }
            });
        });
    }

    /**
     * Create an invoice
     */
    async createInvoice(amount: number, memo = 'L402 Payment'): Promise<Invoice> {
        if (!this.client || !this.connected) {
            throw new Error('LND not connected');
        }

        return new Promise((resolve, reject) => {
            const request = {
                value: amount,
                memo,
                expiry: 3600,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.client as any).AddInvoice(request, (err: Error | null, response: AddInvoiceResponse) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        paymentRequest: response.payment_request,
                        paymentHash: response.r_hash.toString('hex'),
                        expiry: 3600,
                    });
                }
            });
        });
    }

    /**
     * Get wallet balance
     */
    async getBalance(): Promise<WalletBalance> {
        if (!this.client || !this.connected) {
            throw new Error('LND not connected');
        }

        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.client as any).ChannelBalance({}, (err: Error | null, response: ChannelBalanceResponse) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        confirmedBalance: response.balance,
                        unconfirmedBalance: response.pending_open_balance,
                        totalBalance: response.balance + response.pending_open_balance,
                    });
                }
            });
        });
    }

    /**
     * Close connection
     */
    close(): void {
        if (this.client) {
            grpc.closeClient(this.client);
            this.client = null;
            this.connected = false;
            console.log('[LndRealMode] Disconnected');
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }
}

/**
 * Create LND service based on config
 * 
 * @param config - LND configuration
 * @returns Mock or Real LND service
 */
export function createLndService(config?: LndConfig): LndRealModeService | null {
    if (config?.mockMode) {
        console.log('[LND] Using mock mode');
        return null; // Will use LndConnectionService (mock)
    }

    const service = new LndRealModeService({
        host: config?.host,
        port: config?.port,
        macaroonPath: config?.macaroonPath,
        tlsCertPath: config?.tlsCertPath,
    });

    return service;
}
