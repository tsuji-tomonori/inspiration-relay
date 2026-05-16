# API・インフラ docs 自動生成と CI/CD 導入

状態: in_progress

## 背景

ユーザーから `https://github.com/tsuji-tomonori/rag-assist` にある API とインフラのドキュメント自動生成機能、および CI/CD をこのリポジトリへ取り入れる依頼を受けた。

## 目的

`hirameki-relay` の現行構成に合わせて、API ドキュメント、インフラ構成ドキュメント、GitHub Actions による検証・docs drift 検知・CDK synth を導入する。

## タスク種別

機能追加

## スコープ

- Hono API から OpenAPI JSON / Markdown を生成する仕組みを追加する。
- CDK stack からインフラ inventory Markdown / JSON を生成する仕組みを追加する。
- CI で lint 相当、typecheck、test、build、CDK synth、docs drift check を実行する workflow を追加する。
- README に自動生成 docs と CI/CD の運用手順を追記する。

## スコープ外

- 本番 AWS への自動 deploy 実行。
- 移植元 `rag-assist` の全 RAG / benchmark / deploy workflow の完全移植。
- GitHub Secrets や OIDC role の実アカウント設定。

## 実施計画

1. 移植元の OpenAPI docs / infra inventory / GitHub Actions 構成を確認する。
2. 移植先 API と CDK stack の現行構造を確認する。
3. 最小構成の docs 生成 scripts と npm scripts を追加する。
4. 生成済み docs をリポジトリに追加し、drift check ができる形にする。
5. GitHub Actions workflow を追加する。
6. README と作業レポートを更新する。
7. 選定した検証を実行し、失敗時は修正して再実行する。
8. commit / push / PR 作成 / PR コメント / task 完了更新まで進める。

## ドキュメント保守計画

- `README.md` に生成コマンド、CI/CD workflow、deploy の扱いを追記する。
- 自動生成成果物は `docs/api/` と `docs/infra/` に配置する。
- API や infra を変更した場合は docs 生成 check が CI で差分を検出する状態にする。

## 受け入れ条件

- [ ] API docs 生成コマンドで OpenAPI JSON と Markdown が生成される。
- [ ] infra docs 生成コマンドで CDK 構成の inventory JSON と Markdown が生成される。
- [ ] docs check コマンドで生成物の drift を検出できる。
- [ ] GitHub Actions workflow が CI と docs check と CDK synth を実行する。
- [ ] README にローカル実行手順と CI/CD の扱いが記載される。
- [ ] 関連する typecheck / test / build / docs check が pass する。
- [ ] 作業完了レポートを `reports/working/` に保存する。
- [ ] PR 作成後、受け入れ条件確認コメントとセルフレビューコメントを日本語で投稿する。

## 検証計画

- `npm run docs:api`
- `npm run docs:infra`
- `npm run docs:check`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run cdk:synth`
- `git diff --check`

## PR レビュー観点

- 生成 docs が実装から再生成可能で、手編集前提になっていないこと。
- CI が未生成 docs の drift を検出できること。
- deploy は AWS アカウントや secrets 未設定でも CI と分離されていること。
- API / infra の既存挙動を壊していないこと。

## リスク

- `rag-assist` の workflow は大規模なため、現行プロジェクトには必要最小限へ縮小して取り込む。
- GitHub Secrets / AWS OIDC はこの作業では設定できないため、deploy は手動 workflow として追加するか README に未設定条件を明記する。
