# 再現方針メモ

この公開版は、GitHub Pagesで軽く動く静的Web版をベースに、元C#版のAPI出力へ段階的に寄せる方式です。

## 反映済み

- GitHub Pagesで動く静的ファイル構成
- IndexedDBによるユーザーごとのブラウザ内セーブ
- JSONセーブ書き出し/読み込み
- C#版とのAPI比較ツール作成
- リーグ日程数をC#版に寄せる調整
  - 例: 10チームリーグは36試合/チーム相当
- 試合データ保存サイズ削減
  - 試合にはチームIDと結果を保存し、表示時にチーム名・色・戦術を復元
- `advanceRound` の返却形式をC#版に近づける調整
- チーム画面のベスト11と予算項目の補完

## 比較ツール

比較ツールは以下にあります。

`C:\Users\ogata\Desktop\ジャッジ用\JLeagueSandboxLite_ParityTools`

手順:

```powershell
cd C:\Users\ogata\Desktop\ジャッジ用\JLeagueSandboxLite_ParityTools\CSharpSnapshot
dotnet run -- ..\snapshots\csharp

cd C:\Users\ogata\Desktop\ジャッジ用\JLeagueSandboxLite_ParityTools\WebSnapshot
npm.cmd install
npm.cmd run snapshot -- ..\..\JLeagueSandboxLite\JLeagueSandboxLite\Web ..\snapshots\web
npm.cmd run compare -- ..\snapshots\csharp ..\snapshots\web ..\snapshots\parity-report.json
```

## 残っている大きな差分

- カップ戦・大陸大会・代表大会の生成
- 移籍市場の詳細
- 選手詳細スタッツランキング
- 年間表彰
- C#版と完全同一の試合エンジン

優先順位は、まずリーグ進行、チーム画面、選手画面、試合詳細の順でC#版に寄せるのが現実的です。
