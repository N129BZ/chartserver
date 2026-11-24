# --- Build Stage ---
FROM node:24-alpine AS builder
WORKDIR /chartserver

# Install build dependencies for native addon compilation (better-sqlite3)
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
RUN npm install
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY . .
RUN npm run build-client

# --- Production Stage ---
FROM node:24-alpine
WORKDIR /chartserver
ENV NODE_ENV=production

# Install native dependencies if required at production runtime
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# Aligned paths: copy from /chartserver instead of /app
COPY --from=builder /chartserver/client/dist ./client/dist
COPY --from=builder /chartserver/server.js ./
COPY --from=builder /chartserver/config.yml ./
COPY --from=builder /chartserver/configedit.html ./
COPY --from=builder /chartserver/airports.db ./
COPY --from=builder /chartserver/tiles ./tiles
COPY --from=builder /chartserver/tiles ./tiles_internal
RUN mkdir -p /chartserver/tiles /chartserver/config
EXPOSE 8600
CMD ["node", "server.js"]