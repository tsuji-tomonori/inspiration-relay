# 作業完了レポート

保存先: `reports/working/20260517-1320-fix-lambda-handler.md`

## 1. 受けた指示

- 主な依頼: AWS Lambda の `Runtime.MalformedHandlerName: Bad handler` エラーを解消する。
- 対象ログ: 2026-05-17T04:13:38.923Z の Node.js Lambda runtime 起動時例外。
- 条件: リポジトリルールに従い、task md、検証、レポートを残す。

## 2. 要件整理

| 要件ID | 指示・要件 | 重要度 | 対応状況 |
|---|---|---:|---|
| R1 | Lambda handler 設定エラーの原因を特定する | 高 | 対応 |
| R2 | `Bad handler` を解消する修正を入れる | 高 | 対応 |
| R3 | 再発検出のための検証を追加する | 高 | 対応 |
| R4 | 関連 docs を実装と同期する | 中 | 対応 |
| R5 | 最小十分な検証を実行する | 高 | 対応 |

## 3. 検討・判断したこと

- Node.js Lambda の handler は `file.export` 形式が必要で、`ApiFunction` の `handler: "handler"` はランタイムが分割できないため `Runtime.MalformedHandlerName` の直接原因になる。
- `apps/api/src/handler.ts` は `export const handler = handle(app);` を公開しているため、CDK 側は `handler.handler` が正しい。
- WebSocket 側は `ws-handler.connectHandler` など既に `file.export` 形式だったため、API Lambda のみを修正対象にした。
- `docs/infra/resource-inventory.*` は生成済み infra inventory で handler 値を保持しているため、修正後に再生成した。

## 4. 実施作業

- `infra/lib/hirameki-relay-stack.ts` の `ApiFunction` handler を `handler.handler` に変更。
- `infra/test/hirameki-relay-stack.test.ts` に Node.js Lambda handler 名の検証を追加。
- `docs/infra/resource-inventory.json` と `docs/infra/resource-inventory.md` を再生成。
- `tasks/do/20260517-1318-fix-lambda-handler.md` を作成し、受け入れ条件と RCA を記録。

## 5. 成果物

| 成果物 | 形式 | 内容 | 指示との対応 |
|---|---|---|---|
| `infra/lib/hirameki-relay-stack.ts` | TypeScript | API Lambda handler を `handler.handler` に修正 | R2 |
| `infra/test/hirameki-relay-stack.test.ts` | TypeScript test | handler 設定の再発検出テスト | R3 |
| `docs/infra/resource-inventory.*` | Markdown / JSON | 生成済み infra inventory の同期 | R4 |
| `reports/working/20260517-1320-fix-lambda-handler.md` | Markdown | 作業完了レポート | R5 |

## 6. 実行した検証

- `npm run test -w @hirameki-relay/infra`: pass
- `npm run docs:infra -w @hirameki-relay/infra`: pass
- `npm run docs:infra:check -w @hirameki-relay/infra`: pass
- `git diff --check`: pass

## 7. 未対応・制約・リスク

- 実 AWS 環境への再デプロイと CloudWatch での再発確認は、このローカル修正範囲では未実施。
- `npm ci` 実行時に moderate 脆弱性 5 件が報告されたが、今回の handler 修正とは別件のため未対応。
- `.pre-commit-config.yaml` はこの worktree の `origin/main` には存在しないため、pre-commit は未実施。

## 8. Fit 評価

総合fit: 4.7 / 5.0（約94%）

理由: handler 設定の直接原因を修正し、infra test と生成 docs check まで確認した。実環境への再デプロイ確認は未実施のため満点ではない。
