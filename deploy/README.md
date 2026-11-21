# Docker deployment / Docker 部署

For CUBE Add-on settings, remote management access and the published image,
see the bilingual [installation guide](../docs/INSTALL.md).

Source and Docker image version **0.2.2**. The image is available as
`byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.2.2`. Building the source below does not publish a new image.

## Build and run locally

From the repository root:

```sh
docker compose --env-file deploy/example.env -f deploy/compose.yaml up --build -d
```

Open `http://127.0.0.1:3031/setup`, sign in to Bambu and select a printer.
The service defaults to setup mode with a new named data volume. Passwords and
verification codes are not persisted; session tokens remain in the data volume.
The default local bind address does not expose management to your LAN.

The image opens Bambu sign-in directly on a trusted LAN. Installations using an explicit management key can keep their settings as described in the installation guide. Use
`compose.cube-test.yaml` with `PRINT_ROOM_IMAGE` set locally when testing an already built image.

## Build a versioned image

```sh
docker build --build-arg VERSION=0.2.2 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  -f deploy/Dockerfile -t bambu-cube-dashboard:0.2.2 .
```

The image runs as a non-root user, stores state at `/app/data`, and needs no
privileged mode or Docker socket. `deploy/Dockerfile.dockerignore` restricts the
build context to runtime files and license notices.

`smoke-image.mjs` checks a locally available multi-platform image using isolated
containers and temporary data volumes. It uses ports 3035/3036 and removes its
own test resources. `card-relay.mjs` and `local-registry.mjs` provide optional
development helpers; their unit tests use synthetic data.

## 中文

CUBE Add-on参数、远程管理和测试镜像使用方式见[安装说明](../docs/INSTALL.md)。
Docker Hub 镜像标签为 0.2.2。上面的命令可在本机重新构建。

在项目根目录执行Compose命令后，打开本机3031端口的setup页面登录并选机。
本地 Compose 默认只监听回环地址。CUBE 中的镜像默认支持局域网直接登录拓竹，状态保存在独立数据卷中。
不要将密码、验证码、令牌或真实环境配置提交到仓库。
