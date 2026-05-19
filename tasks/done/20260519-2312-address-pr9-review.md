# PR #9 レビュー指摘対応タスク

## 背景

- PR #9 のレビューで blocking はないが、merge 前の should fix として unit test の回帰検出力不足が 2 件指摘された。
- 指摘内容は `GameService.startGame()` の保存後 broadcast 順序と、2ラウンド目以降の非ホスト回答者 snapshot 秘匿である。

## 目的

- PR #9 の主目的であるゲーム開始同期通知と snapshot 秘匿の単体テストを強化する。
- 指摘された should fix 2 件をテストで固定し、CI / local validation の信頼性を上げる。

## スコープ

- `apps/api/src/service.test.ts` に should fix 2 件を満たす unit test を追加する。
- 実装コードは、テスト追加に必要な場合のみ変更する。
- 作業レポート、PR コメント、task 完了記録を更新する。

## タスク種別

修正

## なぜなぜ分析サマリ

- 問題文: PR #9 の追加テストだけでは、保存前 broadcast への退行や、非ホスト回答者への topic leak を直接検出できない。
- 確認済み事実:
  - 既存 `service.test.ts` は `game.started` reason の broadcast 自体を検証している。
  - 既存 `service.test.ts` は 1ラウンド目のホスト回答者 snapshot 秘匿を検証している。
  - `MemoryRoomRepository.getRoomState()` は保存済み状態を clone せず返すため、保存順序の回帰検出には専用 fake が必要。
- 推定原因:
  - PR #9 の初期テストは主目的の最短固定を優先し、呼び出し順序や複数ラウンドの役割交代まで広げていなかった。
- 根本原因:
  - 仕様上重要な不変条件を、単一ケースの observable 結果だけで検証していたこと。
- 影響範囲:
  - API service unit test のみ。
- 対策:
  - clone を返す fake repository と call order 記録を使い、保存後 broadcast を検証する。
  - 2ラウンド目で非ホスト回答者の snapshot 秘匿とホスト hinter の topic 表示を検証する。

## 作業計画

1. 既存 `service.test.ts` と `GameService` の round 進行 API を確認する。
2. 保存順序検証用 fake repository を追加する。
3. `startGame()` の保存後 broadcast テストを追加する。
4. 2ラウンド目の非ホスト回答者秘匿テストを追加する。
5. API test / typecheck / diff check を実行する。
6. 作業レポートを作成し、commit / push / PR コメントを行う。
7. task を done に移動し、完了 commit を push する。

## ドキュメント保守方針

- 実装挙動や API shape は変えず unit test を追加するため、README / docs 更新は不要と判断する。
- レビュー対応内容は task、作業レポート、PR コメントに記録する。

## 受け入れ条件

- [x] `startGame()` が永続化後に `game.started` を broadcast することを検出できる unit test が追加されている。
- [x] 2ラウンド目で非ホスト回答者にも `topicDisplay` / `answerKana` / `aliases` が秘匿される unit test が追加されている。
- [x] 同じ 2ラウンド目でホストが `hinter` として `topicDisplay` を見られ、答え情報は見られないことを検証している。
- [x] API test / typecheck / diff check が pass している、または未実施理由が記録されている。
- [x] PR に日本語でレビュー対応結果をコメントしている。

## 検証計画

- `git diff --check`
- `npm run test -w @hirameki-relay/api`
- `npm run typecheck -w @hirameki-relay/api`

## PR レビュー観点

- テストが `saveRoomState()` 削除や `notifyRoomUpdated()` 保存前移動で失敗する構造になっていること。
- 非ホスト回答者の秘匿がラウンド交代後の実 API 経由で検証されていること。
- suggestion の payload test は今回の should fix 範囲外として扱い、未対応理由を明記すること。

## リスク

- topic 選択や回答文字列に依存したテストが brittle になる可能性があるため、既存 topic に合わせて最小の進行操作で検証する。

## 実施結果

- `apps/api/src/service.test.ts` に `CloneOnReadRoomRepository` と `OrderedBroadcaster` を追加した。
- `永続化後にgame.startedをbroadcastする` テストで `saveRoomState` -> `broadcastRoomUpdate` の順序と broadcast 時点の保存済み状態を検証した。
- `2ラウンド目で非ホストが回答者になってもtopicDisplayと答え情報を秘匿する` テストで、非ホスト回答者秘匿とホスト hinter 表示を検証した。
- suggestion の `ApiGatewayRoomEventBroadcaster` payload test は今回未対応とし、PR コメントと作業レポートに理由を記録した。
- 作業レポート: `reports/working/20260519-2315-address-pr9-review.md`

## 検証結果

- `git diff --check`: pass
- `npm run test -w @hirameki-relay/api`: fail -> 修正後 pass
- `npm run typecheck -w @hirameki-relay/api`: pass

## PR コメント

- レビュー指摘対応結果: https://github.com/tsuji-tomonori/inspiration-relay/pull/9#issuecomment-4488655109
- セルフレビュー: https://github.com/tsuji-tomonori/inspiration-relay/pull/9#issuecomment-4488658161
- GitHub Apps コメント投稿は 403 のため、`gh pr comment` にフォールバックした。

## 状態

done
