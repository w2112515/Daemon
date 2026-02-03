#!/usr/bin/env node
/**
 * L402 Client 工具类示例
 * 
 * 演示如何封装 L402 请求为可复用的客户端类
 */

/**
 * L402 HTTP Client
 * 自动处理 402 挑战和凭证管理
 */
class L402Client {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl ?? 'http://localhost:3402';
        this.paymentHandler = options.paymentHandler ?? this._mockPayment.bind(this);
        this.credentialCache = new Map();
    }

    /**
     * 解析 L402 挑战
     */
    _parseChallenge(wwwAuth) {
        const match = wwwAuth.match(/L402\s+macaroon="([^"]+)",\s*invoice="([^"]+)"/i);
        if (!match) throw new Error('Invalid L402 challenge');
        return { macaroon: match[1], invoice: match[2] };
    }

    /**
     * Mock 支付处理器 (Demo 用)
     */
    async _mockPayment(invoice) {
        return Buffer.from(invoice.slice(-32)).toString('hex').padEnd(64, 'f');
    }

    /**
     * 发送请求，自动处理 L402
     */
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = { ...options.headers };

        // 检查缓存凭证
        const cachedCred = this.credentialCache.get(path);
        if (cachedCred) {
            headers['Authorization'] = `L402 ${cachedCred.macaroon}:${cachedCred.preimage}`;
        }

        let response = await fetch(url, { ...options, headers });

        // 处理 402
        if (response.status === 402) {
            const wwwAuth = response.headers.get('www-authenticate');
            const { macaroon, invoice } = this._parseChallenge(wwwAuth);

            // 支付并缓存
            const preimage = await this.paymentHandler(invoice);
            this.credentialCache.set(path, { macaroon, preimage });

            headers['Authorization'] = `L402 ${macaroon}:${preimage}`;
            response = await fetch(url, { ...options, headers });
        }

        return response;
    }

    /**
     * GET 请求
     */
    async get(path) {
        const res = await this.request(path);
        return res.json();
    }

    /**
     * POST 请求
     */
    async post(path, body) {
        const res = await this.request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.json();
    }
}

// Demo Usage
async function main() {
    const client = new L402Client({ baseUrl: 'http://localhost:3402' });

    console.log('🔐 L402 Client Demo\n');

    try {
        // GET 请求
        console.log('📤 GET /api/data');
        const data = await client.get('/api/data');
        console.log('📥 Response:', data);

        // POST 请求
        console.log('\n📤 POST /api/compute');
        const result = await client.post('/api/compute', { input: 'test' });
        console.log('📥 Response:', result);

        console.log('\n✅ Demo completed!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
