# 界面语言 / UI languages

Print Room supports **English** and **简体中文** throughout the overview, account/device settings, card preview and all embedded card layouts. Use the **Language / 界面语言** selector in the sidebar; on phones it appears at the top.

The initial language follows this order: explicit `?lang=en` or `?lang=zh-CN`, saved browser preference, browser language. Chinese browser locales use Simplified Chinese; other unsupported languages fall back to English. Switching saves the preference locally and updates the current URL. Internal navigation and preview iframes keep the selected language. Independent card URLs can specify their own language.

Examples (replace the host/port for your installation):

- English overview: `http://127.0.0.1:3031/?lang=en`
- 中文总览：`http://127.0.0.1:3031/?lang=zh-CN`
- English settings: `http://127.0.0.1:3031/setup?lang=en`
- English card preview: `http://127.0.0.1:3031/preview?lang=en`
- English CAST card: `/card?layout=cast&lang=en`
- 中文 CAST 卡片：`/card?layout=cast&lang=zh-CN`

## 行为约定

- 界面语言与拓竹CN／GLOBAL账号地区无关。切换语言不重新登录、不重新选机、不发送云端认证请求。
- 管理页与设置页原地更新文案，保留输入框、密码／令牌／验证码内容及验证流程；正常提交后仍按原流程清空已提交的敏感字段。
- 用户打印机名、任务名、材料标识与未知厂商原文不翻译。应用已知错误按错误码提供中英说明；内置合成示例名称可以翻译，不能以此推断实机任务名会被翻译。
- 英文卡片采用短状态（Printing / Idle / Offline等），剩余时间例如`1h 36m`；未知值保持`—`，真实零值保留。完整提示留在title／详情中，长名称在自己的区域省略。
- 时间使用当前界面语言的日期格式和浏览器时区。未增加服务器语言／地区字段，快照契约不变。
- `lang`参数在禁用浏览器存储的卡片里仍可使用；保存偏好仅属于当前浏览器，不写入账号会话。已经用URL固定语言的其他卡片不会被另一页的切换连带修改。

## 维护入口

`apps/web/messages.js`集中英文文案，以原中文消息为稳定key，动态字段用`{0}`等占位符。`i18n.js`负责偏好、格式替换、原始静态HTML绑定与切换事件；静态绑定仅捕获初始已知UI节点，不扫描动态设备／任务内容。动态组件用`t()`，从保存的原始状态重绘，不依赖翻译后的状态做协议判断。`display.js`负责已知错误码和内置演示数据的展示，不修改原始快照。

新增／修改UI文案时同步语言目录和覆盖检查。新增语言需要补目录、默认规则、选择器和实际尺寸验证。保留现有CUBE视觉tokens，不通过整体缩小字号容纳英文。

## 验证

- `npm test`检查文案覆盖／占位符一致、偏好优先级、时长、错误与用户内容保留。
- `npm run test:i18n`检查英文总览与设置在1280／1440／1920／960／390宽度的显示、原地切换与刷新、输入／验证码保留、账号地区／会话隔离、导航、预览iframe、独立卡片和浏览器存储受限情况。
- `npm run test:browser`包含中英两种语言共168组卡片尺寸／状态碰撞检查。管理卡170×170和368×170保持固定；CAST实际尺寸仍按官方条件公式计算，136.375px小数iframe尺寸单独验证。
- `artifacts/i18n/bilingual-cards.png`为100%显示比例的中英文并排截图。十个iframe仅在这张静态对照图中停用SSE、读取各自REST快照，避免浏览器HTTP/1.1长连接数挤占图片请求；实时SSE由原有浏览器回归独立验证。截图不代表十卡实时联调，更不是CUBE实机截图。
- 生成截图／报告位于Git忽略的`artifacts/i18n`，不放入源码或镜像。真实账号表单不截图。CUBE宿主内的字体、裁切和语言仍待实际部署后验收。

## CAST功能卡（T-018）

`/cast-config?lang=en`切换管理界面英文；其中“Card language”独立控制本轮同步的新CAST卡，不改变原综合Web卡／详情语言。功能卡URL例：`/card?layout=cast&view=status&lang=en`。新增文案仍集中于messages.js；`cast-model.js`维护极小视图的短状态与时间格式。配置支持100%小数尺寸预览；手机导航改为两列，避免四个入口在英文下溢出。功能卡合成验证见`npm run test:cast`；真实中文待机宿主已观察，实际任务封面与ETA后续验证。
