# ひらめきリレー

短いひらがなヒントで回答者を正解へ導く、ログイン不要の Web パーティーゲーム MVP です。

## Stack

- Frontend: Vite + React + TypeScript
- Backend: Hono
- Game logic: TypeScript packages
- Infra: AWS CDK
- AWS target: S3, CloudFront, API Gateway HTTP API, API Gateway WebSocket API, Lambda, DynamoDB

## Repository Layout

```txt
apps/web          Vite React SPA
apps/api          Hono API and Lambda handlers
packages/shared   Shared types, topics, constants
packages/game-core Game validation, scoring, answer normalization
infra             AWS CDK stack
docs/ui-spec      UI implementation notes and asset mapping
```

## Local Setup

```bash
npm install
npm run dev:api
npm run dev:web
```

The web app runs on `http://localhost:5173` and proxies `/api` to the Hono API on `http://localhost:8787`.

## Validation

```bash
npm run typecheck
npm run test
npm run build
npm run cdk:synth
```

## MVP Security Model

- No user accounts, email login, SNS login, Cognito login, or paid features.
- Room participation uses room-scoped `playerToken`.
- Host operations use room-scoped `hostToken`.
- WebSocket connections are designed to use short-lived tickets.
- The server is authoritative for role checks, hint ordering, answer judgement, and scoring.

## Assets

The web UI uses the provided asset pack from `.workspace/hirameki_relay_asset_pack.zip`.
Committed runtime assets live under:

```txt
apps/web/public/assets/hirameki-relay/
```
