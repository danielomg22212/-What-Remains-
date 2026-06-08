# 《南方暗火》在线阅读站部署说明

这个目录是《南方暗火》的独立静态阅读站，复用《后来如何》阅读器结构，但正文、封面和本地阅读进度互相独立。

## 目录

```text
docs/nanfang-anhuo/
  index.html
  styles.css
  novel.txt
  cover.svg
  robots.txt
  DEPLOY.md
```

## 更新正文

在仓库根目录执行：

```powershell
Copy-Item -LiteralPath "南方暗火_V1.md" -Destination "docs\nanfang-anhuo\novel.txt" -Force
git add docs/nanfang-anhuo/
git commit -m "Update Southern Dark Fire reader"
git push github main
```

部署后访问：

```text
https://danielomg22212.github.io/-What-Remains-/nanfang-anhuo/
```

强刷缓存可加版本号：

```text
https://danielomg22212.github.io/-What-Remains-/nanfang-anhuo/?v=20260607
```
