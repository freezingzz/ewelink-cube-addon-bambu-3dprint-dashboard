# CUBE Web / CAST 注册分离核查

2026-11-08；T-021；实测 CUBE OS 2.15.0。目标：CUBE 仅一张综合卡，用户勾选多张独立 CAST 卡。**当前实现未满足此目标；未实施迁移。**

## 代码根因

`apps/server/src/cast-config.ts` 的 `castDefinitions` 为每个选中的 profile 调用 `createCardDefinition`，只修改 CAST URL，保留相同 Web 尺寸与详情 URL。`sync` 为每项注册完整 UI 资源。因此原综合卡加三类 profile 得到四张外观相同的 CUBE 卡。不是重复云端连接，也不是刷新时重复 POST。

## 官方接口与实测

[官方 Open API v2，8.2 节](https://ewelink.cc/ewelink-cube/introduce-open-api/document/)：POST `/ui/cards` 的 `web_settings` 必填，Web dimensions 至少一项；CAST 配置可选。PUT 只公开尺寸选择和资源 URL，没有公开 Web 可见性或独立 CAST 实例参数。

使用独立唯一名称、相同合法 CAST 配置进行三次临时 POST；每次检查 payload.error，不把 HTTP 200 当作成功。均未创建资源。

| Web 配置变体 | HTTP | API error | 创建 |
| --- | --- | --- | --- |
| 省略 web_settings | 200 | 400 | 否 |
| web_settings=null | 200 | 500 | 否 |
| dimensions=[] | 200 | 400 | 否 |

时间 2026-11-08T12:00:42.390Z；操作前后列表均为四项，完整资源内容比较一致。未删除或改写用户卡片、面板。脱敏本地原始结果：忽略目录 `artifacts/cast-separation/api-probe.json`。

## 已部署宿主前端核对（只读）

读取网关实际公开静态资源 `index.bfca0918.js` 与 `UiCardPage.63ced242.js`，没有读取浏览器凭证或修改宿主。

- Web 页计算展示列表时直接遍历全部 uiCardList，按每项 web_settings.used 查找尺寸并渲染；没有独立 Web 隐藏筛选。
- CAST 的 castCardList 同样基于 uiCardList，仅跳过空 cast_settings；保留资源 ID，并按 used 选择一个 URL。
- 因此删除 Web 配置、空白页面、iframe 内 CSS 都不是已证实有效的“只保留一个 Web 条目”方案；一个资源的多尺寸配置也不能直接当作多个独立 CAST 实例。

下载过程中 VM 网络间歇失联，最终压缩请求完整读取 3,364,362 字节主包和 28,761 字节 UI 页包。未修改网卡或重启虚拟机。原始第三方 bundle 仅留在忽略目录，不纳入仓库。

## 结论与后续边界

当前注册模型有产品设计问题；已核验的公开 API 与宿主路径尚不能支持目标 1+N。不能称为“已修复”，也不能把四个 Web 入口当作最终验收。配置页补充中英文限制说明，现有注册与布局保留。

若获得官方的 CAST-only、Web 隐藏或每实例配置机制，应先用隔离资源验证，再迁移，保持原综合卡 ID 并核对已有 CAST 面板。将多个功能塞回一个 iframe、轮播或减少独立卡数量会改变用户已确认的交互，需要另行确认。云端 eWeLink CAST 的 iframe 宣传不能直接作为本地 CUBE CAST 支持同一功能的证据。
