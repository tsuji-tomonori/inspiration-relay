# Lambda handler 設定エラー修正

- 状態: done
- タスク種別: 修正
- 作成日時: 2026-05-17 13:18 JST
- ブランチ: `codex/fix-lambda-handler`
- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/4

## 背景

AWS Lambda 実行時に以下の例外が発生している。

```text
Runtime.MalformedHandlerName: Bad handler
at _splitHandlerString (file:///var/runtime/index.mjs:1080:15)
```

## 目的

Lambda の handler 指定が Node.js ランタイムで解釈できる形式になるように修正し、同種の設定ミスが検証で検出できる状態にする。

## スコープ

- Lambda handler に関係する CDK / infra 設定の確認と修正
- 必要に応じたテスト期待値の更新
- 最小十分な検証の実行
- 作業完了レポートの作成

## なぜなぜ分析サマリ

### 問題文

2026-05-17T04:13:38.923Z に、デプロイ済み Lambda が起動時点で `Runtime.MalformedHandlerName: Bad handler` を出し、ユーザー関数ロード前に失敗している。

### 確認済み事実

- エラーログは Node.js Lambda ランタイムの handler 文字列分割処理 `_splitHandlerString` で失敗している。
- `Runtime.MalformedHandlerName` は、handler 文字列がランタイムの期待形式から外れている場合に発生する。
- `infra/lib/hirameki-relay-stack.ts` の `ApiFunction` は `handler: "handler"` を指定していた。
- `apps/api/src/handler.ts` は `export const handler = handle(app);` を公開している。
- WebSocket Lambda の handler は `ws-handler.connectHandler` など `file.export` 形式だった。

### 推定原因

- API Lambda の CDK handler 指定が `handler` だけで、Node.js Lambda runtime が要求する `file.export` 形式になっていなかった。

### 未確認事項

- 実 AWS 環境への再デプロイ後に CloudWatch で同エラーが消えること。

### 根本原因候補

- デプロイ設定で Node.js Lambda handler の必須形式を満たすテストが不足していたため、`handler` 単体の不正値が CDK test で検出されなかった。

### 対策方針

- CDK 定義の API Lambda handler 値を `handler.handler` に修正する。
- infra test で API / WebSocket Lambda の handler 値を検証し、再発を防ぐ。

## 実施計画

1. Lambda handler 定義と実装 export を確認する。
2. 原因を確認したうえで CDK / infra 設定を修正する。
3. 必要な infra test を追加または更新する。
4. 差分に応じた検証を実行する。
5. 作業レポートを `reports/working/` に作成する。

## ドキュメント保守計画

- デプロイ手順や環境変数の変更がない場合、README / docs の恒久更新は不要とする。
- 運用上の注意として残すべき内容があれば作業レポートに記録する。

## 受け入れ条件

- [x] Lambda handler が Node.js ランタイムの期待する `file.export` 形式で定義されている。
- [x] 対象 handler の export 名と CDK 設定が一致している。
- [x] infra test または同等の検証で handler 設定が確認できる。
- [x] 関連する最小十分な検証が pass している。
- [x] 実施内容と制約を `reports/working/` に記録している。

## 実施結果

- `infra/lib/hirameki-relay-stack.ts` の `ApiFunction` handler を `handler.handler` に修正。
- `infra/test/hirameki-relay-stack.test.ts` に Node.js Lambda handler 設定の検証を追加。
- `docs/infra/resource-inventory.json` と `docs/infra/resource-inventory.md` を再生成。

## 検証結果

- `npm run test -w @hirameki-relay/infra`: pass
- `npm run docs:infra -w @hirameki-relay/infra`: pass
- `npm run docs:infra:check -w @hirameki-relay/infra`: pass
- `git diff --check`: pass

## PR コメント結果

- 受け入れ条件確認コメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/4#issuecomment-4469317858
- セルフレビューコメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/4#issuecomment-4469318919
- GitHub Apps コメント投稿は 403 で失敗したため、`gh pr comment` にフォールバックした。

## 検証計画

- `git diff --check`
- 変更範囲に応じた infra test または TypeScript build/test

## PR レビュー観点

- `handler` が `handler` だけ、空文字、拡張子付き不正形式などになっていないこと。
- 実装 export と CDK 設定が同期していること。
- テストが runtime 起動前の設定ミスを検出できること。

## リスク

- 実環境デプロイや CloudWatch 再確認は、この作業範囲では実施しない可能性がある。
