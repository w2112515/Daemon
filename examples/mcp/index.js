#!/usr/bin/env node
/**
 * L402 MCP SDK 完整使用示例
 * 
 * 演示完整 L402 流程:
 * 1. 发送请求 (无凭证)
 * 2. 接收 402 响应 + 挑战
 * 3. 模拟支付获取 preimage
 * 4. 使用凭证重试请求
 * 
 * @trace Vol.2 §2.5 S-P1-06
 * @constraint D-ECO-06
 */

const BASE_URL = process.env.L402_SERVER_URL ?? 'http://localhost:3402';

/**
 * L402 Challenge 解析器
 */
function parseL402Challenge(wwwAuthenticate) {
    const match = wwwAuthenticate.match(/L402\s+macaroon="([^"]+)",\s*invoice="([^"]+)"/i);
    if (!match) {
        throw new Error(`Invalid L402 challenge: ${wwwAuthenticate}`);
    }
    return {
        macaroon: match[1],
        invoice: match[2],
    };
}

/**
 * 模拟 Lightning 支付 (Demo 用)
 * 实际环境中应调用 LND/CLN 支付接口
 */
async function mockPayInvoice(invoice) {
    console.log('⚡ 模拟支付 Invoice...');
    console.log(`   Invoice: ${invoice.substring(0, 50)}...`);

    // Mock: 使用 invoice 的 hash 作为 preimage
    const preimage = Buffer.from(invoice.slice(-32)).toString('hex').padEnd(64, 'f');

    console.log(`   Preimage: ${preimage.substring(0, 32)}...`);
    return preimage;
}

/**
 * 发送 L402 请求
 */
async function requestWithL402(url, options = {}) {
    const method = options.method ?? 'GET';
    const headers = { ...options.headers };

    // Step 1: 初始请求
    console.log(`\n📤 ${method} ${url}`);
    let response = await fetch(url, { ...options, headers });

    // Step 2: 处理 402 挑战
    if (response.status === 402) {
        console.log('🔐 收到 402 Payment Required');

        const wwwAuth = response.headers.get('www-authenticate');
        if (!wwwAuth) {
            throw new Error('Missing WWW-Authenticate header');
        }

        const { macaroon, invoice } = parseL402Challenge(wwwAuth);
        console.log(`   Macaroon: ${macaroon.substring(0, 30)}...`);

        // Step 3: 支付
        const preimage = await mockPayInvoice(invoice);

        // Step 4: 使用凭证重试
        console.log('🔄 使用 L402 凭证重试...');
        headers['Authorization'] = `L402 ${macaroon}:${preimage}`;
        response = await fetch(url, { ...options, headers });
    }

    return response;
}

/**
 * 主函数: 演示完整 L402 流程
 */
async function main() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║             🔐 L402 MCP SDK Example                       ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║ Target: ${BASE_URL.padEnd(51)}║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');

    try {
        // 测试 1: 健康检查 (无需 L402)
        console.log('\n── Test 1: Health Check ──');
        const healthRes = await fetch(`${BASE_URL}/health`);
        const health = await healthRes.json();
        console.log('✅ Health:', health.status);

        // 测试 2: 受保护端点 (需要 L402)
        console.log('\n── Test 2: Protected Endpoint ──');
        const dataRes = await requestWithL402(`${BASE_URL}/api/data`);
        const data = await dataRes.json();
        console.log('✅ Access Granted!');
        console.log('   Data:', JSON.stringify(data, null, 2));

        // 测试 3: POST 请求 (需要 L402)
        console.log('\n── Test 3: Protected POST ──');
        const computeRes = await requestWithL402(`${BASE_URL}/api/compute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: 'Hello L402!' }),
        });
        const compute = await computeRes.json();
        console.log('✅ Computation Result:', compute.result);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('✨ All tests passed!');
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('提示: 请确保 Demo Server 正在运行');
        console.error('启动命令: cd ../../sdk/mcp && npm run demo');
        process.exit(1);
    }
}

main();
