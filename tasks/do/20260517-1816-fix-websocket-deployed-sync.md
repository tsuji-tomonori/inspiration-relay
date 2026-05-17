# デプロイ環境 WebSocket 参加同期修正

- 状態: do
- タスク種別: 修正
- 作成日時: 2026-05-17 18:16 JST
- ブランチ: `codex/fix-websocket-deployed-sync`
- 対象 commit: `e898ef0`

## 背景

`e898ef0` をデプロイ後も、後からチームに入ったユーザーをホストや最初の参加者が検知できず、ゲームを開始できない事象が継続している。

ユーザーから、参加成功後に同じ `roomId` の WebSocket 接続へ軽量通知を配り、クライアントが認可付き snapshot を取り直す方式を維持したうえで修正するよう指示された。

## 目的

デプロイ環境で既存参加者の WebSocket 接続が確実に確立し、通知取りこぼし時にも接続・再接続時の snapshot refresh で最新状態へ追いつけるようにする。

## スコープ

- WebSocket 接続 URL の本番経路修正
- WebSocket open / reconnect 時の snapshot refresh
- join 後 broadcast 経路と WebSocket URL のテスト補強
- infra generated docs / README / work report の更新

## なぜなぜ分析サマリ

### 問題文

デプロイ済み環境で、後続ユーザーが join しても既存参加者の画面がリロードなしで更新されず、`snapshot.players.length` が古いままのためホストがゲームを開始できない。

### 確認済み事実

- `e898ef0` には `joinRoom()` 保存後の `notifyRoomUpdated(roomId, "player.joined")` が入っている。
- `e898ef0` の Web UI は `room.snapshot.updated` message 受信時に snapshot を再取得する。
- `e898ef0` の CDK は `WEBSOCKET_URL` を `/ws/v1` に設定している。
- CloudFront の `ws/*` behavior は WebSocket API origin に `originPath: "/v1"` を設定している。
- CloudFront は origin path と viewer path を連結するため、viewer が `/ws/v1?ticket=...` へ接続すると origin 側 path が `/v1/ws/v1` になり得る。
- Web UI は WebSocket `open` 時には snapshot を再取得していないため、作成直後の接続確立前に join 通知が発生すると取りこぼし後に追いつけない。

### 推定原因

- 本番で返している `wsUrl: /ws/v1?...` が CloudFront 経由で WebSocket API stage へ正しい path として届かず、既存参加者の connection が保存されていない可能性が高い。
- 接続が遅れて成立した場合にも、`open` 時 refresh が無いため最新 snapshot に追いつけない。

### 未確認事項

- 実ブラウザ DevTools で `/ws/v1?ticket=...` が `101 Switching Protocols` になっているか。
- CloudWatch 上で `$connect` handler が呼ばれているか。

### 根本原因候補

- CloudFront `/ws/*` と WebSocket API stage の path 変換を前提にした相対 `WEBSOCKET_URL` が、本番接続 URL として不安定だった。
- WebSocket 通知のみで同期し、WebSocket open / reconnect 時の状態再取得が不足していた。

### 対策方針

- `ws-ticket` が返す `wsUrl` を API Gateway WebSocket stage の直接 URL にし、CloudFront path rewrite 依存を避ける。
- WebSocket `open` 時にも snapshot を再取得し、接続確立前に発生した join 通知を取りこぼしても最新状態へ追いつく。
- API / Web / infra tests で URL と refresh 動作の期待を固定する。

## 実施計画

1. 現行の `App.tsx`, `service.ts`, `infra/lib` と tests を確認する。
2. CDK の `WEBSOCKET_URL` を直接 `websocketStage.url` に変更する。
3. WebSocket `open` handler で snapshot refresh を実行する。
4. API / Web / infra tests を追加・更新する。
5. docs / generated infra inventory を同期する。
6. 検証、作業レポート、commit、PR、PR コメントを完了する。

## ドキュメント保守計画

- README または UI spec に必要な補足があれば更新する。
- CDK env 変更に伴い `docs/infra/resource-inventory.*` を再生成する。

## 受け入れ条件

- [x] `ws-ticket` の `wsUrl` が WebSocket API stage へ直接接続できる URL になる。
- [x] WebSocket `open` 時に snapshot を再取得する。
- [x] `room.snapshot.updated` message 受信時の snapshot 再取得は維持される。
- [x] join 後の `player.joined` broadcast 経路がテストで確認されている。
- [x] CloudFront `/ws/*` path 依存のリスクが PR / report に記録されている。
- [x] 関連する API/Web/infra 検証が pass している。
- [x] 実施内容と制約を `reports/working/` に記録している。

## 検証計画

- `npm run test -w @hirameki-relay/api`
- `npm run typecheck --workspaces --if-present`
- `npm run test -w @hirameki-relay/web`
- `npm run test -w @hirameki-relay/infra`
- `npm run build --workspaces --if-present`
- `npm run docs:check`
- `git diff --check`

## PR レビュー観点

- WebSocket URL に `playerToken` / `hostToken` が含まれないこと。
- WebSocket で full snapshot を配らず、認可付き REST snapshot を取り直す設計が維持されること。
- open 時 refresh で通知取りこぼしに追いつけること。
- `execute-api:ManageConnections` 権限が対象 WebSocket API に限定されていること。

## リスク

- 実 AWS 環境での WebSocket `101` と複数ブラウザ smoke はローカルテストだけでは確認できない。

## 実施結果

- `WEBSOCKET_URL` を CloudFront 相対 path `/ws/v1` から API Gateway WebSocket stage URL に変更した。
- WebSocket `open` handler で `refreshSnapshot(session)` を実行するようにした。
- `wsTicket` の stage URL 取り扱いと、CDK の `WEBSOCKET_URL` が `/ws/v1` ではないことをテストで固定した。
- `README.md`, `docs/ui-spec/hirameki-relay-mvp.md`, `docs/infra/resource-inventory.*` を更新した。
- 作業レポート: `reports/working/20260517-1820-websocket-deployed-sync.md`

## 検証結果

- `npm ci`: pass
  - 既存の `5 moderate severity vulnerabilities` 表示あり。今回の修正範囲では未対応。
- `npm run test -w @hirameki-relay/api`: pass
- `npm run test -w @hirameki-relay/infra`: pass
- `npm run typecheck --workspaces --if-present`: pass
- `npm run docs:infra -w @hirameki-relay/infra`: pass
- `npm run docs:check`: pass
- `npm run test --workspaces --if-present`: pass
- `npm run build --workspaces --if-present`: pass
- `git diff --check`: pass
