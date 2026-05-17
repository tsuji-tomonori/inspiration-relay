# ひらめきリレー MVP UI Spec

- source references:
  - `.workspace/hirameki_relay_spec_design.md`
  - `.workspace/ChatGPT Image 2026年5月16日 20_21_22.png`
  - `.workspace/ChatGPT Image 2026年5月16日 20_31_22.png`
  - `.workspace/hirameki_relay_asset_pack.zip`
- route:
  - `/`: ホーム、ルーム作成/参加
  - `/rooms/:roomId` 相当: MVP では SPA state で room screen を表示

## Layout

### Desktop

- Header: 左にロゴ、右にルームIDとトップへ戻る操作。
- Home: 中央に大きなカード、ロゴ、キャッチコピー、キャラクター、ルーム作成/参加ボタン。
- Room: 3 columns。
  - 左: プレイヤー一覧。
  - 中央: lobby / hint / answer / result の主画面。
  - 右: ランキング。

### Mobile

- Header は縦積み。
- Room は main panel を先頭にし、プレイヤーとランキングを下に積む。
- 主要ボタンは幅いっぱいに近いサイズで touch target を確保する。

## Component Inventory

- `HomeScreen`
- `EntryModal`
- `RoomScreen`
- `Lobby`
- `HintScreen`
- `AnswerScreen`
- `RoundResult`
- `GameResult`
- `HintRail`
- `RankingPreview`
- `RoomBadge`

## Visual Tokens

- 背景: cream / pink / mint の pastel。
- Border radius: panel 24px、button/chip 999px。
- Shadow: sticker-like soft shadow。
- Typography: system Japanese rounded fallback。
- Dominant accent colors:
  - pink `#ff8db0`
  - teal `#31b9ab`
  - lavender `#ead6f9`
  - cream `#fffaf1`

## Asset Mapping

| Reference asset | Source path | Method | Exactness | Notes |
|---|---|---|---|---|
| Logo | `apps/web/public/assets/hirameki-relay/.../grouped_assets/01_logo_hirameki_relay.png` | `img` | exact | Header and hero |
| Characters | `.../grouped_assets/08_characters_all_with_labels.png` | `img` | exact | Home hero |
| Create button | `.../components/044_button_create_room.png` | semantic `button` + image | exact visual asset | Button text remains accessible |
| Join button | `.../components/045_button_join_room.png` | semantic `button` + image | exact visual asset |  |
| Start button | `.../components/051_button_game_start.png` | semantic `button` + image | exact visual asset | Disabled when not host or less than 3 players |
| Next round button | `.../components/061_button_next_round.png` | semantic `button` + image | exact visual asset |  |
| Avatars | `.../components/016_mascot_bunny.png` etc. | `img` | exact | Player identity |
| Pancakes topic art | `.../components/046_object_pancakes.png` | `img` | exact | Lobby visual only |
| Ranking medals | `.../components/073_rank_medal_1.png` etc. | `img` | exact | Top 3 ranking |
| Confetti / sparkles | `.../grouped_assets/11_decor_sparkles_confetti_cluster.png` | CSS background | close | Repeated decoration |

## Content and State

- Production UI does not populate fake players or fake scores.
- Player names, room ID, scores, hints, and round status come from API `RoomSnapshot`.
- Before room creation/join, only static game title and controls are shown.
- Missing or failed API state is surfaced as an error banner.

## Interactions

- Create room opens nickname/avatar modal and calls `POST /api/v1/rooms`.
- Join room opens roomID/nickname/avatar modal and calls `POST /api/v1/rooms/{roomId}/join`.
- Host starts the game only when at least 3 players are present.
- Hinters submit one hiragana hint.
- Answerer submits an answer or skips to reveal the next hint.
- Host advances from round result to next round.

## Accessibility

- Primary image buttons are real `<button>` elements.
- Decorative images use empty alt text and `aria-hidden` where appropriate.
- Modal fields have labels.
- Error banner uses `role="alert"`.
- Mobile layout avoids horizontal scroll at 375px target.

## Unknowns and Assumptions

- Exact font from the mock is unavailable, so Japanese system rounded fallback is used.
- The mock shows several static labels and panel images; MVP uses CSS panels plus exact asset images where interaction or responsive layout would otherwise be impaired.
- Browser clients subscribe to room WebSocket updates with short-lived tickets. `room.snapshot.updated` notifications and WebSocket open/reconnect events prompt the UI to refresh the authorized REST snapshot.

## Acceptance Checklist

- [ ] Home renders with provided logo, characters, and create/join assets.
- [ ] Create/join modal is keyboard-operable and validates required fields.
- [ ] Lobby renders room ID and real player list from API snapshot.
- [ ] Hint screen hides topic from answerer before result.
- [ ] Answer screen shows only revealed hints.
- [ ] Result screens show score and hint contribution from snapshot.
- [ ] 375px and 1440px viewports do not overlap or horizontally overflow.
