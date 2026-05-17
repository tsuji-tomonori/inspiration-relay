# Lambda ログ集約と JSON 化

- 状態: do
- タスク種別: 機能追加
- 作成日時: 2026-05-17 13:20 JST

## 背景

ユーザーから「Lambdaのログを一つのCloudWatchLogs に集約し、すべてjson形式として」と依頼された。AWS Lambda の `LoggingConfig` では、複数 Lambda の出力先を同じ CloudWatch Logs Log Group にし、ログ形式を JSON に設定できる。

## 目的

CDK で定義されたアプリケーション Lambda のログを単一 CloudWatch Logs Log Group に集約し、新規ログが JSON 形式で出力されるようにする。

## スコープ

- 対象: `ApiFunction`, `WsConnectFunction`, `WsDisconnectFunction`, `WsMessageFunction`
- 対象外: CDK の `BucketDeployment` が内部生成するカスタムリソース Lambda、既存 CloudWatch Logs の移行や削除、本番環境への deploy

## 実施計画

1. 共通 Lambda Log Group を CDK stack に追加する。
2. 対象 Lambda へ `loggingFormat: JSON` と共通 `logGroup` を設定する。
3. CDK assertion test で Log Group と Lambda logging 設定を検証する。
4. 運用・インフラ docs の更新要否を確認し、必要な生成 docs を更新する。
5. 対象範囲に見合う検証を実行する。

## ドキュメントメンテナンス計画

- `README.md` と `docs/` で Lambda / CloudWatch Logs の説明を検索する。
- 生成済みインフラ inventory が CDK synth 出力由来なら更新する。
- 永続的な運用説明が必要な場合は最小範囲で追記する。

## 受け入れ条件

- [x] 対象アプリケーション Lambda 4 個が同一の CloudWatch Logs Log Group に出力する。
- [x] 対象アプリケーション Lambda 4 個の `LogFormat` が `JSON` になる。
- [x] CDK assertion test で上記設定を検証している。
- [x] 変更に伴う docs 更新要否を確認し、必要な docs を更新している。
- [x] 実行した検証と未実施の検証を task / report / PR に記録している。

## 検証計画

- `git diff --check`
- `npm run test -w @inspiration-relay/infra` または repo の package 名に合わせた infra test
- 必要に応じて CDK synth / docs 生成コマンド

## PR レビュー観点

- Lambda logging 設定が対象 4 関数に漏れなく入っていること。
- CDK 生成 Lambda など対象外リソースまで意図せず含めていないこと。
- Log Group の retention / removal policy が既存の運用方針と矛盾しないこと。
- IAM 権限が CDK の Lambda logging 設定と整合していること。

## リスク

- 既存の `/aws/lambda/<function>` Log Group の過去ログは移行されない。
- JSON logging は新規ログにのみ適用される。
- deploy はこの作業の対象外のため、AWS 実環境での CloudWatch Logs 出力確認は未実施になる可能性がある。

## 実施結果

- `infra/lib/hirameki-relay-stack.ts` に `/hirameki-relay/lambda` Log Group を追加し、対象 4 Lambda の `loggingFormat` と `logGroup` に適用した。
- `infra/test/hirameki-relay-stack.test.ts` に Log Group 数、Log Group 名、保持期間、対象 4 Lambda の `LoggingConfig` を検証する assertion を追加した。
- `infra/scripts/generate-infra-docs.ts` と `docs/infra/resource-inventory.*` を更新し、Log Group と Lambda logging 設定が inventory に出るようにした。

## 実行した検証

- `npm ci`: pass
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run docs:infra`: pass
- `npm run docs:infra:check`: pass
- `npm run typecheck -w @hirameki-relay/infra`: pass
- `git diff --check`: pass
- `npm run cdk:synth`: pass

## 未実施・制約

- `cdk deploy`: 未実施。理由: AWS 実環境を変更する操作であり、今回の実装 PR 範囲に含めていないため。
- CloudWatch Logs 実出力確認: 未実施。理由: deploy 未実施のため。
