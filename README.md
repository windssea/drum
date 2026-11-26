# 潮汐鼓港 · 鼓浪迎击

用架子鼓指挥鼓船。四个课组提供 12 种进攻律动和 8 种防守练习。先从摇滚的二、四拍入门，再练底鼓连踩、放克十六分、雷鬼 One Drop，最后在真正的三连音网格上打 Shuffle 和慢蓝调。听一小节、回打一小节。四轮结束后可看击打偏差和最容易漏的鼓位。72 BPM 慢练与 96 BPM 原速都使用同调的完整伴奏。

- [游戏策划与首领谱面](docs/game-design.md)
- [平板练习谱](https://drum-lab.windssea526.workers.dev/practice/) · [鼓谱源文件、手脚分工与教学出处](docs/drum-vocabulary.md)
- [实机完整对战录像（含游戏原声）](art/motion/battle-playthrough.mp4)
- [直接试听战斗原声](https://drum-lab.windssea526.workers.dev/index.theme.ogg) · [Gemini 配乐与节拍校对](docs/music-score.md)
- [角色人声](docs/character-voices.md) · [战斗音效](docs/sound-effects.md) · [Grok 战斗动画](docs/motion-production.md)
- [场景、角色与攻击演出设定](art/concepts/README.md)
- [首战原型验证与复测命令](docs/verification.md)
- [Web 游戏入口](https://drum-lab.windssea526.workers.dev/) · [自定义域名](https://drum.nanokid.win/)
- 旧版完整收录于 [old 分支](https://github.com/windssea/drum/tree/old)，归档提交为 `06771a2`。

## 运行首关

在 Godot 4.7.2 打开 `game/project.godot`，按 F5 运行。Web 版在开战前点课组按钮或按 L 切换三张进攻谱，用顶部速度按钮或 B 切换 72／96 BPM，点开始或按空格开战。平板底部四块鼓垫支持同击，键盘 D／F／J／K 依次对应底鼓、军鼓、踩镲与通鼓。罗兰模块通过 USB MIDI 接入，在支持 Web MIDI 的浏览器中选择连接。模块本机负责实体鼓的返听。

## 导出与发布

仓库使用 GDScript、Compatibility 渲染器和单线程 Web 模板。默认引擎目录为 `D:\dev\windssea\game\godot4.7.2`。本地导出需要安装匹配的 `4.7.2.stable` Web 模板。

```powershell
./scripts/web.ps1
```

导出文件位于 `build/web/`；从 localhost 的 HTTP 静态服务器打开 `index.html`。正式发布使用已登录 Cloudflare 的 Wrangler、已建立的私有 R2 桶及仓库中的域名配置。

```powershell
./scripts/web.ps1 -Publish
```

引擎 WASM 以 SHA-256 命名并压缩存入私有 R2 桶 `tidebeat-harbor-runtime`，通过同源 `/index.wasm` 返回。游戏数据包、页面和加载脚本随 Worker 静态资源发布。切换引擎模板时同步更新配置中的 WASM 哈希。

[Godot Web 导出说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) · [Cloudflare R2 Worker 绑定](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
