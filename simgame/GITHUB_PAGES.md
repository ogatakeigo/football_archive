# GitHub Pages公開メモ

このアプリは `Web` フォルダをそのまま静的サイトとして公開できます。

## 公開するファイル

GitHub Pagesの公開対象には、少なくとも以下を含めてください。

- `index.html`
- `app.js`
- `local_api.js`
- `player_traits.js`
- `styles.css`
- `.nojekyll`
- `Data/seed_countries.csv`
- `Data/seed_leagues.csv`
- `Data/seed_teams.csv`

## おすすめ設定

1. GitHubに公開用リポジトリを作ります。
2. このプロジェクトの `Web` フォルダの中身を、リポジトリのルートへ置きます。
3. GitHubの `Settings` -> `Pages` で、公開元を `main` ブランチの `/root` にします。
4. 表示された Pages URL を開きます。

## セーブデータ

セーブデータは各ユーザーのブラウザ内 IndexedDB に保存されます。サーバーやGitHubには保存されません。

公開版では画面右上の `セーブ書出` でJSONバックアップを保存できます。別端末へ移す場合やバックアップから戻す場合は、`セーブ読込` でJSONを選択します。

読み込み時は現在のブラウザ内セーブを上書きします。
