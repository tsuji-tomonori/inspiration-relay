# 仕様準拠テスト追加

状態: in_progress

## 背景

アップロードされた仕様書 v0.1 と GitHub リポジトリに対して、`api`、`web`、`infra` に追加する単体テスト一式が ZIP として提供された。

## 目的

提供されたテスト一式をリポジトリへ取り込み、既存の Vitest 構成に合わせて実行できる状態にする。

## タスク種別

機能追加

## スコープ

- `apps/api/src/spec-compliance.test.ts`
- `apps/web/src/api.test.ts`
- `infra/test/spec-compliance.test.ts`
- 作業レポートと PR 用の task 状態更新

## 計画

1. 専用 worktree を `origin/main` から作成する。
2. 提供 ZIP の内容を展開して対象ファイルを追加する。
3. 既存コードと import/API 名が合うか確認し、必要ならテストを現行実装へ合わせる。
4. 対象 workspace の test と `git diff --check` を実行する。
5. 作業レポートを作成し、commit、push、PR 作成、受け入れ条件コメント、セルフレビューコメントを行う。
6. PR コメント後に task を done へ移動し、同じ PR branch に commit/push する。

## ドキュメント保守計画

今回の主成果物は仕様準拠を確認するテスト追加であり、本番仕様や操作手順は変更しない。README や `docs/` の更新が必要かは差分確認後に判断し、不要なら作業レポートと PR 本文に理由を記載する。

## 受け入れ条件

- `apps/api/src/spec-compliance.test.ts` が追加され、ゲーム進行、権限制御、ヒント入力制約、得点処理の仕様準拠を検証する。
- `apps/web/src/api.test.ts` が追加され、API クライアントの endpoint、method、Authorization header、JSON body、エラー処理を検証する。
- `infra/test/spec-compliance.test.ts` が追加され、仕様で要求される DynamoDB、S3、CloudFront、API Gateway、Lambda 環境変数、Cognito 非利用を検証する。
- `npm run test -w @hirameki-relay/api` が pass する。
- `npm run test -w @hirameki-relay/web` が pass する。
- `npm run test -w @hirameki-relay/infra` が pass する。
- `git diff --check` が pass する。
- 作業レポートを `reports/working/` に保存し、PR 本文に反映する。
- PR 作成後、受け入れ条件確認コメントとセルフレビューコメントを日本語で投稿する。

## 検証計画

- `npm run test -w @hirameki-relay/api`
- `npm run test -w @hirameki-relay/web`
- `npm run test -w @hirameki-relay/infra`
- `git diff --check`

## PR レビュー観点

- 追加テストが仕様に由来する期待値を確認しているか。
- 既存実装の公開 API とテストの import/API 呼び出しが一致しているか。
- 仕様固有値を本番実装へ入れず、テストだけで期待値を表現しているか。
- 未実施の検証がある場合に実施済み扱いしていないか。

## リスク

- 提供 ZIP のテストが現行コードの exported API とずれている場合、テストの調整が必要になる。
- infra の CDK 合成テンプレートは construct ID や生成リソース名に依存しやすいため、仕様意図を保った assertion へ調整が必要になる可能性がある。
