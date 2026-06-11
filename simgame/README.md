# JLeagueSandboxLite Static JS Port

GitHub Pages だけで動かすための JS 全移植版です。

このフォルダの中身を GitHub Pages 用リポジトリへ置けば、API サーバーなしで動きます。

## 現在の到達点

- API サーバー不要
- ブラウザ IndexedDB にユーザー別セーブ
- CSV seed から 1460 クラブを生成
- 1クラブ30人、合計43800選手を生成
- リーグ戦を生成
- 国内カップ、大陸大会、代表大会を生成
- 代表チームを生成
- 大会一覧/大会詳細/検索対象に大会を追加

## まだ C# と一致していない主な領域

- C# と同じ大会定義、試合数、節配置
- C# の DiceMatchEngine と同じ試合結果生成
- カップ戦の勝ち上がり更新
- 大陸大会/代表大会の詳細フォーマット
- 移籍市場、補強、放出、予算更新
- 表彰、実績、シーズンアーカイブ
- 詳細スタッツランキング
- 昇降格、翌シーズン生成

## 検証メモ

`JLeagueSandboxLite_ParityTools` の Playwright スナップショットで確認済み。

最新の静的 JS スナップショット:

```text
C:\Users\ogata\Desktop\ジャッジ用\JLeagueSandboxLite_ParityTools\snapshots\web-static-js-port
```

確認値:

```text
teams: 1460
players: 43800
nationalTeams: 63
cups: 63
continental competitions: 11
national competitions: 5
```
