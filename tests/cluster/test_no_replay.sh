#!/bin/bash
# ============================================================
# D-P2-06d: 并发测试 - 同一 preimage 只能成功一次
# 来源: Task-P2-06, Vol.5 §8.6 D-P2-06d
# ============================================================
#
# 用法: bash tests/cluster/test_no_replay.sh
#
# 预期结果:
#   - SUCCESS_COUNT = 1 (只有一个请求成功)
#   - REPLAY_COUNT = 99 (其他请求被拒绝)

set -e

# 配置
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
CONCURRENT_REQUESTS=100
PREIMAGE="test_preimage_$(date +%s)_$(shuf -i 1000-9999 -n 1)"

echo "============================================"
echo "Cluster Replay Protection Test (D-P2-06d)"
echo "============================================"
echo "Gateway URL: $GATEWAY_URL"
echo "Concurrent Requests: $CONCURRENT_REQUESTS"
echo "Test Preimage: ${PREIMAGE:0:32}..."
echo ""

# 临时文件存储响应
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "[1/3] Sending $CONCURRENT_REQUESTS concurrent requests..."

# 并发发送请求
for i in $(seq 1 $CONCURRENT_REQUESTS); do
    (
        HTTP_CODE=$(curl -s -o "$TMPDIR/body_$i.txt" -w "%{http_code}" \
            -H "Authorization: L402 mac:$PREIMAGE" \
            "$GATEWAY_URL/api/test" 2>/dev/null || echo "000")
        echo "$HTTP_CODE" > "$TMPDIR/code_$i.txt"
    ) &
done

# 等待所有请求完成
echo "[2/3] Waiting for all requests to complete..."
wait

# 统计结果
echo "[3/3] Analyzing results..."
SUCCESS_COUNT=0
REPLAY_COUNT=0
OTHER_COUNT=0

for i in $(seq 1 $CONCURRENT_REQUESTS); do
    if [ -f "$TMPDIR/code_$i.txt" ]; then
        CODE=$(cat "$TMPDIR/code_$i.txt")
        case "$CODE" in
            200) ((SUCCESS_COUNT++)) ;;
            401) ((REPLAY_COUNT++)) ;;
            402) ((SUCCESS_COUNT++)) ;;  # 402 也算成功到达
            *) ((OTHER_COUNT++)) ;;
        esac
    fi
done

echo ""
echo "============================================"
echo "Results:"
echo "============================================"
echo "  SUCCESS (200/402): $SUCCESS_COUNT (expected: 1)"
echo "  REPLAY (401):      $REPLAY_COUNT (expected: $((CONCURRENT_REQUESTS - 1)))"
echo "  OTHER:             $OTHER_COUNT (expected: 0)"
echo ""

# 验证结果
if [ "$SUCCESS_COUNT" -eq 1 ]; then
    echo "✅ PASS: Only 1 request succeeded"
    exit 0
else
    echo "❌ FAIL: Expected 1 success, got $SUCCESS_COUNT"
    exit 1
fi
