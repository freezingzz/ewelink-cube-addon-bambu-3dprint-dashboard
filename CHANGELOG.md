# Changelog / 更新说明

## 0.2.2 · Docker Hub · 2026-11-20

- New CUBE installs open Bambu Lab sign-in directly. A verified cloud account owns the installation. Existing explicit management keys keep their unlock flow.
- Verified on CUBE OS 2.15.0 with the add-on running on the gateway. A real H2C supplied idle and AMS data to the CAST player after gateway authorization and card sync.
- 已在 CUBE OS 2.15.0 上安装插件，完成网关授权与卡片同步，CAST 播放器显示了真实 H2C 待机和 AMS 数据。
- 新安装打开「账号与设备」即可登录拓竹并选机。已绑定账号的安装继续使用同一账号，原有显式管理密钥配置继续生效。

## 0.2.1 · Docker Hub · 2026-11-20

- CUBE users can configure the management origin and unlock key using `management.env` in the private data volume. A blocked settings page now explains how to enable access.
- CUBE 运行界面只有网络、端口和卷时，可在私有数据卷中配置管理地址与解锁密钥。设置页现在会提示具体操作。

## 0.2.0 · Docker Hub · 2026-11-20

- Docker Hub tag `0.2.0` supports Linux ARM64 and AMD64. Both containers passed local startup and restart checks.
- Docker Hub 已发布 `0.2.0`，ARM64 和 AMD64 均已通过本地容器启动和重启验证。
- One UI resource advertises nine CAST grids, with 2×2 as the default. The Web overview and drawer retain their original layouts.
- One-unit AMS paging in both large layouts, with stage and three temperatures in 6×6. Preview the registered layouts with live or demo data in English and Simplified Chinese.
- Earlier CAST URLs continue to work. Sync detects earlier registrations and lets the owner review them before migrating. On CUBE OS 2.15.0, all nine sizes displayed live H2C idle data after reopening the Pad and emulated Phone players. Tile position and AMS page selection were also checked. The setup page now explains how to resolve a card conflict after an address change.
- 一张卡注册九档 CAST 网格，默认 2×2。6×3 优先封面，6×4 与 6×6 每页一个耗材单元，6×6 增加阶段和三项温度。已接入双语预览，旧布局可继续使用。在 CUBE OS 2.15.0 上，Pad 和模拟 Phone 两套布局保存后重新播放，九档均显示真实 H2C 待机数据。另已验证拖动位置保存和 AMS 翻页。配置页现提供换网后出现卡片冲突时的处理提示。

## 0.1.0 — 2026-11-08

First public source release of Bambu 3DPrint Dashboard for eWeLink CUBE.

- Read-only Bambu cloud sign-in, device selection and H2C monitoring.
- AMS unit/slot information and current-job cover handling.
- Desktop web management, CUBE overview/detail views and configurable CAST status, material and job-summary cards.
- English and Simplified Chinese interfaces, synthetic demo data and Docker build files.
- Real idle-data screenshots, bilingual installation instructions and license notices.

### Validation and known limitations

- Real H2C cloud login, idle telemetry, temperatures, AMS and session restart recovery have been observed. Active-print progress, real job covers, ETA and AMS changes still need a real print.
- CUBE OS 2.15.0 custom cards and split CAST cards have been observed with real idle data using a separately hosted backend. Installation and sustained operation inside CUBE remain unverified.
- Each independent CAST card currently also creates an overview entry in CUBE Custom cards. One CUBE entry with several independent CAST cards is not supported through the tested API.
- Cloud token expiry requires signing in again. Other printer models, 32-bit ARM, printer controls, video and multi-printer management are outside this release's validated scope.
- The existing Docker Hub tag `0.1.0-test.1` is an earlier test build, not an image of this source release. No Docker image is republished as part of this release.
- Original code is MIT-licensed. Adapted PrintSphere portions retain FNCL v1.1; see [NOTICE](NOTICE.md).

### 中文

首次公开源码版本：支持拓竹云端只读登录与选机、H2C监控、AMS、任务封面处理、桌面管理、CUBE综合卡／详情和可配置CAST功能卡，提供中英文界面、演示数据及Docker构建文件。

已观察真实H2C云端待机、温度、AMS和会话重启恢复，以及独立后台驱动的CUBE OS 2.15.0卡片／CAST。真实打印中的进度、封面、预计结束和AMS变化，以及CUBE内安装与持续运行仍待验证。

每张独立CAST卡目前也会产生CUBE综合卡条目；实测接口不支持“一张CUBE卡＋多张独立CAST卡”。令牌到期需重新登录，其他打印机型号／32位ARM未验证。本版不包含打印控制、视频和多打印机管理。Docker Hub现有`0.1.0-test.1`为较早测试构建，本次不更新镜像。原创代码使用MIT；PrintSphere派生部分保留FNCL v1.1，详见NOTICE。
