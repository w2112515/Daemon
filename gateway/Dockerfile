# ============================================================
# Gateway Dockerfile (TSX Runtime)
# 来源: Task-P2-06, D-P2-06b
# ============================================================

FROM node:20-alpine

WORKDIR /app

# 安装 curl 用于健康检查
RUN apk add --no-cache curl

# 复制依赖配置并安装所有依赖 (包含 tsx)
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY tsconfig.json ./
COPY src/ ./src/
COPY proto/ ./proto/

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 使用 tsx 运行 (避免 ESM 导入扩展名问题)
CMD ["npx", "tsx", "src/index.ts"]
