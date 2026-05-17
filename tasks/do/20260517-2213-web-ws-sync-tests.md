# Web WebSocket 同期単体テスト追加

- 状態: doing
- タスク種別: 機能追加
- 作成日時: 2026-05-17 22:13 JST
- ブランチ: `codex/web-ws-sync-tests`

## 背景

「ホスト以外がゲーム開始を検知できない」再発防止として、Web クライアントが `room.snapshot.updated` を受信したときに snapshot を再取得し、非ホスト画面も最新状態へ遷移することを単体テストで固定する。

## 目的

Web 側に最初に必要な単体テストを追加し、`reason: "game.started"` の WebSocket 通知で同一 room の snapshot を再取得する設計を維持できるようにする。

## スコープ

- `apps/web` の Vitest / React component test 環境整備
- WebSocket URL resolver / message parser の単体テスト
- App の WebSocket 同期テスト
- 必要最小限の testability 改善

## 実施計画

1. `App.tsx` の WebSocket parser / URL resolver / session 初期化箇所を確認する。
2. React component test に必要な devDependencies と Vitest 設定を追加する。
3. parser / URL resolver を単体テスト可能な形へ最小限切り出す。
4. `room.snapshot.updated(reason: "game.started")` 受信で snapshot 再取得する App テストを追加する。
5. 別 roomId 通知を無視する App テストを追加する。
6. 非ホストが Lobby から HINT_SUBMITTING 画面へ遷移するテストを追加する。
7. web test / typecheck / diff check を実行し、失敗があれば修正する。

## ドキュメント保守計画

今回の変更はテスト追加と testability 改善に限定する。ユーザー向け挙動や運用手順は変えないため、README / docs の更新は原則不要と判断する。検証結果と判断理由は作業レポートに記録する。

## 受け入れ条件

- [ ] `room.snapshot.updated` parser が `reason: "game.started"` を受け入れる単体テストがある。
- [ ] WebSocket URL resolver の代表ケースを固定する単体テストがある。
- [ ] 同一 `roomId` の `room.snapshot.updated(reason: "game.started")` 受信で `fetchSnapshot()` が再実行されるテストがある。
- [ ] 別 `roomId` の通知では `fetchSnapshot()` が追加実行されないテストがある。
- [ ] 非ホスト Lobby が `game.started` 通知後に HINT_SUBMITTING 画面へ遷移するテストがある。
- [ ] `npm run test -w @hirameki-relay/web` が pass する。
- [ ] web TypeScript 変更に対する typecheck が pass する。
- [ ] 作業レポートを `reports/working/` に保存する。

## 検証計画

- `npm run test -w @hirameki-relay/web`
- `npm run typecheck -w @hirameki-relay/web`
- `git diff --check`

## PR レビュー観点

- WebSocket event で直接 UI 状態を進めず、server snapshot を唯一の正として再取得していること。
- `room.snapshot.updated` の type 統一と `reason` による詳細化を崩していないこと。
- テスト用変更が本番 UI の挙動や表示値に mock fallback を混ぜていないこと。

## リスク

- component test はブラウザ実機の WebSocket 接続を検証しない。接続先環境の疎通は別途 smoke / E2E の対象とする。
