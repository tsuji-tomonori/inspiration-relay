# WebSocket ルーム参加通知修正

- 状態: do
- タスク種別: 修正
- 作成日時: 2026-05-17 13:38 JST
- ブランチ: `codex/fix-websocket-room-updates`

## 背景

ホストまたは先に入室したユーザーが、後からチームに参加したユーザーを検知できず、3人以上になってもゲームを開始できない。

ユーザーから、参加検知は polling ではなく WebSocket を通じてチーム参加者へ通知すべきと指定された。

## 目的

ルーム参加イベントを WebSocket で同じルームの既存接続へ通知し、Web UI が通知を契機に最新 snapshot を取得してプレイヤー一覧と開始可能状態を更新できるようにする。

## スコープ

- WebSocket ticket の発行・検証・接続保存
- ルーム参加時の WebSocket 通知
- Web UI の WebSocket 接続・通知受信・snapshot 更新
- 必要な CDK IAM / 環境変数 / docs / test の更新

## なぜなぜ分析サマリ

### 問題文

ルーム作成者や既存参加者の画面が、後から参加したユーザーをリロードなしで検知できないため、参加人数が実際には3人以上でも画面上の `snapshot.players` が古く、ホストがゲームを開始できない。

### 確認済み事実

- Web UI は session 復帰時と操作実行時に REST snapshot を取得するが、他ユーザーの join を購読していない。
- API の `joinRoom()` は参加者を保存するが、既存参加者へ通知していない。
- `wsTicket()` は ticket 文字列を返すのみで、ticket と room/player の紐付けを保存していない。
- WebSocket handler は `$connect` で ticket 存在のみを確認し、connection を room に登録していない。

### 推定原因

- リアルタイム同期経路が未実装のため、他クライアントで起きた room state 変更が既存画面へ伝播していない。

### 未確認事項

- 実 AWS 環境の WebSocket callback endpoint での送信確認。

### 根本原因

- WebSocket API は CDK 上で存在するが、ticket 検証、connection 登録、room 単位の通知、クライアント購読が実装されておらず、REST 操作結果が操作したクライアントにしか反映されない設計になっていた。

### 対策方針

- ticket を room/player と紐付けて保存し、`$connect` で検証した connection を room に登録する。
- `joinRoom()` 成功後、同じ room の接続へ `room.snapshot.updated` を通知する。
- Web UI は通知を受けたら認可済み REST snapshot を再取得する。

## 実施計画

1. 既存 store/service/ws-handler/infra/web の構造を確認する。
2. room ticket / connection の repository 操作を追加する。
3. WebSocket handler と broadcaster を実装する。
4. `joinRoom()` から room update 通知を送る。
5. Web UI に WebSocket 接続と通知受信時の snapshot refresh を追加する。
6. API/Web/infra tests と generated docs を更新する。
7. 検証、作業レポート、commit、PR、PR コメントを完了する。

## ドキュメント保守計画

- API response または OpenAPI 説明が変わる場合は API docs を再生成する。
- CDK resource / IAM / env が変わる場合は infra docs を再生成する。
- README の恒久更新が必要か確認し、不要なら作業レポートに理由を記録する。

## 受け入れ条件

- [ ] 後からユーザーが参加したとき、同じルームの既存 WebSocket 接続へ通知される。
- [ ] 通知 payload が room を識別でき、クライアントが最新 snapshot を取得できる。
- [ ] Web UI が WebSocket 通知を受けてプレイヤー一覧を更新する。
- [ ] ホスト画面で3人以上になったら開始ボタンがリロードなしで有効になる。
- [ ] WebSocket ticket と connection が認可済み player / room に紐付く。
- [ ] 関連する API/Web/infra 検証が pass している。
- [ ] 実施内容と制約を `reports/working/` に記録している。

## 検証計画

- API service / route tests
- Web typecheck / build / test
- Infra CDK tests
- generated docs check
- `git diff --check`

## PR レビュー観点

- WebSocket ticket が任意 room の購読に使えないこと。
- 通知 payload に player token / host token などの機微情報を含めないこと。
- stale / expired connection が通知失敗時に掃除されること。
- production UI に mock の参加者や固定人数を表示しないこと。

## リスク

- 実 AWS の WebSocket Management API 送信はローカル unit test では完全には再現できないため、デプロイ後の smoke 確認が必要になる可能性がある。

## 実施結果

- `apps/api/src/realtime.ts` を追加し、WebSocket ticket、room connection、room update broadcast を実装。
- `apps/api/src/store.ts` に DynamoDB-backed room repository を追加し、デプロイ環境では `GAME_TABLE_NAME` を使って room state を共有永続化するようにした。
- `apps/api/src/service.ts` で `joinRoom()` 成功後に `room.snapshot.updated` / `player.joined` 通知を送るようにした。
- `apps/api/src/ws-handler.ts` で `$connect` が ticket を消費して connection を room/player に紐付け、`$disconnect` で削除するようにした。
- `apps/web/src/App.tsx` と `apps/web/src/api.ts` で WebSocket ticket 発行、接続、通知受信時の REST snapshot refresh を実装。
- `infra/lib/hirameki-relay-stack.ts` で API Lambda に WebSocket client URL、Management API endpoint、`execute-api:ManageConnections` 権限を追加。
- README、UI spec、infra inventory を更新。

## 検証結果

- `npm run test -w @hirameki-relay/api`: pass
- `npm run typecheck --workspaces --if-present`: pass
- `npm run test -w @hirameki-relay/web`: pass（テストファイルなし、`--passWithNoTests`）
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run test --workspaces --if-present`: pass
- `npm run build --workspaces --if-present`: pass
- `npm run docs:check`: pass
- `git diff --check`: pass

## セキュリティ・認可レビュー

- `/api/v1/rooms/{roomId}/ws-ticket` は既存どおり `Guest <playerToken>` を要求し、ticket は認可済み player / room と紐付けて保存する。
- WebSocket `$connect` は短時間 ticket を 1 回だけ消費し、任意 room の購読には使えない。
- 通知 payload は `type`, `roomId`, `reason`, `occurredAt` のみで、`playerToken`、`hostToken`、回答、非公開ヒントなどは含めない。
- API Lambda の Management API 権限は対象 WebSocket API の `@connections/*` に限定される。
- 本番 UI は API snapshot の実データだけを表示し、mock 参加者や固定人数 fallback は追加していない。
