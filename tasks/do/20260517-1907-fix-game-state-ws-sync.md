# ゲーム状態変更 WebSocket 同期修正

- 状態: do
- タスク種別: 修正
- 作成日時: 2026-05-17 19:07 JST
- ブランチ: `codex/fix-ws-game-sync`

## 背景

ゲーム開始後にホスト本人の画面だけが進み、非ホストがロビー表示に残る。ユーザーから、状態変更後は WebSocket で `room.snapshot.updated` を全員へ通知し、各クライアントが自分用 snapshot を再取得するモデルに統一する方針が示された。

## 目的

ゲーム開始、ヒント投稿、回答、skip、次ラウンドなどの room state 変更を、操作した本人以外の接続にも通知し、秘匿情報を含まない snapshot 再取得モデルで全員の画面を同期する。

## スコープ

- `RoomUpdateReason` の状態変更 reason 追加
- `GameService` の状態変更後 broadcast 追加
- ホスト権限と回答者/ヒント役 role の分離
- Web UI の操作可否判定を snapshot permissions / role に合わせる
- 関連 unit test / typecheck / docs check

## なぜなぜ分析サマリ

### 問題文

ホストがゲームを開始しても、非ホストの Web UI が WebSocket 経由で状態変更を検知できず、最新 snapshot を再取得しないため、ロビー表示のまま残る。

### 確認済み事実

- `joinRoom()` は保存後に `notifyRoomUpdated(roomId, "player.joined")` を呼ぶ。
- `startGame()`、`submitHint()`、`submitAnswer()`、`skipAnswer()`、`nextRound()` は room state を保存するが `notifyRoomUpdated()` を呼んでいない。
- `RoomUpdateReason` は `"player.joined"` だけを許容している。
- Web UI は `room.snapshot.updated` を受けたときに REST snapshot を再取得する設計になっている。
- `buildSnapshot()` は `viewer.isHost` を `answerer` より優先して `viewerRole: "host"` を返す。
- `AnswerScreen` は `viewerRole === "host"` でも回答 UI を表示する。

### 推定原因

- リアルタイム同期の実装が参加通知に限定され、ゲーム進行に伴う状態変更へ水平展開されていない。
- 権限概念である host とゲーム内役割である answerer/hinter が `viewerRole` に混在している。

### 未確認事項

- 実 AWS WebSocket Management API での end-to-end 同期はローカル unit test では完全には確認できない。

### 根本原因

- state mutation と room update broadcast の対応関係がサービス層で一貫しておらず、操作レスポンス以外のクライアントが状態変更を知る経路が不足していた。
- snapshot schema が操作権限を明示せず、UI が `host` role をゲーム上の回答者判定に流用できる形になっていた。

### 対策方針

- 全状態変更メソッドで保存後に `room.snapshot.updated` を送る。
- 通知 payload は reason のみに留め、各クライアントが認可済み REST snapshot を取り直す。
- snapshot に `permissions` を追加し、host 権限と `viewerRole` を分離する。

## 実施計画

1. 既存 service / realtime / shared / web / tests / docs の関連箇所を確認する。
2. `RoomUpdateReason` と snapshot permissions 型を追加する。
3. `GameService` の各 state mutation 後に適切な reason で broadcast する。
4. `viewerRole` を answerer / hinter / spectator 中心に修正し、操作権限は `permissions` へ移す。
5. Web UI の開始・回答・次ラウンド可否を `permissions` で判定する。
6. API tests を追加・更新し、generated API docs を同期する。
7. 選定した検証を実行し、作業レポートを残す。

## ドキュメント保守計画

- API snapshot schema に `permissions` を追加するため、OpenAPI 生成 docs を更新する。
- README / UI spec は恒久的な操作説明差分が必要か確認し、不要なら作業レポートに理由を記録する。

## 受け入れ条件

- [ ] 3人接続済みでホストが開始すると、`game.started` reason の `room.snapshot.updated` が broadcast される。
- [ ] ヒント投稿時に `hint.submitted` または `answering.started` reason の更新通知が broadcast される。
- [ ] 不正解・skip 時に `hint.revealed`、結果確定時に `round.result` reason の更新通知が broadcast される。
- [ ] 次ラウンド開始時に `round.started`、最終結果遷移時に `game.result` reason の更新通知が broadcast される。
- [ ] ホストが回答者のときもお題が非表示になり、回答 UI のみが有効になる。
- [ ] ホストが回答者でないときは回答 UI が有効にならない。
- [ ] フロントは `room.snapshot.updated` を受けて snapshot を再取得する既存モデルを維持する。
- [ ] 関連する API/Web/shared typecheck と API tests が pass している。
- [ ] 作業内容と未検証事項を `reports/working/` に記録している。

## 検証計画

- `npm run test -w @hirameki-relay/api`
- `npm run typecheck -w @hirameki-relay/api`
- `npm run typecheck -w @hirameki-relay/web`
- `npm run docs:api:check`
- `git diff --check`

## PR レビュー観点

- 通知 payload にお題、回答、token などの秘匿情報を含めていないこと。
- 状態変更ごとに reason が実際の遷移と一致していること。
- host 権限と answerer/hinter role が UI と snapshot の両方で分離されていること。
- generated docs が schema 変更と同期していること。

## リスク

- 実 AWS WebSocket 接続を使った複数ブラウザ E2E はローカル unit test だけでは代替できないため、PR では未検証事項として扱う。

## 実施結果

- `RoomUpdateReason` にゲーム進行用 reason を追加した。
- `startGame()`、`submitHint()`、`submitAnswer()`、`skipAnswer()`、`nextRound()` の保存後に `room.snapshot.updated` broadcast を追加した。
- `viewerRole` から `host` を外し、`answerer` / `hinter` / `spectator` / `unknown` に整理した。
- `RoomSnapshot.permissions` を追加し、開始、次ラウンド、回答、ヒント投稿の可否をサーバー snapshot で返すようにした。
- Web UI は開始、ヒント、回答、次ラウンドの可否を `snapshot.permissions` で判定するようにした。
- OpenAPI 生成元と生成 docs を `RoomPermissions` 追加に合わせて更新した。

## 検証結果

- `npm ci`: pass
- `npm run docs:api`: pass
- `npm run test -w @hirameki-relay/api`: pass
- `npm run typecheck -w @hirameki-relay/api`: pass
- `npm run typecheck -w @hirameki-relay/web`: pass
- `npm run typecheck -w @hirameki-relay/shared`: pass
- `npm run test -w @hirameki-relay/web`: pass（テストファイルなし、`--passWithNoTests`）
- `npm run docs:api:check`: pass。初回は sandbox の `/tmp/tsx-*` IPC pipe 作成で `EPERM` となったため、同一コマンドを承認付きで再実行。
- `npm run build --workspaces --if-present`: pass
- `git diff --check`: pass

## ドキュメント保守結果

- API schema 変更に伴い `docs/api/openapi.json` と `docs/api/openapi.md` を再生成した。
- README と UI spec は、既に WebSocket 通知で認可済み REST snapshot を再取得する方針を記載しているため、追加更新は不要と判断した。

## 未対応・制約

- WebSocket `$default` の command 実行化（`game.start` など）は今回の直接修正範囲外。既存 HTTP command から同じ `GameService` を通る経路で broadcast する修正を優先した。
- 実 AWS WebSocket 接続での複数クライアント E2E は未実施。
