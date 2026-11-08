# Installation / 安装说明

## English

Test image: `byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.1.0-test.1`.
Supported image platforms: `linux/arm64`, `linux/amd64`.

### CUBE Docker / Add-on settings

The host must support running add-on containers. Use the following settings;
replace `<CUBE_IP>` with the address you use to open CUBE from your browser.
CUBE's image search and download also require access to Docker Hub.

| Setting | Value |
| --- | --- |
| Container port | `3030/tcp` |
| Host port | `3033` (example) |
| Network | bridge, mapping host `3033` to container `3030` |
| Persistent volume | a dedicated named volume at `/app/data` |
| `SETUP_PUBLIC_ORIGIN` | `http://<CUBE_IP>:3033` |
| `SETUP_ACCESS_KEY` | a private random key, 32–512 characters |
| Restart policy | `unless-stopped`, where supported |

The image defaults to `DASHBOARD_MODE=setup`, `HOST=0.0.0.0`, `PORT=3030`
and `DATA_DIR=/app/data`. It runs as UID 1000. An existing bind-mounted
directory must be writable by that user. No privileged mode or Docker socket
mount is needed. For host networking, set `PORT=3033` and do not map ports.
The origin must exactly match the browser URL, including scheme and port.

Generate a management key locally with `openssl rand -hex 24` and store it
privately. Open `http://<CUBE_IP>:3033/setup`, unlock management, sign in to
Bambu and select a printer. Do not send passwords, codes or tokens to others.

### Another Docker host

This example is for a POSIX shell. Replace `<HOST_IP>` before running it:

```sh
export SETUP_ACCESS_KEY="$(openssl rand -hex 24)"
docker run -d --name bambu-cube-dashboard \
  --restart unless-stopped \
  -p 3033:3030 \
  -v bambu-cube-data:/app/data \
  -e SETUP_PUBLIC_ORIGIN=http://<HOST_IP>:3033 \
  -e SETUP_ACCESS_KEY \
  byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.1.0-test.1
```

Keep the service on a trusted LAN. There is no automatic public-Internet
access configuration. HTTP is used for this LAN example; TLS termination, if
used, must match the configured origin.

### CUBE cards and CAST

1. Open `/cast-config` in the service's web interface.
2. Choose print status, job summary and the desired AMS units or active material.
3. Enter the CUBE origin and the dashboard service origin reachable by the
   browser displaying the cards, for example `http://<HOST_IP>:3033`.
4. Connect CUBE, approve the request in CUBE if prompted, then sync the cards.
5. Refresh CUBE's custom-card list if needed. Choose and arrange the new cards
   in your CAST panel.

The original overview card and detail view remain comprehensive. Each selected
AMS profile creates a separate functional card. Unchecking a card stops future
sync for that profile; it does not delete existing CUBE cards or panel layouts.

Restarting with the same data volume restores saved configuration and sessions.
Removing the volume removes this data. The current release does not refresh
expired cloud tokens automatically; sign in again when required.

## 简体中文

镜像支持 ARM64 和 AMD64。CUBE 主机需要具备 Add-on 容器运行能力，并且能够
访问 Docker Hub。当前镜像已发布；CUBE 内安装和持续运行仍需后续实测。

- 桥接网络映射宿主 `3033` 到容器 `3030/tcp`，持久卷挂载至 `/app/data`。
- `SETUP_PUBLIC_ORIGIN` 填浏览器实际访问地址，例如 `http://<CUBE_IP>:3033`，
  协议与端口必须一致。
- `SETUP_ACCESS_KEY` 使用自己的 32–512 字符随机密钥，可在本机运行
  `openssl rand -hex 24` 生成并私下保存。
- 镜像以 UID 1000 运行，数据目录须可写；不要开启特权模式或挂载 Docker socket。
- 打开 `/setup` 解锁、登录拓竹并选机，再进入 `/cast-config` 选择卡片、AMS 和语言。
- 填写 CUBE 地址及浏览器可达的卡片服务地址，连接并按提示授权，最后同步卡片。
- 在 CUBE 中选择、排列 CAST 卡片；原综合卡与详情继续保留完整布局。
- 取消勾选不自动删除已有卡片或宿主面板。重启请保留数据卷；令牌到期后重新登录。

在另一台 Docker 主机运行时，可参考上方命令，并将 `<HOST_IP>` 替换为该主机
的局域网地址。服务需要被展示 CUBE／CAST 的浏览器访问到；本项目不自动配置
公网访问。密码、验证码和令牌不要写入镜像、截图或公开仓库。
