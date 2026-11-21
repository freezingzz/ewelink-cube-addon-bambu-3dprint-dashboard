# Installation / 安装说明

## English

Docker image: `byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.2.2`.
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
| Restart policy | `unless-stopped`, where supported |

The image defaults to `DASHBOARD_MODE=setup`, `HOST=0.0.0.0`, `PORT=3030`
and `DATA_DIR=/app/data`. It runs as UID 1000. An existing bind-mounted
directory must be writable by that user. No privileged mode or Docker socket
mount is needed. For host networking, set `PORT=3033` and do not map ports.

Open the add-on and choose **Account & devices**, or open `http://<CUBE_IP>:3033/setup`. Sign in to Bambu Lab on your home LAN and select the printer. The first Bambu account verified by the cloud manages this installation. An additional browser signs in with the same Bambu account. Keep the volume when upgrading to retain the printer connection.

### Optional management key for existing deployments

Installations that explicitly set both `SETUP_PUBLIC_ORIGIN` and `SETUP_ACCESS_KEY` still unlock with that key. Existing `/app/data/management.env` files also retain this behavior.

### Another Docker host

Run this example in a POSIX shell, then open port 3033 on that host from your browser.

```sh
docker run -d --name bambu-cube-dashboard \
  --restart unless-stopped \
  -p 3033:3030 \
  -v bambu-cube-data:/app/data \
  byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.2.2
```

Keep the service on a trusted LAN. There is no automatic public-Internet
access configuration. HTTP is used for this LAN example; TLS termination, if
used, must match the configured origin.

### Configure the 0.2.2 dashboard

After signing in, open `/cast-config` to preview the nine sizes. Enter your CUBE address and the card service address reachable from the browser displaying the panel, then click **Connect CUBE**. Approve the request in the CUBE console. Return to the add-on, click **Connect CUBE** again, then **Save & sync cards**. Sync registers the dashboard once. When upgrading a panel that has 0.1.0 cards, record their placement before manually removing them in CUBE and adding the new dashboard. Removing a card can affect the existing panel. In the CUBE OS 2.15.0 editor, pick Pad or Phone and click the tile's bottom-right corner to cycle through its sizes. Drag the tile body to move it. Save and reopen the panel in the CAST player. Pad and Phone retain their sizes independently.

If the dashboard service moves to another address, first check the origin saved in CAST settings. An existing card embeds the previous address in its Web, drawer and CAST URLs. On CUBE OS 2.15.0, if syncing reports a conflict, identify the old dashboard and note its placement in each panel. Remove the confirmed old card in CUBE, sync once, select the replacement in those panels and save their layouts. A stable service address avoids repeating this step.

### CUBE cards and CAST in the published 0.1.0-test.1 image

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

1. 在 CUBE 的 Docker / Add-on 中安装 0.2.2 或 latest。
2. 运行时选 bridge，主机端口 3033 映射至容器端口 3030，给 `/app/data` 挂载专用卷。
3. 在家庭局域网打开 `http://<CUBE_IP>:3033/setup`，或从插件首页点「账号与设备」。
4. 使用拓竹账号登录，按拓竹提示完成验证，再选择打印机。第一个通过验证的拓竹账号管理此安装。其他浏览器使用同一账号登录。
5. 进入「CAST 配置」。使用以上端口时，CUBE 地址填 `http://<CUBE_IP>`，卡片服务地址填 `http://<CUBE_IP>:3033`。点「连接 CUBE」，在 CUBE 控制台确认授权，再回插件点一次「连接 CUBE」和「保存并同步卡片」。
6. 在 CAST 面板编辑器选中打印仪表盘，分别为 Pad 和 Phone 设置尺寸和位置。点卡片右下角切换尺寸，拖动主体移动卡片，保存后从 CAST 列表重新打开面板。

从其他电脑迁入或更新旧版分卡时，先记下旧卡在各面板的位置和尺寸。若同步提示同名冲突，核对旧卡的服务地址及归属，移除确认废弃的打印卡，回插件同步新卡，再在原面板选回并恢复布局。

升级时沿用已有数据卷即可保留连接。之前主动设置过管理密钥的安装仍使用原来的解锁方式。
