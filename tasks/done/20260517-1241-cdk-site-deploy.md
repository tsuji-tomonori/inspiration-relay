# CDK による SPA 配信デプロイ修正

- 状態: done
- タスク種別: 修正
- ブランチ: `codex/cdk-site-deploy`
- 作成日時: 2026-05-17 12:41 JST

## 背景

CloudFront のルート URL `/` が S3 private bucket の `/` オブジェクト参照になり、`index.html` ではなく 403 AccessDenied を返す可能性がある。加えて、deploy workflow は build と CDK deploy を実行するが、`apps/web/dist` を S3 へ配置する処理を持っていない。

## なぜなぜ分析サマリ

- confirmed: `infra/lib/hirameki-relay-stack.ts` の `Distribution` に `defaultRootObject` がない。
- confirmed: `.github/workflows/deploy.yml` は `npm run build` と `cdk deploy` を行うが、Web 成果物を S3 に同期する step はない。
- confirmed: `SiteBucket` は private S3 として作成され、CloudFront OAC 経由の配信を前提にしている。
- inferred: `/` へのアクセスでは CloudFront が `index.html` に解決せず、S3 origin のルート相当を読みに行くため 403 になる。
- inferred: deploy 後も S3 に Web 成果物が配置されない場合、`/index.html` も 403 になる。
- open_question: 実 AWS 環境で現時点の `index.html` が S3 に存在するかは、この作業環境では未確認。
- root_cause: CDK stack が SPA 配信に必要な root object 解決と Web artifact 配置を管理しておらず、deploy workflow もそれを補完していない。
- remediation: CDK に `defaultRootObject`、S3 BucketDeployment、CloudFront invalidation、必要な outputs を追加し、CDK synth/test/docs で検証できるようにする。

## 目的

CDK deploy だけで CloudFront/S3 の SPA 配信が完結するようにし、ルート URL と SPA の深い URL 直アクセスを安定して `index.html` に解決させる。

## スコープ

- `infra/lib/hirameki-relay-stack.ts`
- `infra/test/hirameki-relay-stack.test.ts`
- `infra/package.json`
- `docs/infra/*`
- task/report ファイル
- 必要に応じた README の CI/CD 説明

## 実装計画

1. `Distribution` に `defaultRootObject: "index.html"` を追加する。
2. default behavior だけに CloudFront Function を関連付け、拡張子なしの SPA パスを `/index.html` に rewrite する。
3. `BucketDeployment` で `apps/web/dist` を `SiteBucket` に配置し、`distributionPaths: ["/*"]` で invalidation する。
4. `CfnOutput` で bucket name、distribution ID、distribution domain name を出す。
5. infra test と package scripts を、Web artifact を含む CDK synth に耐える形へ更新する。
6. generated infra docs を更新する。

## ドキュメント保守計画

- `docs/infra/*` は生成物として更新する。
- README の deploy workflow 説明が古くなる場合は最小限更新する。
- API docs は API 変更がないため更新しない。

## 受け入れ条件

- [x] CloudFront distribution に `DefaultRootObject: index.html` が設定されている。
- [x] CDK deploy の一部として `apps/web/dist` が S3 SiteBucket に配置される。
- [x] Web artifact 配置後に CloudFront invalidation が CDK 管理で実行される。
- [x] default behavior のみ SPA rewrite が有効で、`api/*` と `ws/*` は HTML fallback の対象外である。
- [x] CDK outputs に `SiteBucketName`、`DistributionId`、`DistributionDomainName` が含まれる。
- [x] infra test、typecheck、synth、docs check が通る。
- [x] 作業完了レポートを `reports/working/` に作成する。
- [x] PR 作成後、受け入れ条件確認コメントとセルフレビューコメントを日本語で投稿する。

## 検証計画

- `npm run typecheck -w @hirameki-relay/infra`
- `npm run test -w @hirameki-relay/infra`
- `npm run cdk:synth`
- `npm run docs:infra:check`
- `git diff --check`

## 検証実績

- `npm run typecheck -w @hirameki-relay/infra`: pass
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run docs:infra`: pass
- `npm run cdk:synth`: pass
- `npm run docs:infra:check`: sandbox 内では `tsx` の IPC pipe listen が `EPERM` で失敗。ユーザー承認後に `require_escalated` で再実行して pass
- `git diff --check`: pass

## PR

- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/3
- 受け入れ条件確認コメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/3#issuecomment-4469244738
- セルフレビューコメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/3#issuecomment-4469245371
- GitHub Apps での PR 作成・コメント投稿は `Resource not accessible by integration` で 403 だったため、代替として `gh` を使用した。

## PR レビュー観点

- CDK の `BucketDeployment` が Web build artifact の存在を前提にするため、scripts が必要な build を実行していること。
- API/WS behavior に SPA fallback が混入していないこと。
- generated docs が CDK template と同期していること。

## リスク

- `BucketDeployment` により CloudFormation custom resource と provider Lambda が増える。
- 初回 deploy 時は Web build artifact が空または未生成だと synth/deploy が失敗する。
- 実 AWS への deploy はこの作業では実行しないため、CloudFront の実配信確認は CI/CD 実行後に別途必要。
