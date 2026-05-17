# infra 単体テスト追加タスク

- 状態: do
- タスク種別: 機能追加
- 作成日時: 2026-05-17 22:10 JST

## 背景

`https://github.com/tsuji-tomonori/rag-assist` の infra テストを参考に、`inspiration-relay` の CDK スタックに対する単体テストを強化する。追加要望としてスナップショットテストも含める。

## 目的

CDK の主要リソース、接続、セキュリティ/コスト回帰防止観点を fine-grained assertion で検証し、合成済み CloudFormation テンプレートのスナップショットも保持する。

## スコープ

- `infra/test/hirameki-relay-stack.test.ts`
- `infra/test/__snapshots__/...`
- 必要な task / report

## 計画

1. 現行 infra スタックと既存テストを確認する。
2. `rag-assist` の CDK assertion / snapshot 方針を参考に、既存 Vitest スタイルへ合わせてテストを追加する。
3. Snapshot は asset hash や metadata など変動しやすい値を安定化した上で比較する。
4. infra の targeted validation を実行する。
5. 作業レポートを作成し、commit / push / PR / PR コメントまで進める。

## ドキュメント保守方針

今回はテスト追加のみで、実装挙動・API・運用手順は変更しない。README や `docs/` の更新は不要と判断する。

## 受け入れ条件

- [ ] `rag-assist` の infra テスト方針を参考にした CDK fine-grained assertion が追加されている。
- [ ] CloudFormation テンプレートのスナップショットテストが追加され、安定化処理により asset hash 変動を抑えている。
- [ ] 追加テストが `HiramekiRelayStack` の主要リソース、Lambda/API/WebSocket/CloudFront/IAM/DynamoDB/S3 の重要設定を検証している。
- [ ] 固定費系リソースや Cognito の意図しない追加を検出できる。
- [ ] `npm run test -w @hirameki-relay/infra` が成功する。
- [ ] `npm run typecheck -w @hirameki-relay/infra` が成功する。
- [ ] `git diff --check` が成功する。
- [ ] 作業レポートが `reports/working/` に作成されている。
- [ ] PR 作成後に受け入れ条件確認コメントとセルフレビューコメントが日本語で投稿されている。

## 検証計画

- `npm run test -w @hirameki-relay/infra`
- `npm run typecheck -w @hirameki-relay/infra`
- `git diff --check`

## PR レビュー観点

- Snapshot が過度に脆くなく、意図しない template drift を検出できるか。
- Fine-grained assertion が CDK 実装の重要な契約を押さえているか。
- 未実施の検証を実施済みとして書いていないか。

## リスク

- Snapshot は CDK 生成物の変更に追随する必要があるため、安定化対象を絞って不要な churn を避ける。
