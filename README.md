# [下载安装包](https://github.com/for-fo-f-zsq/7fa4-chat/releases)

推荐从 **GitHub Releases** 下载（仓库即将公开，**全部历史版本**都会保留）：

- [GitHub Releases（全部历史版本）](https://github.com/for-fo-f-zsq/7fa4-chat/releases)
- [GitHub 仓库](https://github.com/for-fo-f-zsq/7fa4-chat)
- [GitLab 软件包（仅保留最新版本）](https://jx.7fa4.cn:9080/student-archive/7fa4-chat/-/packages)
- [GitLab 项目页](https://jx.7fa4.cn:9080/projects/886)

客户端「检查更新」读取的也是 GitLab 上的最新版本。

支持 Windows / Linux / macOS 桌面端与 Android 安卓端，**不提供网页版，也不需要自建后端**。

一个基于[7FA4 Chat API](https://jx.7fa4.cn:8888/article/134)，使用 [electron](https://www.electronjs.org/)+[VUE3](https://vuejs.org/)(vue+js+css) 构建的跨平台聊天软件

## 下载与安装

| 平台 | 安装包 |
| --- | --- |
| Windows | 安装包（.exe）/ 便携版（.zip），x64、arm64 |
| Linux | AppImage / deb，x64、arm64 |
| macOS | dmg / zip，Intel、Apple Silicon |
| Android | APK |

## 功能

目前已经完全支持：

- 发送 markdown 消息/文件/表情/自定义表情
- 文件通过 base64 直接发送，图片自动压缩至 102400 字符以内
- 自定义表情包：添加本地图片/动图为表情，添加他人发送的表情
- 增量式获取消息，智能去重避免重复获取
- 获取并显示好友/群聊的信息
- 在本地存储消息、个人设置等数据
- 获取并显示自己的 token/username/realname 等信息
- 群聊操作：新建/离开群聊，添加/踢出成员，禁言，设置/取消管理员，转让群主（仅群主），解散群聊
- Markdown 渲染，支持行内公式 `$...$` 与块级公式 `$$...$$`（KaTeX）
- 文件/图片点击在模态框中预览（图片大图、文本内容、不支持则提示）
- 长文本折叠显示「查看更多」，在模态框中展开完整内容
- 消息右键菜单：复制（图片/文件写入剪贴板）、转发、下载、添加表情
- 拖拽消息气泡：文本消息拖到输入框编辑，拖到会话列表转发；非文本消息拖拽转发
- 会话置顶，排序按置顶 > 有 realname > 最新消息时间
- 系统通知弹窗（窗口不聚焦时新消息提醒），点击弹窗跳转到对应聊天
- Ctrl+Enter 发送，Enter 换行
- 自定义快捷键，可在设置中修改
- 多主题切换（22 款主题），淡入淡出过渡动画
- 引用他人消息，@他人，@所有人
- 个人头像默认浅灰色背景 + 首字符（头像上传已移除）
- 按年级显示颜色/自定义年级颜色
- 双击头像/昵称拍一拍对方
- 屏蔽群聊：退出后检测到被拉入自动退出
- 不显示会话：从列表中隐藏，仍可通过搜索找到，右键「取消不显示」恢复
- 消息搜索（当前会话/全局搜索）
- 输入草稿持久化，切换会话自动保存/恢复，会话列表显示草稿标识
- 图片粘贴发送（Ctrl+V），Enter/Ctrl+Enter 发送方式切换
- Markdown 实时预览，文件待发送队列
- 未读消息计数徽章，任务栏图标显示总未读数，全部标记已读
- 会话免打扰/全局免打扰开关，群聊最后消息发送者名称
- 消息多选模式，批量转发
- 消息日期分组线，代码块一键复制按钮，消息加载动画
- 通知隐私模式，通知聚合，通知声音
- 搜索关键词高亮，搜索结果分页加载
- 网络状态检测，断网提示横幅
- 字体大小调节，数据缓存管理
- 聊天记录备份/恢复（导出/导入到文件）
- 深色模式跟随系统
- 工具中心：Markdown 编辑器（实时预览/导出图片）、图片编辑、交互式图编辑器、科学计算器、四宫格计时器、GeoGebra 绘图；6 个工具均为独立静态包，可在应用内按需下载/更新/卸载，逐文件 sha256 校验，下载后可离线使用
- ……

工具包发布在 GitLab 独立软件包 `TOOLS` 中（仅保留最新版，下载地址
`https://jx.7fa4.cn:9080/api/v4/projects/886/packages/generic/TOOLS/latest/tools.json`）。

赞助名单与赞赏码由 GitLab 仓库提供（本仓库 `assets/sponsors.json`、`assets/donate-qr.jpg` 为同一份备份），可在应用内「赞助」面板查看。

如果你有什么好的建议，请前往[议题/issues](https://jx.7fa4.cn:9080/student-archive/7fa4-chat/-/issues)提交。

## 开发与构建

需要 Node.js 22+，并完整安装依赖（不要加 `--omit=dev`）：

```bash
npm install
npm run dev      # 开发调试（electron-vite）
npm run build    # 构建渲染层与主进程
npm run dist     # 打包当前平台的安装包（输出到 build/）

# 工具中心（独立工具包，发布到 GitLab 的 TOOLS 软件包）
npm run build:tools    # 构建到 dist-tools/（不入库）
npm run publish:tools                     # 发布预演（dry-run，不写远端）
npm run publish:tools -- --apply          # 真正发布（先删旧 TOOLS 包再整包上传，需环境变量 GITLAB_TOKEN）
```

Android 端基于 Capacitor，复用同一套渲染层：

```bash
node scripts/build-web.mjs
npx cap sync android
cd android
./gradlew assembleRelease   # 产物：android/app/build/outputs/apk/release/
```

Android 构建需要 JDK 21 与 Android SDK（compileSdk 35）。
