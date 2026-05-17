# WebSocket 参加同期のデプロイ環境向け修正レポート

## 受けた指示

- `e898ef0` をデプロイしても、後続参加者をホストや先行参加者が検知できずゲーム開始できない事象が継続しているため修正する。
- join 成功後は同じ `roomId` の WebSocket 接続へ `room.snapshot.updated` の軽量通知を送り、各クライアントが認可付き REST snapshot を取り直す設計を維持する。
- 追加対策として WebSocket open / reconnect 時にも snapshot を再取得する。

## 要件整理

- WebSocket では full snapshot を配らず、更新通知のみ送る。
- `joinRoom` の保存後 broadcast 経路は維持し、`player.joined` 通知を配信する。
- 既存参加者の WebSocket 接続が本番で確立できる URL を返す。
- 通知取りこぼし時も再接続時の snapshot 再取得で最新状態へ追いつく。

## 検討・判断

- `joinRoom()` は `saveRoomState` 後に `notifyRoomUpdated(roomId, "player.joined")` を呼ぶ実装になっていた。
- UI も `room.snapshot.updated` message 受信時に snapshot を再取得していた。
- 一方で CDK は `WEBSOCKET_URL` を `/ws/v1` としており、CloudFront `ws/*` behavior の `originPath: "/v1"` と viewer path が連結されると、WebSocket API stage に `/v1/ws/v1` として届く可能性がある。
- そのため、`ws-ticket` では CloudFront path rewrite に依存せず、API Gateway WebSocket stage URL を直接返す方針にした。
- さらに WebSocket `open` 時に snapshot を再取得し、接続確立前に発生した join 通知の取りこぼしに追いつけるようにした。

## 実施作業

- `infra/lib/hirameki-relay-stack.ts`
  - `WEBSOCKET_URL` を `/ws/v1` から `websocketStage.url` に変更。
- `apps/web/src/App.tsx`
  - WebSocket `open` handler で `refreshSnapshot(session)` を実行。
- `apps/api/src/app.test.ts`
  - `wsTicket` が設定済み WebSocket stage URL を維持して ticket query を付与するテストを追加。
- `infra/test/hirameki-relay-stack.test.ts`
  - API Lambda の `WEBSOCKET_URL` が `/ws/v1` ではなく WebSocket API stage 由来であることを検証。
- `README.md`, `docs/ui-spec/hirameki-relay-mvp.md`
  - WebSocket stage 直接 URL と open/reconnect refresh の設計を追記。
- `docs/infra/resource-inventory.*`
  - infra docs を再生成。

## 検証

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

## 成果物

- WebSocket ticket が API Gateway WebSocket stage の直接 URL を返すようになった。
- WebSocket open / reconnect 時に最新 snapshot を取得するようになった。
- join 後 broadcast の軽量通知設計と、認可付き REST snapshot 再取得設計を維持した。

## Fit 評価

- ユーザー指定の最小修正である「join 後 `player.joined` broadcast を動かす」「フロントで message/open/reconnect 時に snapshot を取り直す」に対し、既存 broadcast 経路は維持しつつ、本番で接続が保存されない可能性が高い CloudFront `/ws/v1` 依存を外した。
- `room.snapshot.updated` は軽量通知のままで、full snapshot は WebSocket に流していない。

## 未対応・制約・リスク

- 実 AWS 環境の DevTools で WebSocket が `101 Switching Protocols` になること、複数ブラウザで `2 / 6`、`3 / 6` に更新されることは、このローカル作業では未確認。
- CloudFront の `/ws/*` behavior は残っているが、今回の client ticket URL では使用しない。
