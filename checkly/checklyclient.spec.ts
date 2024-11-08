import { ChecklyClient } from './checklyclient';
import 'dotenv/config';
const checkid = 'b68422ae-6528-45a5-85a6-e85e1be9de2e';
const checkresultid = '6bf436aa-3bd7-4ca1-bdb1-fff100139135';

const bcheckid = '380d7119-544a-4b72-804c-b305034483d1';
const bcheckresult = '2d9c3e91-e766-4593-9f73-92d18cf6b594';
jest.setTimeout(30000);
describe('ChecklyService', () => {
  const client: ChecklyClient = new ChecklyClient();

  beforeEach(async () => {});

  it('get failed results', async () => {
    const result = await client.getFailedAPIResults(checkid);

    console.log(JSON.stringify(result));
    expect(result).toBeDefined();
  });

  it('should be defined', async () => {
    const result = await client.getCheck(checkid);
    expect(result).toBeDefined();
  });

  it('should be defined', async () => {
    const result = await client.getCheckResult(bcheckid, bcheckresult);
    expect(result).toBeDefined();
    const log = result.getLog();
    expect(log).toBeDefined();
    await client.downloadAsset(
      result.browserCheckResult?.playwrightTestTraces[0] || '',
      'test.zip',
    );
  });
});
