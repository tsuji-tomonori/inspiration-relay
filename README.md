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
docs/api          Generated OpenAPI JSON / Markdown
docs/infra        Generated CDK resource inventory
docs/ui-spec      UI implementation notes and asset mapping
```

## Local Setup

```bash
npm install
npm run dev:api
npm run dev:web
```

The web app runs on `http://localhost:5173` and proxies `/api` plus `/ws` to the local API endpoint on `http://localhost:8787`.

## Validation

```bash
npm run typecheck
npm run test
npm run build
npm run cdk:synth
```

## Generated Docs

API and infrastructure references are generated from the runtime Hono API and the CDK stack.

```bash
npm run docs:api
npm run docs:infra
npm run docs:check
```

- `npm run docs:api` writes `docs/api/openapi.json`, `docs/api/openapi.md`, and operation detail pages under `docs/api/operations/`.
- `npm run docs:infra` writes `docs/infra/resource-inventory.json` and `docs/infra/resource-inventory.md`.
- `npm run docs:check` compares generated docs with the current API / CDK implementation and fails when committed docs are stale.

`GET /api/openapi.json` is the runtime source of truth for the API contract. When API routes, shared response shapes, or CDK resources change, regenerate docs and keep the generated files in the same PR.

## CI/CD

GitHub Actions are defined under `.github/workflows/`.

- `ci.yml` runs on pull requests and manual dispatch. It installs dependencies, checks generated docs, runs typecheck / tests / build, and uploads a CDK synth artifact.
- `generated-docs.yml` runs on `main` changes that affect API or infra docs. It regenerates docs and opens a pull request when generated files changed.
- `deploy.yml` is a manual CD workflow for CDK deploy. It requires a GitHub Environment such as `dev`, OIDC permission, and `AWS_DEPLOY_ROLE_ARN` in environment secrets. The workflow builds all workspaces, optionally runs `cdk bootstrap`, synthesizes the stack, and runs `cdk deploy --require-approval never`. The CDK stack deploys `apps/web/dist` to the private S3 site bucket and invalidates CloudFront after asset upload.

The deploy workflow does not create AWS credentials by itself. Configure the target account role and environment approval rules before running it.

## MVP Security Model

- No user accounts, email login, SNS login, Cognito login, or paid features.
- Room participation uses room-scoped `playerToken`.
- Host operations use room-scoped `hostToken`.
- WebSocket connections use short-lived tickets and receive room update notifications; clients refresh authorized REST snapshots after those notifications.
- WebSocket tickets return the API Gateway WebSocket stage URL directly, avoiding CloudFront path rewriting for the upgrade request.
- The server is authoritative for role checks, hint ordering, answer judgement, and scoring.

## Assets

The web UI uses the provided asset pack from `.workspace/hirameki_relay_asset_pack.zip`.
Committed runtime assets live under:

```txt
apps/web/public/assets/hirameki-relay/
```
