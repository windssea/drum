# 首战原型验证

本次使用指定 Windows 控制台版 Godot `4.7.2.stable.official.ed1daf0bf` 导入项目、运行无窗口测试，并用同版本单线程 Web 模板导出。

## 战斗判定

在仓库根目录执行以下 PowerShell 命令。通过条件为 37 项通过、0 项失败及退出码 0。

```powershell
& 'D:/dev/windssea/game/godot4.7.2/Godot_v4.7.2-stable_win64_console.exe' --headless --path game --script (Resolve-Path tests/combat.gd).Path
```

测试直接调用实际 Godot 场景的输入路径。核对六次击中获胜、±42 与 ±110 毫秒边界、错鼓、重复击打、乐句外输入、三次受伤失败、残甲结果和重置。

## 浏览器

本机 Chrome 运行 Web 导出，在 1152×720 的视口完整走过胜利和失败。成功回合经键盘、浏览器触屏手势和模拟 Roland MIDI 打完两段回应，六次精准，护甲清空，船体完好。失败回合由一次多击与两次漏击触发。

这台机器的单次完整胜利回合，活动帧间隔 p95 约 17 ms。测试记录的是浏览器输入事件至下一次 WebGL 绘制调用，无法代替鼓棒触面至屏幕点亮、扬声器实际出声的测量。实体罗兰鼓与目标平板的测量方法及验收标准见[策划的验收章节](game-design.md#验收与测量)。

## 发布

Worker 提供 Godot 加载器、页面及 `index.pck`，私有 R2 提供约 9.8 MiB 的 Gzip 压缩引擎（解压后 39,514,754 字节）。客户端从同源 `/index.wasm` 加载。贴图与中文子集字库已经进入游戏包。美术设定集单独保存在仓库。
