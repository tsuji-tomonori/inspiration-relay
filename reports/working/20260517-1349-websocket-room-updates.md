# 作業完了レポート

保存先: `reports/working/20260517-1349-websocket-room-updates.md`

## 1. 受けた指示

- 主な依頼: 後からチームに参加したユーザーをホストや既存参加者が検知できずゲームを開始できない問題を直す。
- 追加条件: ユーザー追加は polling ではなく WebSocket を通じてチーム参加者へ通知する。
- 対象: API、WebSocket handler、Web UI、infra、関連 docs / tests。

## 2. 要件整理

| 要件ID | 指示・要件 | 重要度 | 対応状況 |
|---|---|---:|---|
| R1 | 後続参加者を WebSocket で既存メンバーへ通知する | 高 | 対応 |
| R2 | 通知を受けた UI が最新 snapshot を反映する | 高 | 対応 |
| R3 | 3人以上でホストの開始ボタンがリロードなしに有効になる | 高 | 対応 |
| R4 | ticket / connection を認可済み room / player に紐付ける | 高 | 対応 |
| R5 | デプロイ環境で共有状態を読む | 高 | 対応 |
| R6 | 関連 test / build / docs check を通す | 高 | 対応 |

## 3. 検討・判断したこと

- WebSocket では snapshot 全体ではなく `room.snapshot.updated` 通知だけを送り、クライアントは既存の認可済み REST snapshot を再取得する方針にした。これにより token や秘匿情報を通知 payload に載せない。
- `wsTicket()` は ticket 文字列だけでは不十分なため、ticket hash と room/player/expiresAt を `ConnectionTable` に保存するようにした。
- `$connect` は ticket を 1 回だけ消費して connection を room/player に登録するようにした。
- WebSocket 通知後の snapshot refresh が Lambda メモリに依存するとデプロイ環境で不安定なため、既存の `GameTable` を使う DynamoDB-backed room repository も追加した。
- 通知失敗は join 自体を壊さないようにログ化し、切断済み connection は Management API の 410 を契機に削除する設計にした。

## 4. 実施作業

- `apps/api/src/realtime.ts` を追加し、Memory / DynamoDB realtime repository と API Gateway broadcaster を実装。
- `apps/api/src/store.ts` に DynamoDB room repository と env-based repository factory を追加。
- `apps/api/src/app.ts` で room repository、realtime repository、broadcaster を env から構築するように変更。
- `apps/api/src/service.ts` で WebSocket ticket 保存と join 後の room update 通知を実装。
- `apps/api/src/ws-handler.ts` で ticket 検証、connection 登録、disconnect cleanup を実装。
- `apps/web/src/api.ts` と `apps/web/src/App.tsx` で WebSocket 接続、再接続、通知受信時の snapshot refresh を実装。
- `infra/lib/hirameki-relay-stack.ts` で API Lambda の WebSocket URL / Management endpoint / ManageConnections 権限を追加。
- API / infra tests と README、UI spec、infra inventory を更新。

## 5. 成果物

| 成果物 | 形式 | 内容 | 指示との対応 |
|---|---|---|---|
| `apps/api/src/realtime.ts` | TypeScript | ticket / connection / broadcast 実装 | R1, R4 |
| `apps/api/src/store.ts` | TypeScript | DynamoDB room state persistence | R5 |
| `apps/api/src/service.ts` | TypeScript | join 後の WebSocket 通知 | R1 |
| `apps/api/src/ws-handler.ts` | TypeScript | `$connect` / `$disconnect` の接続管理 | R4 |
| `apps/web/src/App.tsx` | TSX | WebSocket 通知受信時の snapshot refresh | R2, R3 |
| `infra/lib/hirameki-relay-stack.ts` | TypeScript | Management API endpoint / IAM 権限 | R1 |
| `reports/working/20260517-1349-websocket-room-updates.md` | Markdown | 作業完了レポート | R6 |

## 6. 実行した検証

- `npm run test -w @hirameki-relay/api`: pass
- `npm run typecheck --workspaces --if-present`: pass
- `npm run test -w @hirameki-relay/web`: pass（テストファイルなし、`--passWithNoTests`）
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run test --workspaces --if-present`: pass
- `npm run build --workspaces --if-present`: pass
- `npm run docs:check`: pass
- `git diff --check`: pass

## 7. 未対応・制約・リスク

- 実 AWS 環境での WebSocket Management API 送信と複数ブラウザでの smoke 確認は未実施。
- `npm install` / `npm ci` 系の実行で moderate 脆弱性 5 件が報告されたが、今回の WebSocket 通知修正とは別件のため未対応。
- Web UI の dedicated component test は既存構成に無く、`apps/web` は `--passWithNoTests` の確認に留まる。型チェックと build は通過済み。

## 8. Fit 評価

総合fit: 4.6 / 5.0（約92%）

理由: WebSocket 通知、認可済み ticket / connection 管理、UI refresh、DynamoDB 共有状態、infra 権限、検証を実装した。実 AWS での WebSocket smoke 確認は未実施のため満点ではない。
