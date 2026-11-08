import { createCardDefinition, registerCard } from './index.ts';

export async function main(args = process.argv.slice(2), env = process.env): Promise<void> {
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { apply = true; continue; }
    if (args[i] === '--help') {
      console.log('node packages/cube-client/src/cli.ts --url http://LAN-HOST:3030 [--label NAME] [--card-id ID] [--apply]\n默认 dry-run。实际写入另需 CUBE_URL 和 CUBE_TOKEN 环境变量。');
      return;
    }
    if (!['--url', '--label', '--card-id'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('参数无效，使用 --help 查看说明');
    values.set(args[i], args[++i]);
  }
  const dashboardUrl = values.get('--url') ?? env.DASHBOARD_URL;
  if (!dashboardUrl) throw new Error('需要 --url 或 DASHBOARD_URL，使用浏览器可达的局域网地址');
  const definition = createCardDefinition(dashboardUrl, values.get('--label'));
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', api: '/open-api/v2/rest/ui/cards', definition }, null, 2));
    return;
  }
  if (!env.CUBE_URL || !env.CUBE_TOKEN) throw new Error('实际写入需要 CUBE_URL 和 CUBE_TOKEN；不要把 Token 作为命令行参数');
  console.log(JSON.stringify(await registerCard({ cubeUrl: env.CUBE_URL, token: env.CUBE_TOKEN, definition, cardId: values.get('--card-id') })));
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : '注册失败'); process.exitCode = 1; });
}
