# oldhigh_audio — 微信小程序「复读机」

面向老人的语音复读小程序。**纯前端：无后端、无云开发、录音只存在本地临时目录**。
主要使用场景：录一段音 → 收藏 → 反复听 / 变速 / A-B 循环；以及「跟读」——说完一句自动回放自己的声音。

AppID `wxd124940fbee66d6f`，基础库 `3.12.0`，四个 tab：录音 / 复读机 / 跟读 / 收藏。

## 目录

| 路径 | 职责 |
| --- | --- |
| `pages/record_cloud/` | 录音（mp3，最长 10 分钟）+ 播放上次录音 + 重命名 + 收藏 |
| `pages/fav/` | 收藏列表：播放 / 重命名 / 删除 |
| `pages/repeat/` | 复读机：选收藏、变速、循环、A-B 循环 |
| `pages/live/` | **跟读**（核心，见下）：实时 PCM 录音 → VAD 判停 → 自动回放 |
| `app.js` | 首开一次性弹窗（介绍跟读模式，跳转 tab） |
| `assets/` | tabBar 图标：`xxx.png` 灰绿 `#8CA09B`，`xxx_on.png` 亮绿 `#1ABC8C`，128×128、<40KB |
| `cloudfunctions/` | **历史残留，页面未调用 `wx.cloud`**，改动无需关心 |
| `utils/util.js` | 只有一个 `formatTime` |

## 跟读页（`pages/live/`）架构

模块级只有一个 `recorder = wx.getRecorderManager()` 和一个 `audio = wx.createInnerAudioContext()`，
回调通过 `livePage` 单例转发到页面实例。**不要新建第二个 RecorderManager 实例**。

### 数据流

```
recorder.start({format:'PCM', frameSize:2KB, sampleRate:24000})
  → onFrameRecorded 每帧 ~43ms → pushFrame()
  → VAD: RMS 能量 vs 自适应噪声底(前 10 帧标定,静音期慢速 EMA)
  → 连续 2 帧超阈值 = 开口;累计静音 ≥ silenceMs(默认 700) = 说完
  → 拼接帧 + 峰值归一化(目标 88% 满幅,最多 4x) → 手写 44 字节 WAV 头
  → 写入 USER_DATA_PATH/live_<ts>.wav → InnerAudioContext 播放
  → 播完/被打断 → 回到监听,循环
```

### 状态机

`idle → listening(正在听) → playing(正在播放) → listening`
播放期间：耳机模式 + 关闭「等播放完」时，开口即 `audio.stop()` 打断；
外放模式或「等播放完」开启时**完全跳过 VAD**（麦克风会录到自己的声音，必然自激）。

### 录音器三层保护（不要删，删了 10 分钟后会静默断录）

1. **9.5 分钟主动换血** `PRE_RESTART_MS`：等不在说话、不在播放时 `recorder.stop()`，新窗口重新计时
2. **停止后自动重启** `handleRecStop`：会话中任何非用户停止 → 400ms 后 `startRecorder()`
3. **2 秒健康检查** `checkHealth`：超过 `STALL_MS`(2.5s) 没帧 → 强制 stop + 700ms 后 start；
   期间用 `ignoreNextStop` 吞掉自己触发的那次 `onStop`

用户主动结束走 `stopSession()`：先把 `data.session` 置 false，再 `recorder.stop()`，
这样 `handleRecStop` 走「丢弃片段」分支而不是重启。

### 关键约定

- **状态以 `this.data.session` 为准**，不要另设 `this.session`（历史上两套状态导致按钮不切换）
- **监听器用具名引用**注册并在卸载时 `offXxx`：RecorderManager 是全局单例，
  匿名监听会跨页面叠加。`pages/record_cloud` 的 `_onRecStop` / `_onPlayerEnded` 等就是这个原因
- **灰色 `debugText` 是主要排障手段**：帧数、音量倍数、录音路由、重启过程都打在这里
- 页面切走（`onHide`）必须结束会话：`live` 直接 `endSession()`，`record_cloud` 自动 `onStop()`
- 会话期间 `wx.setKeepScreenOn(true)`；手动锁屏/切后台会结束录音（微信限制，无解）
- 进入跟读页会 `cleanupOldSegs()` 清理崩溃残留的 `live_*.wav`

### 为什么手写 WAV

`InnerAudioContext` 不支持裸 PCM，RecorderManager 的 PCM 帧也没有文件路径，
所以每段自己拼 WAV 头写临时文件。`frameSize` 仅支持 mp3 / pcm，`format` 必须写大写 `'PCM'`。

### 麦克风选择：做不到

小程序没有选择输入设备的 API。`audioSource: 'auto'` 名义上插耳机切耳机麦，
但鸿蒙/部分安卓不落实；试过 `audioMode: 'voiceChat'`（通话路由，需基础库 3.17.3+）**在鸿蒙上无效，已回退**。
蓝牙耳机基本无解。不要重复尝试这条线。

## 声纹授权（审核硬要求，不要绕过）

审核驳回原因：采集用户声音属于收集个人信息，必须有独立的《声纹授权协议》并取得同意后才能调用麦克风。

- 协议页：`pages/agreement/`（非 tabBar，`?consent=1` 时显示「同意并继续」）
- 工具：`utils/voiceConsent.js` — `hasConsent()` / `grantConsent()` / `openAgreement()`
- 拦截点：`record_cloud.onStart` 与 `live.startSession` 的第一行，未同意就跳到协议页，
  同意后靠页面的 `onShow` 里 `pendingConsentStart` 续跑
- 存储 key `voiceConsentV1`，协议有实质修改时把版本号加一，用户会被要求重新同意
- 入口：录音页底部、跟读页设置面板里各有一个《声纹授权协议》链接
- **新增任何调用 `recorder.start` / `wx.authorize({scope:'scope.record'})` 的路径，都必须先过 `hasConsent()`**

## 本地存储 key

| key | 内容 |
| --- | --- |
| `favList` | 收藏列表 `[{id,name,duration,path,startedAt,startedAtText}]` |
| `lastRecord` | 上次录音 |
| `liveSilenceMs` | 判停阈值 500–2000，默认 700 |
| `liveMode` | `headphone` / `speaker` |
| `liveWaitPlayEnd` | 是否等播放完再继续听，默认 true |
| `liveIntroShown` | 首开介绍弹窗已展示标记 |
| `voiceConsentV1` | 《声纹授权协议》已同意 |

## 开发约定

- 注释、提示文案都写中文；UI 面向老人：大字号、大按钮、少层级（设置收在右上角「设置」胶囊里）
- 改完 JS 跑一次 `node --check pages/live/index.js`（没有构建步骤、没有测试）
- 真机验证为主：开发者工具只能看 UI，录音/播放行为必须真机测（iOS + 安卓/鸿蒙）
- 分支：默认分支 `main`，功能开发在 `feat/live-follow-along`，不要在 main 上直接提交
- 不做：后端、云存储、保存跟读片段、分享/阅后即焚类功能（已被下过线）
- 待真机验证：安卓回放时说话能否打断、来电挂断后能否自动恢复、蓝牙耳机路由
