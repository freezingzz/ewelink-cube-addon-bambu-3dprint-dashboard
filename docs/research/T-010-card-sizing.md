# CUBE 卡片尺寸核实与预览基线

核查：2026-11-07；执行者：协调者；版本基线 CUBE OS **2.15.0**（2026-10-29 稳定发布）。这是官方发布物的静态实现取证与本地浏览器验证，尚未部署或运行 CUBE。数值不是跨版本 API 保证。

## 来源与证据层次

1. [官方 Developer & API Guide](https://cube.ewelink.cc/resources/developer-and-api-guide)：UI Card 注册规定 web 1×1／2×1、CAST 2×2，以及 iframe／详情入口。文档未提供完整 CSS 像素尺寸表。
2. [官方 Weather API Add-on](https://github.com/eWeLinkCUBE/cc.ewelink.tile2cube-weatherapi.addon)：其 rem 适配与详情宽度用于交叉验证；子网页的设计基准不能用作宿主网格尺寸。
3. [官方 v2.15.0 发布](https://github.com/eWeLinkCUBE/CUBE-OS/releases/tag/v2.15.0) 的 [Docker 发布物](https://github.com/eWeLinkCUBE/CUBE-OS/pkgs/container/cube-os)：匿名只读拉取镜像文件流并提取前端 JS/CSS，无 Docker 安装、系统启动或凭证访问。

镜像 `ghcr.io/ewelinkcube/cube-os:2.15.0`，linux/arm64 平台 manifest：
`sha256:a9f2503bd6241b08459b1c6cfeb8adce971effd84a489631fe109ba2cc1ea400`。

静态资源在镜像里的路径与 SHA-256：

| 路径（/var/www/html/ 下） | SHA-256 |
| --- | --- |
| web/assets/UiCardPage.52b93430.js | 7cab389722c31399d03a183f51f717049faaa2e8c8e7cb44b0e7d3de3a07ed2e |
| web/assets/UiCardPage.72e06607.css | 72e066075269c074a9e496891b39cd0b182295e449cf84c31af85ff5021c5c96 |
| cast/assets/index.14002171.js | 6b21be5c8fac8c60c7abb18a73f6653f30613f0c174774babbc8a1ee25157868 |
| cast/assets/index.ac81e6f2.css | ac81e6f22ae29edb8cf093cacf6cd4ec896c16a1805f6798e5ab6efaf0690ff0 |

未将整套官方前端代码复制进项目；这里只记录实现事实、定位信息和自主实现的尺寸公式。

## 管理页：固定尺寸

| 类型 | 实际 iframe 内容区 | 依据 |
| --- | --- | --- |
| 1×1 | **170×170 CSS px** | UiCardPage 的尺寸计算分支 |
| 2×1 | **368×170 CSS px** | 同上；两格宽度 170×2＋28 |
| 卡片间距 | 28 CSS px | ui-card-wrap 的 gap |
| 详情弹窗 | **宽 457 CSS px；高度动态** | device-modal-wrapper 下 ant-modal 宽度；body 高度来自宿主 CSS 变量 |

卡片 wrapper 无内容 padding，iframe width/height=100%，无边框；父卡片圆角12px、overflow hidden。悬浮操作条叠加在底部，不是常驻扣除的38px内容区。sandbox 为 allow-scripts / allow-forms / allow-same-origin。

详情宿主标题栏为56px绝对定位叠加层；本地详情暂只模拟457px内容宽度及900px测试高度，**未复刻宿主标题栏／高度算法**。不能将900写成官方高度。正式集成时核对标题避让与模态层滚动。

## CAST：响应式网格，不是固定 640×640

2.15.0 同时保留旧布局和 GridStack 布局。默认预览选取 **GridStack**，不能拿旧布局的单个 CSS 声明覆盖全部情境。

静态资源可定位的规则：

- `Ls1` / `bi0` 初始化 GridStack：手机6列；桌面读取当前 CAST pad column，缺省12列，可配置16列。
- `Bs1` 将 UI 卡片的 2×2 转为 `gs-w=2` / `gs-h=2`，不是设备分辨率，也不是管理页1×1的等比例放大。
- GridStack 的自动行高等于列宽（四边 margin 相等）；内容每边 inset 为0.75rem。
- `.grid-stack` 水平负 margin 抵消宿主水平 padding；`.grid-stack-item-content` 的首个组件被设为100%宽高，覆盖旧卡片8rem尺寸。
- 桌面12列宿主 max-width=912px；16列 max-width=1283px。
- rem 基准16px；手机（宽<768px）根字号=16×屏宽/750；桌面宽小于当前912／1283基准时按比例缩小，否则16px。

令 G 为实际 grid 元素宽度，C 为列数，R 为根字号，则2×2 iframe 内容边长：

`S = 2 × G / C − 1.5 × R`。

| 预览场景 | 条件 | 推导的内容尺寸 |
| --- | --- | --- |
| 桌面12列 | 屏宽≥912；G=912，C=12，R=16 | **128×128 CSS px** |
| 桌面16列 | 屏宽≥1283；G=1283，C=16，R=16 | **136.375×136.375 CSS px** |
| 手机示例 | 屏宽375；G=375，C=6，R=8 | **113×113 CSS px** |

这些是从官方前端规则推导的特定条件结果，尚未在运行中的 CUBE 上测量。手机示例不是给所有手机固定113px。旧布局桌面卡片8rem，在根字号16px时同样128px；旧手机卡片12.875rem，375px屏宽时为103px，不能与 GridStack 的113px混用。最终需记录用户部署版本、布局模式、浏览器视口和列数再复核。

## 本项目预览与信息容量

- 首页使用真实 iframe 设置内容宽高；100% 为1:1 CSS像素，200%仅放大显示，不改变子页面布局宽度。
- 展示版本与来源；允许手动改尺寸、恢复规格。CAST 提供上述三个宿主场景。
- 固定小卡重新排版，不将大卡整体缩小：1×1优先状态／任务／进度／温度；2×1加入封面／AMS色点；128px CAST保留状态／缩略封面／进度／耗材色点。完整AMS槽位、湿度、余量及连接信息放详情。
- 小卡错误用单行摘要，详情保留错误明细。信息层级为可逆原型选择，尚未视为用户最终确认。
- CSS像素不是物理像素；Retina/DPR、浏览器缩放和系统显示缩放会改变实际屏幕像素数量与物理厘米数。这里不承诺跨设备的物理大小一致。
- 本地截图与 iframe 校准不能替代 CUBE、iHost 或真实H2C验收；旧版系统须重新校准。

## 验证

`npm test`、`npm run typecheck`、`npm run test:browser`。浏览器实际测量iframe布局视口、2倍显示、手动改宽与恢复，验证四种布局及小尺寸未知／异常／多AMS／缺图场景。截图及报告在忽略目录 `artifacts/browser/`，结果见 T-010 交接。
