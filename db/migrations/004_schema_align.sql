-- ================================================================
-- Schema Alignment Migration (004)
-- 
-- @trace Task-H-07, S-H-07, D-H-07
-- @purpose 规范表迁移 - 对齐 Vol.4 数据模型
-- ================================================================

-- ==========================================
-- 1. 删除 Scope Creep 表 (若存在)
-- ==========================================
-- 这些表不符合 L402 无账号模式的约束 (AP-01)

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;  -- AP-01: 禁止用户表

-- ==========================================
-- 2. 创建规范表: used_preimages
-- ==========================================
-- 用于 Replay Protection (D-GW-05, D-H-01)

CREATE TABLE IF NOT EXISTS used_preimages (
    -- Preimage 的 SHA256 哈希 (Payment Hash)
    hash TEXT PRIMARY KEY,
    
    -- 创建时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 过期时间 (7 天后可清理)
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- 索引: 按过期时间查询 (用于清理任务)
CREATE INDEX IF NOT EXISTS idx_used_preimages_expires 
    ON used_preimages(expires_at);

-- 注释
COMMENT ON TABLE used_preimages IS 'L402 preimage 重放保护表';
COMMENT ON COLUMN used_preimages.hash IS 'Preimage SHA256 哈希 (Payment Hash)';
COMMENT ON COLUMN used_preimages.expires_at IS '7天后可清理';

-- ==========================================
-- 3. 创建规范表: invoices
-- ==========================================
-- 用于追踪发票状态

CREATE TABLE IF NOT EXISTS invoices (
    -- Payment Hash (发票唯一标识)
    payment_hash TEXT PRIMARY KEY,
    
    -- 金额 (毫聪)
    amount_msats BIGINT NOT NULL CHECK (amount_msats > 0),
    
    -- 状态: pending, settled, expired, cancelled
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'expired', 'cancelled')),
    
    -- 备注
    memo TEXT,
    
    -- 服务标识 (用于追踪)
    service TEXT,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- 索引: 按状态查询
CREATE INDEX IF NOT EXISTS idx_invoices_status 
    ON invoices(status);

-- 索引: 按创建时间查询
CREATE INDEX IF NOT EXISTS idx_invoices_created 
    ON invoices(created_at DESC);

-- 注释
COMMENT ON TABLE invoices IS 'L402 发票追踪表';
COMMENT ON COLUMN invoices.payment_hash IS 'Lightning Invoice Payment Hash';
COMMENT ON COLUMN invoices.amount_msats IS '金额 (毫聪) - 内部必须使用 sats/msats (AP-04)';

-- ==========================================
-- 4. 创建规范表: telemetry_events (可选)
-- ==========================================
-- 用于存储遥测事件 (生产环境)

CREATE TABLE IF NOT EXISTS telemetry_events (
    -- 事件 ID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 事件类型
    event_type TEXT NOT NULL,
    
    -- 事件时间戳
    event_timestamp TIMESTAMPTZ NOT NULL,
    
    -- Agent ID (匿名)
    agent_id TEXT,
    
    -- 事件数据 (JSONB)
    data JSONB DEFAULT '{}',
    
    -- 服务器接收时间
    received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引: 按事件类型和时间
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type 
    ON telemetry_events(event_type, event_timestamp DESC);

-- 分区建议: 生产环境按月分区
-- CREATE TABLE telemetry_events_2026_02 PARTITION OF telemetry_events 
--     FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

COMMENT ON TABLE telemetry_events IS '遥测事件存储 (D-SEC-04)';

-- ==========================================
-- 5. 验证
-- ==========================================
-- 以下查询可验证表是否存在

-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('used_preimages', 'invoices', 'telemetry_events');

-- ================================================================
-- Migration Complete
-- ================================================================
