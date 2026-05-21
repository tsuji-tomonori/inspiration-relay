# 3人目参加後の開始ボタン有効化と hostToken 条件修正

状態: done

## 背景

3人表示なのにゲーム開始できない状況について、バックエンドの「3人以上なら開始可」判定よりも、WebSocket 更新後のフロント側 snapshot 反映と hostToken 保持・使用のズレが疑わしい。

## 目的

ホスト画面で3人目参加通知後に最新 snapshot が反映され、hostToken がある場合だけ開始ボタンが有効になり、REST start API に Host token を渡すことをテストと実装で固定する。

## タスク種別

修正

## skill 参照状況

- 存在確認済み: `skills/worktree-task-pr-flow/SKILL.md`
- 存在確認済み: `skills/github-apps-pr-operator/SKILL.md`
- 現 checkout に存在しないため代替: `skills/nazenaze-analysis/SKILL.md`, `skills/implementation-test-selector/SKILL.md`, `skills/repository-test-runner/SKILL.md`, `skills/post-task-fit-report/SKILL.md`, `skills/implementation-docs-maintainer/SKILL.md`, `skills/no-mock-product-ui/SKILL.md`, `skills/japanese-git-commit-gitmoji/SKILL.md`, `skills/japanese-pr-title-comment/SKILL.md`, `skills/pr-review-self-review/SKILL.md`
- 代替方針: AGENTS.md と参照済みの repo-local skill 要件に従い、必要事項をこの task md、作業レポート、最終回答へ明記する。

## なぜなぜ分析サマリ

- 問題文: 3人がロビーに表示されているにもかかわらず、ホストがゲーム開始できないように見える。
- 確認済み事実: `startGame` は3人未満のみ拒否する設計で、開始 API は Host token を使う REST 経路である。
- 推定原因: UI の開始可否表示が server snapshot の `canStartGame` だけに寄り、クリック時に必要な `session.hostToken` 欠落と整合していない可能性がある。
- 推定原因: `room.snapshot.updated` の `player.joined` を受けた後の snapshot 再取得が回帰すると、ホスト画面に3人目参加後の権限状態が反映されない。
- 未確認点: 実ブラウザ環境での WebSocket 接続可否、AWS 環境の WebSocket management endpoint 設定。
- 根本原因候補: フロントの開始操作条件と実際の認証要件を同じ条件でテスト固定していないこと。
- 対策: hostToken を UI の開始可能条件へ含め、3人目参加通知による snapshot 再取得と Host token での start 呼び出しを単体テストに追加する。

## スコープ

- `apps/web/src/App.tsx` の開始ボタン可否・エラー文。
- `apps/web/src/App.test.tsx` の WebSocket 更新と hostToken 欠落テスト。
- 必要に応じて WebSocket parser、API service test、Vite proxy 設定、関連 docs を確認・更新する。
- PR 用の作業レポートを `reports/working/` に作成する。

## 受け入れ条件

- [x] ホスト session に hostToken がある場合、3人目参加の `room.snapshot.updated` / `player.joined` 後に snapshot を再取得し、開始ボタンが有効になる。
- [x] 開始クリック時に `startGame(roomId, hostToken)` が呼ばれることを Web テストで確認する。
- [x] `canStartGame: true` でも session に hostToken がない場合、開始ボタンは無効になる。
- [x] `room.snapshot.updated` の `player.joined` reason を parser または App テストで固定する。
- [x] 関連する最小十分な検証を実行し、結果を記録する。
- [x] 作業レポートを `reports/working/` に作成する。

## 実装計画

1. App / websocket / test helper の現状を読む。
2. hostToken を開始可能条件に含める。
3. 3人目参加通知と hostToken 欠落の Web テストを追加する。
4. 必要に応じて WebSocket parser、Vite proxy、docs を更新する。
5. 変更範囲に応じたテストを実行し、失敗時は修正して再実行する。
6. 作業レポートを作成し、commit / push / PR / 受け入れ条件コメントまで進める。

## ドキュメント保守計画

ユーザー可視の開始可否が hostToken と一致する修正であり、公開 API 形状は変えない。WebSocket イベント仕様やローカル dev proxy に実装差分が見つかった場合のみ durable docs または設定を更新する。不要な場合は作業レポートに理由を記録する。

## 検証計画

- `npm run test -w @hirameki-relay/web` または該当 package 名の Web test。
- WebSocket parser または API test を変更した場合は対応 workspace test。
- `git diff --check`。

## PR レビュー観点

- hostToken 欠落時に実データでない見せかけの開始可能状態を出していないこと。
- `player.joined` 通知が開始前の snapshot 再取得トリガーとして固定されていること。
- 未実施の検証を実施済みとして書いていないこと。

## リスク

- GitHub Apps の PR 作成・コメント操作が権限不足の場合は `gh` フォールバックが必要。
- ローカル実走行の dev server / WebSocket 確認は環境依存のため、単体テスト中心の検証になる可能性がある。

## 実施内容

- `App.tsx` で開始ボタンの有効条件を `snapshot.permissions.canStartGame && !!session.hostToken` と一致させた。
- `App.test.tsx` に3人目参加通知後の snapshot 再取得、開始ボタン有効化、Host token での `startGame` 呼び出し、hostToken 欠落時の無効化を追加した。
- `websocket.test.ts` に `player.joined` reason の parser テストを追加した。
- `service.test.ts` にホスト/非ホスト snapshot の `canStartGame` 判定テストを追加した。
- `app.test.ts` に `/start` の Host token 成功と Guest token 拒否の API テストを追加した。
- `vite.config.ts` に `/ws` WebSocket proxy を追加し、README の local setup 記述を更新した。

## 検証結果

- `npm ci`: pass。初回検証で依存不足が判明したため実行。
- `npm run test -w @hirameki-relay/web`: pass。
- `npm run test -w @hirameki-relay/api`: pass。
- `npm run typecheck -w @hirameki-relay/web`: pass。
- `npm run typecheck -w @hirameki-relay/api`: pass。
- `npm run build -w @hirameki-relay/web`: pass。
- `git diff --check`: pass。

## PR 操作

- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/14
- PR 作成: GitHub Apps に PR 作成ツールが無かったため `gh pr create` にフォールバック。
- 受け入れ条件コメント: GitHub Apps が `403 Resource not accessible by integration` のため `gh pr comment` にフォールバック。
- セルフレビューコメント: 受け入れ条件コメントと同じ理由で `gh pr comment` にフォールバック。
