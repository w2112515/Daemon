-- Rate Limit Lua Script (Sliding Window)
-- 
-- @trace Task-P2-01, Vol.2 §301, D-P2-01a
-- @description 滑动窗口限流算法，使用 Redis ZSET 实现原子性
--
-- KEYS[1]: rate limit key (e.g., "ratelimit:{client_id}")
-- ARGV[1]: window size in ms
-- ARGV[2]: max requests
-- ARGV[3]: current timestamp in ms
--
-- Returns: 1 = allowed, 0 = rejected

local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local max_requests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- 移除窗口外的旧请求
local window_start = now - window_ms
redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

-- 计算当前窗口内请求数
local count = redis.call('ZCARD', key)

if count >= max_requests then
    -- 获取窗口内最早请求的时间，用于计算 Retry-After
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = 0
    if oldest and #oldest >= 2 then
        local oldest_time = tonumber(oldest[2])
        retry_after_ms = window_ms - (now - oldest_time)
        if retry_after_ms < 0 then
            retry_after_ms = 0
        end
    end
    return { 0, count, retry_after_ms }  -- 拒绝: status, count, retry_after
else
    -- 添加当前请求 (使用时间戳+随机数作为唯一成员)
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window_ms)
    return { 1, count + 1, 0 }  -- 允许: status, count, retry_after
end
