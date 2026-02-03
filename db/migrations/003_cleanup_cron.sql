-- ============================================================
-- Daemon L402 - Data Cleanup Cron Job Migration
-- 来源: Vol.2 S-P0-08, D-OPS-01
-- ============================================================
-- 用途: 创建定期清理过期支付记录和会话数据的 Cron 任务
-- 依赖: pg_cron 扩展 (PostgreSQL 16+)
-- ============================================================

-- 创建基础表结构 (若不存在)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_hash TEXT UNIQUE NOT NULL,
    amount_msats BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT UNIQUE NOT NULL,
    agent_pubkey TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以优化清理查询
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- 清理函数
-- ============================================================

-- 清理过期支付记录 (保留 30 天)
CREATE OR REPLACE FUNCTION cleanup_expired_payments()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM payments
    WHERE (expires_at IS NOT NULL AND expires_at < NOW())
       OR (status = 'pending' AND created_at < NOW() - INTERVAL '1 hour')
       OR (status IN ('settled', 'failed') AND created_at < NOW() - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 记录清理日志
    INSERT INTO audit_logs (event_type, payload)
    VALUES ('cleanup_payments', jsonb_build_object(
        'deleted_count', deleted_count,
        'timestamp', NOW()
    ));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 清理过期会话
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO audit_logs (event_type, payload)
    VALUES ('cleanup_sessions', jsonb_build_object(
        'deleted_count', deleted_count,
        'timestamp', NOW()
    ));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 清理旧审计日志 (保留 90 天)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 主清理函数 (统一入口)
CREATE OR REPLACE FUNCTION run_cleanup_all()
RETURNS TABLE (
    resource TEXT,
    deleted_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'payments'::TEXT, cleanup_expired_payments()
    UNION ALL
    SELECT 'sessions'::TEXT, cleanup_expired_sessions()
    UNION ALL
    SELECT 'audit_logs'::TEXT, cleanup_old_audit_logs();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Cron 任务注册 (需要 pg_cron 扩展)
-- ============================================================

-- 尝试创建 pg_cron 扩展 (如果不存在则跳过)
DO $$
BEGIN
    -- 检查是否支持 pg_cron
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        
        -- 每小时清理过期支付
        PERFORM cron.schedule(
            'cleanup-payments-hourly',
            '0 * * * *',  -- 每小时执行
            $$SELECT cleanup_expired_payments()$$
        );
        
        -- 每 15 分钟清理过期会话
        PERFORM cron.schedule(
            'cleanup-sessions-15min',
            '*/15 * * * *',
            $$SELECT cleanup_expired_sessions()$$
        );
        
        -- 每天凌晨 3 点清理旧审计日志
        PERFORM cron.schedule(
            'cleanup-audit-daily',
            '0 3 * * *',
            $$SELECT cleanup_old_audit_logs()$$
        );
        
        RAISE NOTICE 'pg_cron jobs scheduled successfully';
    ELSE
        RAISE NOTICE 'pg_cron not available - use external scheduler (e.g., cron, systemd timer)';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron setup skipped: %', SQLERRM;
END;
$$;

-- ============================================================
-- 手动清理命令 (备用)
-- ============================================================

COMMENT ON FUNCTION run_cleanup_all() IS 
'Execute all cleanup tasks manually: SELECT * FROM run_cleanup_all();';

-- 验证安装
DO $$
BEGIN
    RAISE NOTICE '=== Cleanup Migration Complete ===';
    RAISE NOTICE 'Tables: payments, sessions, audit_logs';
    RAISE NOTICE 'Functions: cleanup_expired_payments(), cleanup_expired_sessions(), cleanup_old_audit_logs()';
    RAISE NOTICE 'Manual run: SELECT * FROM run_cleanup_all();';
END;
$$;
