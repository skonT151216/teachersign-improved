import { createStandaloneFixture } from '../tests/gas-standalone-fixture.mjs';
const fixture = await createStandaloneFixture({ port: Number(process.env.TEACHERSIGN_PREVIEW_PORT || '5178') });
console.log('GAS 화면의 로컬 미리보기입니다. 실제 Google에 접속하지 않고 가상 자료만 사용하며 재시작하면 초기화됩니다.');
console.log(`가상 학교 A: ${fixture.base}/school/A/exec`);
console.log(`가상 학교 B: ${fixture.base}/school/B/exec`);
console.log(`가상 최초 연결키: ${fixture.setupKey}`);
const stop = async () => { await fixture.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
