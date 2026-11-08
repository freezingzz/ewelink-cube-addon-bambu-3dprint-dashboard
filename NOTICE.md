# License scope and third-party notices

The root [MIT License](LICENSE) applies to independently authored project code
and documentation. It does not relicense third-party code or portions adapted
from it. The combined distribution must respect the licenses of all included
components; this is not a claim that every file is MIT-licensed.

## PrintSphere protocol reference

Protocol work references `cptkirki/PrintSphere`, copyright (c) 2026 Cpt_Kirk,
commit `32ad5aeb8b5da999de9d94bd9f4d2ec0f065c609` (v1.6.2), particularly
`main/src/bambu_cloud_client.cpp`.

Adapted protocol mapping in `packages/printer-bambu/src/parser.ts` and
cloud authentication in `apps/server/src/cloud-auth.ts` retain the upstream
**Federation Non-Commercial License (FNCL) v1.1**. Related adapted portions are
covered by the existing [protocol notice](packages/printer-bambu/NOTICE.md).
The retained [license text](packages/printer-bambu/UPSTREAM_LICENSE) allows
sharing and modifications for non-commercial purposes and requires a separate
written license from the upstream copyright holder for commercial use.
The root MIT license does not grant those upstream rights.

The module notice records the reference, modifications and validation limits.
Keep it and the upstream license when redistributing the affected components.
Dependencies retain their own licenses in their packages.

## 中文说明

根目录 MIT 适用于本项目独立原创代码与文档，不改变第三方或派生部分的许可。
现有 PrintSphere 协议映射与云端登录适配保留 FNCL v1.1；相关说明和修改记录
见协议模块 NOTICE，商业使用相关部分须取得上游版权方的单独书面许可。
因此当前组合项目不能被理解为所有文件均为 MIT，或 MIT 允许忽略上游限制。
