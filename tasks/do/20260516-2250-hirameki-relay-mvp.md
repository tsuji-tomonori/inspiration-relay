# ひらめきリレー MVP 実装

- 状態: partially complete（PR flow blocked）
- タスク種別: 機能追加
- 作成日時: 2026-05-16 22:50 JST
- ブランチ: `codex/hirameki-relay-mvp`

## 背景

ユーザーは `.workspace` の仕様書、画面モック、アセットをもとに、Vite + React + TypeScript の UI、Hono のバックエンド、AWS CDK のインフラを実装するよう依頼した。

## workflow 制約

- 必須 flow では `origin/main` から専用 worktree を作成するが、このリポジトリは作業開始時点で remote が無く、`HEAD` も未作成だった。
- そのため専用 worktree 作成は blocked とし、現在の初期 worktree で `codex/hirameki-relay-mvp` ブランチを作成して作業する。
- GitHub Apps PR 作成は remote と GitHub repository が無いため、作業完了時に blocked として報告する見込み。

## 目的

ログイン不要、課金なし、すぐに遊べる Web パーティーゲーム「ひらめきリレー」の MVP 土台を実装する。

## スコープ

- Vite + React + TypeScript SPA
- `.workspace` 由来アセットを使った UI
- Hono API と Lambda 互換 handler
- ルーム、参加、ゲーム進行、ヒント、回答、スコアのサーバー権威ロジック
- WebSocket handler の境界
- AWS CDK による S3 / CloudFront / API Gateway / Lambda / DynamoDB 構成
- 最小十分なテスト、typecheck、build、CDK synth
- UI spec、README、作業完了レポート

## 対象外

- 実 AWS への deploy
- Cognito / ログイン / 課金
- 本番向け rate limit の完全実装
- 外部 repository への push / PR 作成。ただし remote が整えば workflow に従う。

## 実装計画

1. workspace と npm workspaces を構成する。
2. asset pack から UI 用アセットを追加する。
3. UI spec と asset map を作成する。
4. shared schema と game-core を実装する。
5. Hono API と in-memory/local repository、Lambda handler を実装する。
6. React UI と API client を実装する。
7. CDK stack を実装する。
8. README と検証を整備する。
9. レポートを作成し、commit / PR 可能性を確認する。

## ドキュメント保守計画

- 新規実装のため `README.md` を追加する。
- 視覚仕様とアセット対応は `docs/ui-spec/hirameki-relay-mvp.md` に記録する。
- 一時的な完了記録は `reports/working/` に置く。

## 受け入れ条件

- [x] `apps/web` が Vite + React + TypeScript で構成され、ホーム、ロビー、ヒント入力、回答、結果の主要画面を表示できる。
- [x] UI が `.workspace` 由来のロゴ、マスコット、アイコン、パネル、ボタン等のアセットを利用している。
- [x] `apps/api` が Hono で主要 REST endpoint を提供し、ログインなしの guest token / host token 前提で動く。
- [x] ゲームロジックがサーバー権威で、ひらがなヒント検証、ヒント並び替え、回答正規化、得点処理を含む。
- [x] WebSocket 用の Lambda handler 境界があり、ticket と snapshot 同期の設計に沿っている。
- [x] `infra` が AWS CDK で S3、CloudFront、HTTP API、WebSocket API、Lambda、DynamoDB を定義している。
- [x] Cognito、ログイン、課金要素を実装していない。
- [x] `npm run typecheck`、`npm run test`、`npm run build`、`npm run cdk:synth` を実行し、結果を記録する。
- [x] 375px と 1440px の UI 表示を実ブラウザまたは代替手段で確認し、実施不可の場合は理由を記録する。
- [x] 作業完了レポートを `reports/working/` に保存する。
- [ ] PR 作成後に受け入れ条件確認コメントを投稿し、task を `tasks/done/` に移動する。未達理由: remote / `origin/main` が無いため PR 作成が blocked。

## 検証計画

- `npm install` または `npm ci` で依存関係を解決する。
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run cdk:synth`
- `git diff --check`
- 可能なら dev server + browser screenshot で 375px / 1440px を確認する。

## PR レビュー観点

- 回答者にお題が漏れない payload 分離になっているか。
- token 生値を永続化しない設計になっているか。
- 本番 UI に固定の架空ユーザーや固定スコア fallback が混入していないか。
- docs と実装の endpoint / コマンドが同期しているか。
- CDK が public S3 を作らず CloudFront OAC を使うか。

## リスク

- 初期 repo のため remote / PR flow が完遂できない可能性が高い。
- 依存関係の install はネットワーク制限で blocked になる可能性がある。
- WebSocket の AWS 統合はローカル完全再現ではなく handler 境界と CDK 定義中心になる可能性がある。
