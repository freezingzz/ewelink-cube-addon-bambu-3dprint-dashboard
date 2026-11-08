# Docker deployment / Docker 部署

For CUBE Add-on settings, remote management access and the published test image,
see the bilingual [installation guide](../docs/INSTALL.md).

GitHub source version: **0.1.0**. The published Docker Hub tag
`byteandscrew/ewelink-cube-addon-bambu-3dprint-dashboard:0.1.0-test.1`
is an earlier test build. Building the source below does not publish a new image.

## Build and run locally

From the repository root:

```sh
docker compose --env-file deploy/example.env -f deploy/compose.yaml up --build -d
```

Open `http://127.0.0.1:3031/setup`, sign in to Bambu and select a printer.
The service defaults to setup mode with a new named data volume. Passwords and
verification codes are not persisted; session tokens remain in the data volume.
The default local bind address does not expose management to your LAN.

To expose the service on another host, configure the exact browser origin and
a private management key as described in the installation guide. Use
`compose.cube-test.yaml` with `PRINT_ROOM_IMAGE`, `SETUP_PUBLIC_ORIGIN` and
`SETUP_ACCESS_KEY` set locally when testing an already built image.

## Build a versioned image

```sh
docker build --build-arg VERSION=0.1.0 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  -f deploy/Dockerfile -t bambu-cube-dashboard:0.1.0 .
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
源码版本为0.1.0；Docker Hub现有0.1.0-test.1是较早构建，以上命令只做本地构建，不上传镜像。

在项目根目录执行Compose命令后，打开本机3031端口的setup页面登录并选机。
默认只监听回环地址，状态保存在独立数据卷中；局域网访问须按安装说明配置精确访问地址和私密管理密钥。
不要将密码、验证码、令牌或真实环境配置提交到仓库。
