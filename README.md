# 一級建築士 進捗管理サイト

通勤2時間で「1級建築士」アプリを使う神山陸専用の進捗管理ダッシュボード。

## 目標
- 試験日: 2026-07-26（学科）
- 最低: 全74単元 4周
- 目標: 全74単元 6周

## 機能
- 試験までのカウントダウン
- 5科目（計画/環境設備/構造/施工/法規）の単元別進捗管理
- 単元タップで周回+1（長押しで-1）
- 4周到達で青、6周到達で金
- 日次ログ（解いた問題数・正答数・気分）
- 必要ペース自動計算
- データはブラウザのlocalStorageに保存
- エクスポート/インポート対応

## ローカル確認
```
cd ~/ikkyu-study
python3 -m http.server 8080
# ブラウザで http://localhost:8080 を開く
```

## デプロイ（GitHub Pages）

1. GitHubで新規リポジトリ作成 `ikkyu-study`（public）
2. ローカルから push:
   ```
   cd ~/ikkyu-study
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/<USERNAME>/ikkyu-study.git
   git push -u origin main
   ```
3. GitHub Settings → Pages → Source: `main` branch / `/` (root) → Save
4. 数分後 `https://<USERNAME>.github.io/ikkyu-study/` で公開
5. iPhone Safariでアクセス → 共有 → ホーム画面に追加

## ファイル
- `index.html` — UI
- `style.css` — スタイル
- `app.js` — ロジック
- `data/subjects.json` — 科目・単元定義（追加・編集はここを書き換える）
