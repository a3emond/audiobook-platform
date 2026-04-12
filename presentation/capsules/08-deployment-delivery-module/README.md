# Capsule 08 - Deployment and Delivery Module

## 1. Module Scope

- Runtime packaging and environment composition.
- Reverse proxy routing and minimal exposure model.
- Automated deployment workflow for production updates.

## 2. Capability Set

- Multi service Docker Compose stack for api, worker, ffmpeg, and nginx.
- Single ingress reverse proxy with route partition for app, api, streaming, and realtime.
- CI CD workflow that builds and deploys on remote host over SSH.
- Environment driven configuration for reproducible runtime behavior.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    GH[GitHub Actions] --> HOST[Production Host]
    HOST --> NGINX[Nginx Container]
    NGINX --> FE[Frontend Static App]
    NGINX --> API[API Service]
    NGINX --> WS[Realtime WebSocket]
    API --> DB[(MongoDB)]
    API --> WKR[Worker Service]
    WKR --> FF[FFmpeg Service]
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant G as GitHub Actions
    participant H as Host
    participant C as Compose
    participant N as Nginx

    G->>H: deploy workflow via SSH
    H->>C: pull images and restart services
    C-->>N: bring up gateway and app stack
    N-->>H: health check routes ready
```

## 5. Class Diagram

```mermaid
classDiagram
    class DeployWorkflow {
      checkout()
      build()
      push()
      deploy()
    }
    class ComposeStack {
      up()
      down()
      health()
    }
    class NginxRouter {
      routeApp()
      routeApi()
      routeStreaming()
      routeWebSocket()
    }
    class EnvBootstrap {
      loadEnv()
      injectRuntimeVars()
    }

    DeployWorkflow --> ComposeStack
    ComposeStack --> NginxRouter
    ComposeStack --> EnvBootstrap
```

## 6. Evidence Files

- `docker-compose.yml`
- `infra/nginx/default.conf`
- `infra/nginx/30-env.sh`
- `.github/workflows/deploy.yml`
- `api/Dockerfile`

## 7. Code Proof Snippets

```yaml
# docker-compose.yml
services:
  nginx:
    build: ./infra/nginx
  api:
    build: ./api
  worker:
    build: ./worker
```

```nginx
# infra/nginx/default.conf
location /api/ {
  proxy_pass http://api:3000/api/;
}
location /ws {
  proxy_pass http://api:3000/ws;
}
```

## 8. GoF Patterns Demonstrated

- Facade
  - What it does: provides a single ingress (`Nginx`) for app, API, stream, and websocket routes, hiding backend topology from clients.

```nginx
# infra/nginx/default.conf
location / {
  try_files $uri /index.html;
}
location /api/ {
  proxy_pass http://api:3000/api/;
}
location /ws {
  proxy_pass http://api:3000/ws;
}
```

```mermaid
flowchart LR
    C[Client] --> NX[Nginx Facade]
    NX --> FE[Frontend Assets]
    NX --> API[API Service]
    NX --> WS[Realtime Gateway]
```

- Adapter
  - What it does: transforms deployment environment variables into the runtime config shape used by frontend and services.

```sh
# infra/nginx/30-env.sh
cat > /usr/share/nginx/html/env.js <<EOF
window.__env = {
  API_BASE_URL: "${API_BASE_URL}",
  WS_URL: "${WS_URL}"
};
EOF
```

```mermaid
flowchart LR
    ENV[Container Environment Vars] --> AD[30-env.sh Adapter]
    AD --> JS[public env.js]
    JS --> FE[Frontend Runtime Config]
```

- Template Method
  - What it does: enforces a repeatable deployment algorithm (checkout -> build -> deploy -> health check) with environment specific inputs.

```yaml
# .github/workflows/deploy.yml
steps:
  - uses: actions/checkout@v4
  - name: Build images
    run: docker compose build
  - name: Deploy on host
    run: ./scripts/deploy.sh
```

```mermaid
flowchart LR
    T1[Checkout] --> T2[Build]
    T2 --> T3[Deploy]
    T3 --> T4[Health Check]
```

<!-- screenshot: deployment workflow run -->
<!-- screenshot: reverse proxy routes map -->
