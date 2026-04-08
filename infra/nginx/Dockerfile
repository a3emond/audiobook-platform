# ===== BUILD ANGULAR =====
FROM node:24-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm install

COPY frontend ./
RUN npm run build


# ===== NGINX RUNTIME =====
FROM nginx:alpine

# nginx config
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf

# entrypoint: generates env.js from container env vars at startup
COPY infra/nginx/30-env.sh /docker-entrypoint.d/30-env.sh
RUN chmod +x /docker-entrypoint.d/30-env.sh

# angular build output — Angular 17+ writes to dist/<project>/browser/
COPY --from=builder /app/dist/app/browser /usr/share/nginx/html

EXPOSE 80