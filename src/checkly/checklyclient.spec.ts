import { ChecklyClient } from './checklyclient';
import 'dotenv/config';


jest.setTimeout(30000);
describe('ChecklyService', () => {
  const client: ChecklyClient = new ChecklyClient();

  beforeEach(async () => {});

it('can download all checks', async () => {
    const result = await client.getChecks();
    expect(result).toBeDefined();
    const activated = result.filter((r) => r.activated);
    expect(activated).toBeDefined();
  }
 );
 it('can find activated checks', async () => {
    const result = await client.getActivatedChecks();
    expect(result).toBeDefined();
  }
 );

  it('get failed results', async () => {
    const s = await client.getActivatedChecks();
    const result = await client.getCheckResults(s[1].id,true, 100);

    //console.log(JSON.stringify(result));
    expect(result).toBeDefined();
  });

  it('should be defined', async () => {
    const checks = await client.getChecks();
    const result = await client.getCheck(checks[0].id);
    
    expect(result).toBeDefined();
  });

  it('can download prometheus metrics', async () => {
    const result = await client.getPrometheusCheckStatus();
    expect(result).toBeDefined();
  });

/*  it('should be defined', async () => {
    const result = await client.getCheckResult(bcheckid, bcheckresult);
    expect(result).toBeDefined();
    const log = result.getLog();
    expect(log).toBeDefined();
    await client.downloadAsset(
      result.browserCheckResult?.playwrightTestTraces[0] || '',
      'test.zip',
    );
  });
*/

});


