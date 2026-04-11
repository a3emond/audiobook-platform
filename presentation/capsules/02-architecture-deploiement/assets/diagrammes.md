# Diagrammes - Capsule 02

## Vue runtime

```mermaid
flowchart TB
  subgraph Clients
    WEB[Web Angular]
    ANDROID[Android Kotlin]
    APPLE[iOS/macOS Swift]
    WIN[Windows Electron]
  end

  NGINX[Nginx reverse proxy\n127.0.0.1:8100]
  API[API Express + Realtime Gateway]
  WORKER[Worker Node\nJobRunner/JobProcessor]
  DB[(MongoDB)]

  WEB --> NGINX
  ANDROID --> NGINX
  APPLE --> NGINX
  WIN --> NGINX
  NGINX --> API
  API --> DB
  WORKER --> DB
```

## Exposition minimale

```mermaid
flowchart LR
  INTERNET[Internet]
  HOST[Reverse proxy de l'hote]
  NGINX[Nginx du projet\nseule entree]
  API[API]
  WORKER[Worker]
  DB[(MongoDB)]

  INTERNET --> HOST --> NGINX
  NGINX --> API
  API --> DB
  WORKER --> DB
```

## Pipeline API simplifie

```mermaid
flowchart LR
  RQ[Request] --> JSON[express.json]
  JSON --> CORS[corsMiddleware]
  CORS --> RL[globalRateLimiter]
  RL --> RT[route dispatch]

  RT --> AUTH[/api/v1/auth]
  RT --> PROT[/api/v1/protected]
  RT --> ADMIN[/api/v1/admin]
  RT --> STR[/streaming]

  PROT --> AM[authMiddleware]
  ADMIN --> AM --> ROLE[requireRole admin]
  STR --> SAM[streamAuthMiddleware]
```
