# GitHub Apps 403 時の gh フォールバック完了条件修正

状態: in_progress

タスク種別: 修正

## 背景

GitHub Apps での PR 作成・コメント投稿が `403 Resource not accessible by integration` になった後、`gh` にフォールバック済みであるにもかかわらず「未完了」と扱われた。リポジトリローカルの `AGENTS.md` と関連 skill の完了条件を見直し、代替手段で必要な PR 操作が完了した場合の扱いを明確にする。

## 目的

GitHub Apps 優先の方針は維持しつつ、権限不足などで GitHub Apps が使えない場合に `gh` で同等の PR 作成・コメント投稿を完了できたら、GitHub 操作自体は完了扱いにできるようにする。

## スコープ

- `AGENTS.md`
- `skills/worktree-task-pr-flow/SKILL.md`
- `skills/github-apps-pr-operator/SKILL.md`
- 必要に応じた agent prompt
- task / 作業レポート

## なぜなぜ分析

### 問題文

GitHub Apps の PR 作成・コメント投稿が 403 で失敗し、`gh` にフォールバック済みであるにもかかわらず、作業状態が未完了として報告された。

### 確認済み事実

- `AGENTS.md` は「PR 作成は GitHub Apps を優先する。利用できない場合は blocked として理由を報告」と記載している。
- `skills/github-apps-pr-operator/SKILL.md` は「GitHub app が不足または unavailable の場合に `gh` を使う」と記載している。
- 同 skill は「GitHub Apps も `gh` も完了できない場合」に blocked / partially complete とする規則を持つ。

### 推定原因

- `AGENTS.md` の「利用できない場合は blocked」という表現が、`gh` フォールバック成功後にも blocked と解釈されうる。
- worktree flow 側の PR 作成ステップも GitHub Apps 作成を強く表現しており、フォールバック成功時の完了条件が明示されていない。
- agent prompt も「GitHub Apps で PR を開く」前提が強く、代替成功時の扱いを補足していない。

### 根本原因

GitHub Apps 優先方針と `gh` フォールバック方針の優先順位・完了条件が複数のルールファイル間で十分に同期されていない。

### 対策方針

- GitHub Apps は第一選択として維持する。
- GitHub Apps が `403 Resource not accessible by integration` などの権限制約で失敗した場合は、理由を記録して `gh` にフォールバックできることを明記する。
- `gh` で PR 作成・更新・コメント投稿が成功した場合は、該当 GitHub 操作を完了扱いにする。
- blocked / partially complete は、GitHub Apps と `gh` の両方で必要操作を完了できない場合に限定する。

## 実施計画

1. `AGENTS.md` と関連 skill / agent prompt の該当箇所を確認する。
2. GitHub Apps 403 時の `gh` フォールバック完了条件を明文化する。
3. Markdown / frontmatter / diff の検証を行う。
4. 作業レポートを作成する。

## ドキュメント保守方針

今回の変更は agent / skill の運用ルール変更であり、README や `docs/` の利用者向け仕様には影響しない。該当するリポジトリローカル運用文書である `AGENTS.md` と skill を更新する。

## 受け入れ条件

- [ ] GitHub Apps が `403 Resource not accessible by integration` などで失敗した場合の `gh` フォールバック方針が `AGENTS.md` に明記されている。
- [ ] `skills/github-apps-pr-operator/SKILL.md` が、`gh` フォールバック成功時は PR 操作完了扱い、両方失敗時のみ blocked と読む内容になっている。
- [ ] `skills/worktree-task-pr-flow/SKILL.md` または関連 agent prompt が、GitHub Apps 専用完了条件に誤読されない。
- [ ] `git diff --check` など、変更範囲に対する最小限の検証が実施されている。
- [ ] 作業完了レポートが `reports/working/` に保存されている。

## 検証計画

- `git diff --check`
- 変更した `SKILL.md` の frontmatter と該当文面の目視確認
- 可能であれば `pre-commit run --files <changed-files>`

## PR レビュー観点

- GitHub Apps 優先方針を弱めすぎていないか。
- フォールバック成功と未完了 / blocked の条件が明確に分かれているか。
- 実施していない GitHub Apps 操作を成功扱いにしない記述になっているか。

## リスク

- `gh` の認証・権限が不足する場合は引き続き blocked になる。
- GitHub Apps を使えなかった事実は、PR 本文・コメント・作業レポートで明示する必要がある。
