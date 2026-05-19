# カタカナヒント拒否テスト追加

状態: done

## 背景

PR #12 のレビューで、仕様準拠テストとして「お題と一致しないカタカナヒント」を拒否する API テストが不足していると指摘された。

## 目的

ヒント入力は「ひらがな・長音のみ」という仕様を API service と game-core の両方で検証し、回答正規化によってカタカナヒントが受理されないことを保証する。

## タスク種別

修正

## なぜなぜ分析サマリ

- 問題文: 2026-05-19 時点の PR #12 で、仕様準拠テストが「お題と一致しないカタカナヒント」の拒否を明示的に検証していない。
- 確認済み事実:
  - `apps/api/src/spec-compliance.test.ts` は `パンケーキ` を invalid として検証している。
  - `パンケーキ` はカタカナであると同時にお題表示そのものでもあるため、文字種違反だけを検出するテストになっていない。
  - `packages/game-core/src/index.ts` の `validateHint` は `normalizeAnswer` を使い、カタカナをひらがなへ変換してから `hiraganaHintPattern` を判定している。
- 推定原因:
  - 回答入力向けの寛容な正規化処理を、ヒント入力の厳密な文字種検証にも流用している。
  - API 仕様準拠テストが「入力文字種違反」と「お題一致違反」を分離していなかった。
- 根本原因:
  - ヒント入力と回答入力で正規化ポリシーが異なるにもかかわらず、検証ロジックとテスト観点で分離されていない。
- 対応方針:
  - ヒント用には trim/NFKC のみを行い、カタカナをひらがなへ変換しない正規化に分ける。
  - game-core unit test と API spec compliance test に、お題と一致しない `フワフワ` の拒否ケースを追加する。
- 未確認点:
  - なし。現行コードとレビュー指摘から再現条件は明確。

## スコープ

- `packages/game-core/src/index.ts`
- `packages/game-core/src/index.test.ts`
- `apps/api/src/spec-compliance.test.ts`
- `reports/working/20260519-2153-spec-compliance-tests.md`
- `tasks/done/20260519-2151-spec-compliance-tests.md`
- 本 task md

## 計画

1. `validateHint` のヒント用正規化を回答用正規化から分離する。
2. game-core unit test に `フワフワ` 拒否を追加する。
3. API spec compliance test に `フワフワ` 拒否を追加する。
4. 関連 test と `git diff --check` を実行する。
5. 作業レポート、task、PR 本文、PR コメントを更新し、commit/push する。

## ドキュメント保守計画

本番仕様に合わせた検証修正であり、README や `docs/` の仕様変更は不要。作業レポートと PR 本文にレビュー指摘対応として記録する。

## 受け入れ条件

- `apps/api/src/spec-compliance.test.ts` に、お題と一致しないカタカナヒント `フワフワ` の拒否テストが追加される。
- `packages/game-core/src/index.test.ts` に、カタカナヒント拒否の unit test が追加される。
- `validateHint` が回答用カタカナ正規化に依存せず、ヒント入力をひらがな・長音の文字種として厳密に判定する。
- `npm run test -w @hirameki-relay/game-core` が pass する。
- `npm run test -w @hirameki-relay/api` が pass する。
- `git diff --check` が pass する。
- PR #12 に日本語で対応コメントと更新後セルフレビューを投稿する。

## 検証計画

- `npm run test -w @hirameki-relay/game-core`
- `npm run test -w @hirameki-relay/api`
- `git diff --check`

## PR レビュー観点

- カタカナを回答では許容し、ヒントでは拒否するポリシーが分離されているか。
- お題一致違反と文字種違反のテストが混同されていないか。
- 仕様準拠テストに固定仕様値を追加しても、本番実装へ仕様固有分岐を入れていないか。

## リスク

- 既存のカタカナヒント受理を前提にした利用者がいた場合、仕様どおり拒否されるようになる。ただし仕様上はひらがな・長音のみが正であるため、意図した修正と判断する。

## 完了結果

- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/12
- レビュー指摘対応コメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/12#issuecomment-4488140460
- 更新後セルフレビューコメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/12#issuecomment-4488140500
- 検証:
  - `npm run test -w @hirameki-relay/game-core`: pass
  - `npm run test -w @hirameki-relay/api`: fail -> `npm ci` で依存関係を復旧後 pass
  - `npm run typecheck -w @hirameki-relay/game-core`: pass
  - `npm run typecheck -w @hirameki-relay/api`: pass
  - `git diff --check`: pass
  - `git diff --cached --check`: pass
