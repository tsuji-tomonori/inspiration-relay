# 作業完了レポート

保存先: `reports/working/20260517-1245-cdk-site-deploy.md`

## 1. 受けた指示

- 主な依頼: CloudFront/S3 の SPA 配信不具合について、S3 deploy も CDK で行うように修正する。
- 成果物: CDK stack、infra test、generated infra docs、README、task md、作業レポート。
- 形式・条件: リポジトリルールに従い、worktree、task md、検証、commit/PR フローまで進める。
- 追加・変更指示: `/plan` 後に `go` があり、計画を実行するものとして扱った。

## 2. 要件整理

| 要件ID | 指示・要件 | 重要度 | 対応状況 |
|---|---|---:|---|
| R1 | CloudFront の root URL で `index.html` を返す | 高 | 対応 |
| R2 | `apps/web/dist` の S3 配置を CDK deploy に含める | 高 | 対応 |
| R3 | 配置後の CloudFront invalidation を CDK deploy に含める | 高 | 対応 |
| R4 | SPA の深い URL 直アクセスを default behavior だけで rewrite する | 中 | 対応 |
| R5 | CDK outputs と docs を更新する | 中 | 対応 |
| R6 | 実施した検証だけを報告する | 高 | 対応 |

## 3. 検討・判断したこと

- `aws s3 sync` を workflow に追加するのではなく、依頼どおり `BucketDeployment` で CDK 管理に寄せた。
- `BucketDeployment` は synth 時に `apps/web/dist` を参照するため、infra の `synth`、`test`、`docs:infra`、`docs:infra:check` で Web build を先に行うようにした。
- SPA fallback は CloudFront custom error response ではなく CloudFront Function を default behavior にのみ関連付けた。これにより `api/*` と `ws/*` の 403/404 を HTML に置き換えない。
- 実 AWS deploy はこの作業環境では実行していないため、CloudFront 実 URL の 200 確認は未検証として扱う。

## 4. 実施した作業

- `Distribution` に `defaultRootObject: "index.html"` を追加した。
- CloudFront Function で拡張子なし SPA パスを `/index.html` に rewrite するようにした。
- `BucketDeployment` で `apps/web/dist` を private S3 site bucket に配置し、`distributionPaths: ["/*"]` による invalidation を追加した。
- `SiteBucketName`、`DistributionId`、`DistributionDomainName` の CDK outputs を追加した。
- infra test に root object、rewrite association、BucketDeployment、outputs、API/WS behavior 非関連付けの検証を追加した。
- generated infra docs と README の CI/CD 説明を更新した。

## 5. 成果物

| 成果物 | 形式 | 内容 | 指示との対応 |
|---|---|---|---|
| `infra/lib/hirameki-relay-stack.ts` | TypeScript | SPA 配信と S3 deploy を CDK に追加 | R1-R4 |
| `infra/test/hirameki-relay-stack.test.ts` | TypeScript | CDK template assertion を追加 | R1-R5 |
| `infra/package.json` | JSON | Web build 前提の synth/test/docs scripts に更新 | R2 |
| `docs/infra/resource-inventory.*` | Markdown/JSON | CDK 生成 docs 更新 | R5 |
| `README.md` | Markdown | deploy workflow 説明更新 | R5 |
| `tasks/done/20260517-1241-cdk-site-deploy.md` | Markdown | 受け入れ条件と RCA 要約、PR コメント結果 | workflow |

## 5.1 PR 操作

- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/3
- 受け入れ条件確認コメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/3#issuecomment-4469244738
- セルフレビューコメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/3#issuecomment-4469245371
- GitHub Apps での PR 作成・コメント投稿は `Resource not accessible by integration` で 403 だったため、代替として `gh` を使用した。

## 6. 指示へのfit評価

| 評価軸 | 評価 | 理由 |
|---|---:|---|
| 指示網羅性 | 5 | S3 deploy を CDK に寄せ、root object と invalidation も含めた |
| 制約遵守 | 5 | task md、検証、未実施事項の明記を行った |
| 成果物品質 | 4 | 実 AWS deploy は未実施だが、CDK synth/test で構成は確認した |
| 説明責任 | 5 | 採用判断と未検証範囲を記録した |
| 検収容易性 | 5 | assertion と generated docs で確認しやすくした |

総合fit: 4.8 / 5.0（約96%）

理由: 主要要件は満たした。実 AWS 環境への deploy と CloudFront 実 URL の確認は、この作業では実行していないため満点ではない。

## 7. 実行した検証

- `npm run typecheck -w @hirameki-relay/infra`: pass
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run docs:infra`: pass
- `npm run cdk:synth`: pass
- `npm run docs:infra:check`: sandbox 内では `tsx` の IPC pipe listen が `EPERM` で失敗。ユーザー承認後に `require_escalated` で再実行して pass
- `git diff --check`: pass

## 8. 未対応・制約・リスク

- 未対応: 実 AWS への `cdk deploy` は実行していない。
- 未対応: CloudFront 実 URL の `/`、`/index.html`、`/room/...` の HTTP ステータス確認は未実施。
- 制約: `npm ci` 後に `npm audit` が 5 moderate vulnerabilities を報告したが、今回の修正範囲外のため依存更新は行っていない。
- 制約: GitHub Apps での PR 作成・コメント投稿は 403 のため実行できず、代替として `gh` を使用した。
- リスク: `BucketDeployment` により custom resource Lambda と IAM policy が増える。CDK deploy role には S3 asset publish、S3 write、CloudFront invalidation の実行権限が必要。
