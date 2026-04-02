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

# angular build output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80