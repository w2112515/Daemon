# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# 安全：使用非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S l402proxy -u 1001 -G nodejs

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER l402proxy

# 环境变量 (必填: UPSTREAM_URL)
ENV PORT=8402
ENV PRICE_PER_REQUEST=1000
ENV PRICE_MEMO="L402 Proxy API Call"
ENV LND_MODE=mock
ENV SKIP_PATHS=/health,/info

EXPOSE 8402

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8402/health || exit 1

CMD ["node", "dist/index.js"]
