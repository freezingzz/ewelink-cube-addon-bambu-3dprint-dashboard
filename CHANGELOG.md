# Changelog / 更新说明

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
