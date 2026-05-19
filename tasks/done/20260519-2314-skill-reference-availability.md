# 存在しない skill 参照による blocked リスク修正

状態: done

タスク種別: 修正

## 背景

PR #13 の review 指摘として、`AGENTS.md` が多数の `skills/*/SKILL.md` を必読・推奨している一方、PR で追加される skill は `github-apps-pr-operator` と `worktree-task-pr-flow` のみであるため、merge 後の通常作業で存在しない skill を読もうとして blocked になるリスクが指摘された。

## 目的

GitHub Apps 403 時の不必要な未完了扱いを避けるという今回の目的に反しないよう、存在しないリポジトリローカル skill 参照が通常作業を止めないルールへ修正する。

## スコープ

- `AGENTS.md`
- `skills/worktree-task-pr-flow/SKILL.md`
- `skills/github-apps-pr-operator/SKILL.md`
- 作業レポート
- PR コメント

## なぜなぜ分析

### 問題文

PR #13 merge 後、`AGENTS.md` や追加 skill が存在しない `skills/*/SKILL.md` を必読として参照し、agent が通常作業を blocked と扱う可能性がある。

### 確認済み事実

- `origin/main` には `skills/` 配下の tracked file が存在しない。
- PR #13 で追加される tracked skill は `skills/github-apps-pr-operator/` と `skills/worktree-task-pr-flow/` のみである。
- `AGENTS.md` は `skills/task-completion-guardian/SKILL.md` など多数の未追加 skill を参照している。
- `skills/worktree-task-pr-flow/SKILL.md` と `skills/github-apps-pr-operator/SKILL.md` も、未追加 skill を Required Pairings / Required Workflow として参照している。

### 根本原因

ローカルには多数の未追跡 skill が存在する前提で `AGENTS.md` を作成したが、PR に含める tracked file の範囲と、merge 後に参照可能な skill の範囲を区別していなかった。

### 対策方針

- 参照先 skill が現在の checkout に存在する場合は従来どおり読む。
- 参照先 skill が存在しない場合は blocked にせず、存在しない事実を作業レポート・PR 本文・コメントに記録して、AGENTS.md と利用可能な skill / 開発者指示で続行する。
- `必読`、`推奨`、`適用` の語があっても、リポジトリローカルファイル参照は file existence に条件づくことを明記する。

## 実施計画

1. PR 差分と tracked skill 範囲を確認する。
2. `AGENTS.md` の共通ルールに skill 可用性ルールを追加する。
3. 追加済みの `worktree-task-pr-flow` と `github-apps-pr-operator` にも同じ fallback ルールを追加する。
4. レポートを更新し、検証を実施する。
5. commit / push / PR コメントで対応結果を記録する。

## 受け入れ条件

- [x] `AGENTS.md` が、存在しない repo-local `SKILL.md` を理由に通常作業を blocked にしない方針を明記している。
- [x] PR #13 で追加される `skills/worktree-task-pr-flow/SKILL.md` が、参照先 skill 不在時の続行方針を明記している。
- [x] PR #13 で追加される `skills/github-apps-pr-operator/SKILL.md` が、参照先 skill 不在時の続行方針を明記している。
- [x] 変更範囲に対する `git diff --check` と `pre-commit run --files ...` が通っている。
- [x] PR に blocking 指摘への対応結果をコメントしている。

## 完了メモ

- PR: https://github.com/tsuji-tomonori/inspiration-relay/pull/13
- blocking 指摘 1 対応コメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/13#issuecomment-4488663683
- セルフレビューコメント: https://github.com/tsuji-tomonori/inspiration-relay/pull/13#issuecomment-4488666894
- `AGENTS.md`、`skills/worktree-task-pr-flow/SKILL.md`、`skills/github-apps-pr-operator/SKILL.md` に missing repo-local skill の fallback 方針を追加した。
- GitHub Apps connector は同 PR で `403 Resource not accessible by integration` を確認済みのため、PR コメント投稿は `gh pr comment` にフォールバックした。

## 検証計画

- `git diff --check`
- `pre-commit run --files <changed-files>`
- `git diff --name-status origin/main...HEAD` による PR 追加対象の確認

## リスク

- missing skill の詳細手順は適用できないため、同等の一般ルールで代替したことを報告する必要がある。
- 将来、本当に必須の skill を追加する場合は、`AGENTS.md` の参照と同じ PR で該当 `SKILL.md` を tracked file として追加する必要がある。
