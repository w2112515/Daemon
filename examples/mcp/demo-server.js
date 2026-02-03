#!/usr/bin/env node
/**
 * 独立 L402 Demo Server (不依赖 SDK)
 * 
 * 用于理解 L402 协议的最小实现
 * 生产环境请使用 @daemon/l402-mcp SDK
 */

import express from 'express';

const PORT = parseInt(process.env.PORT ?? '3402', 10);
const SECRET = 'demo-secret-key';

// 简化的 Macaroon (Demo 用)
function mintMacaroon(paymentHash) {
    const payload = JSON.stringify({ paymentHash, exp: Date.now() + 3600000 });
    return Buffer.from(payload).toString('base64');
}

// 验证凭证
function verifyCredential(macaroon, preimage) {
    try {
        const payload = JSON.parse(Buffer.from(macaroon, 'base64').toString());
        // Demo: 简化验证 (生产环境需要 HMAC 签名验证)
        return payload.exp > Date.now();
    } catch {
        return false;
    }
}

// 生成 Mock Invoice
function createInvoice(amountMsats, memo) {
    const hash = Buffer.from(Date.now().toString()).toString('hex').padEnd(64, '0');
    return {
        paymentHash: hash,
        invoice: `lnbc${amountMsats}mock${hash}`,
    };
}

const app = express();
app.use(express.json());

// 健康检查
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// L402 保护中间件
app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization;

    if (auth?.startsWith('L402 ')) {
        const [macaroon, preimage] = auth.slice(5).split(':');
        if (verifyCredential(macaroon, preimage)) {
            req.l402 = { verified: true, macaroon };
            return next();
        }
    }

    // 返回 402 挑战
    const { paymentHash, invoice } = createInvoice(1000, 'API Call');
    const macaroon = mintMacaroon(paymentHash);

    res.setHeader('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${invoice}"`);
    res.status(402).json({
        error: 'Payment Required',
        message: 'Please pay the invoice and retry with L402 credentials',
    });
});

// 受保护端点
app.get('/api/data', (req, res) => {
    res.json({ message: 'Access granted!', timestamp: new Date().toISOString() });
});

app.post('/api/compute', (req, res) => {
    res.json({ result: `Processed: ${req.body?.input ?? 'none'}` });
});

app.listen(PORT, () => {
    console.log(`🔐 L402 Demo Server running on http://localhost:${PORT}`);
    console.log(`   Try: curl http://localhost:${PORT}/api/data`);
});
