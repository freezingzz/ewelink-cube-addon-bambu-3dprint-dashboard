import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudMonitor } from '../apps/server/src/cloud-monitor.ts';
import { createDashboard } from '../apps/server/src/server.ts';
import { CoverCache } from '../apps/server/src/cover-cache.ts';
import { emptySnapshot } from '../packages/contracts/src/index.ts';
import type { CloudCallbacks, CloudConfig } from '../apps/server/src/cloud.ts';

test('changing printer or logging out invalidates late old transport callbacks and resets report counters',async()=>{
  const dashboard=createDashboard({mode:'cloud',initialSnapshot:emptySnapshot('h2c-1','cloud')});
  await new Promise<void>(done=>dashboard.server.listen(0,'127.0.0.1',done));
  const callbacks:CloudCallbacks[]=[],closed:number[]=[];
  const monitor=createCloudMonitor(dashboard,new CoverCache(),{resolve:async()=> 'u_synthetic',start:(_config:CloudConfig,cb:CloudCallbacks)=>{const id=callbacks.length;callbacks.push(cb);return async()=>{closed.push(id);};}});
  const config:CloudConfig={region:'CN',serial:'SYNTH12345',token:'SYNTHETIC_TEST_TOKEN'};
  try{
    await monitor.start(config,{name:'Test A',model:'H2C'});
    callbacks[0].report({print:{mc_percent:10,gcode_state:'RUNNING'}});assert.equal(dashboard.getSnapshot().progressPercent,10);assert.equal(monitor.diagnostics().validReports,1);
    await monitor.start({...config,serial:'SYNTH99999'},{name:'Test B',model:'H2C'});
    assert.equal(dashboard.getSnapshot().progressPercent,null);assert.deepEqual(closed,[0]);
    callbacks[0].report({print:{mc_percent:99}});callbacks[0].connection('error','CLOUD_AUTH_REQUIRED');
    assert.equal(dashboard.getSnapshot().name,'Test B');assert.equal(dashboard.getSnapshot().progressPercent,null);assert.equal(monitor.diagnostics().validReports,0);
    callbacks[1].report({print:{mc_percent:23}});assert.equal(dashboard.getSnapshot().progressPercent,23);
    await monitor.stop();callbacks[1].report({print:{mc_percent:50}});assert.equal(dashboard.getSnapshot().progressPercent,23);assert.equal(monitor.diagnostics().active,false);
  }finally{await monitor.stop();await dashboard.close();}
});
