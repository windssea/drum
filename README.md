# 潮汐鼓港 · 鼓浪迎击

玩家在一艘鼓船上和轰壳蟹进行节奏对决。听它敲完战鼓，在回应小节踩底鼓发出金色重浪、敲军鼓打出青色反击。Godot 主场景负责战斗、输入判定与画面。Web 版在浏览器音频时钟上调度伴奏，并使用输入事件自己的时间戳。

- [游戏策划与首领谱面](docs/game-design.md)
- [场景、角色与攻击演出设定](art/concepts/README.md)
- [首战原型验证与复测命令](docs/verification.md)
- [Web 游戏入口](https://drum-lab.windssea526.workers.dev/) · [自定义域名](https://drum.nanokid.win/)
- 旧版完整收录于 [old 分支](https://github.com/windssea/drum/tree/old)，归档提交为 `06771a2`。

## 运行首关

在 Godot 4.7.2 打开 `game/project.godot`，按 F6 运行当前战斗场景或按 F5 运行项目。Web 版点击开始或按空格开战，D 对应底鼓，F 对应军鼓。平板可点按底部两块鼓垫。罗兰模块通过 USB MIDI 接入，在支持 Web MIDI 的浏览器中选择连接。模块本机负责实体鼓的返听。

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
