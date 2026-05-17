# API startGame unit tests

状態: doing

## 背景

ホスト以外がゲーム開始を検知できない不具合は、API 側で `startGame()` 後の WebSocket broadcast を単体テストしていれば早期に検出できた。

## 目的

API 側に最初に必要な単体テストを追加し、ゲーム開始時の状態遷移、通知、snapshot 秘匿を固定する。

## タスク種別

修正

## なぜなぜ分析サマリ

- confirmed: `GameService` と API テスト基盤は存在し、`vitest run` で検証できる。
- confirmed: ユーザー要望は API 側の単体テスト実装であり、Web 側テストは今回の主範囲ではない。
- inferred: ゲーム開始時の broadcast が未検証だと、状態保存後に他参加者へ更新通知が届かない回帰を検出できない。
- open_question: 既存実装がすでに `game.started` reason を送っているかは実装確認後に確定する。
- root_cause: API の重要な状態変更と通知契約を固定する単体テストが不足していた。
- remediation: `startGame()` の最優先シナリオを API 単体テストに追加し、必要なら最小限の実装修正を行う。

## スコープ

- `apps/api` の `GameService.startGame()` 周辺テスト
- 必要な最小限の API 実装修正
- 関連する作業レポート

## 非スコープ

- Web 側 React/UI テストの追加
- 全シナリオ一覧の一括実装
- 既存 UI やインフラの変更

## 計画

1. API の既存 service/realtime/app テスト構造を確認する。
2. `GameService.startGame()` のテストヘルパを作る。
3. 3人以上開始、broadcast、回答者/ヒント役 snapshot 秘匿、非ホスト、3人未満のテストを追加する。
4. 失敗があれば実装を最小修正する。
5. API テストと差分チェックを実行する。
6. 作業レポートを作成する。

## ドキュメント保守方針

今回は既存の挙動を単体テストで固定する作業であり、外部 API 仕様や利用手順の変更がなければ README/docs は更新しない。

## 受け入れ条件

- [ ] `GameService.startGame()` が 3人以上の `LOBBY` で `IN_GAME` / `HINT_SUBMITTING` に遷移するテストがある。
- [ ] ゲーム開始時に `room.snapshot.updated` 相当の `reason: "game.started"` broadcast が行われるテストがある。
- [ ] 開始後、回答者 snapshot に `topicDisplay` が含まれないテストがある。
- [ ] 開始後、ヒント役 snapshot に `topicDisplay` が含まれるテストがある。
- [ ] 非ホストはゲーム開始できないテストがある。
- [ ] 3人未満ではゲーム開始できないテストがある。
- [ ] 選択した API 検証コマンドが成功している、または未実施理由が明記されている。

## 検証計画

- `npm run test -w @hirameki-relay/api`
- `git diff --check`

## PR レビュー観点

- broadcast reason が Web クライアントの `room.snapshot.updated` 再取得契約と整合していること。
- 回答者にお題や答え情報を漏らしていないこと。
- テストが特定のランダム性や時刻に過度依存していないこと。

## リスク

- 既存実装が random topic 選択を含む場合、テストで topic 内容を直接固定しすぎると壊れやすくなる。
- Web 側の再取得処理は今回未対応のため、API 通知契約の固定までが主成果となる。
