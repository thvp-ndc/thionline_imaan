import assert from 'node:assert';
import { fetchWithBackoff } from './client/src/utils/indexedDBStorage.js';

console.log('================================================================');
console.log('  KIỂM THỬ KHẢ NĂNG PHỤC HỒI & EXPONENTIAL BACKOFF NGÀY 7       ');
console.log('================================================================');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function it(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`[PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(`       Lỗi: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. Kiểm thử fetchWithBackoff thành công ngay lần đầu
  await it('RES-01: Cuộc gọi thành công ngay lần 1 không phải retry', async () => {
    let callCount = 0;
    const result = await fetchWithBackoff(async () => {
      callCount++;
      return { success: true, data: 123 };
    }, 3, 50);

    assert.strictEqual(callCount, 1);
    assert.strictEqual(result.data, 123);
  });

  // 2. Kiểm thử retry khi gặp lỗi tạm thời (Transient Network Error)
  await it('RES-02: Tự động retry khi rớt mạng tạm thời và thành công ở lần 3', async () => {
    let callCount = 0;
    const result = await fetchWithBackoff(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Mạng 4G chập chờn');
      }
      return { success: true, status: 'recovered' };
    }, 4, 20);

    assert.strictEqual(callCount, 3);
    assert.strictEqual(result.status, 'recovered');
  });

  // 3. Kiểm thử vượt quá số lần retry tối đa (Max retries exceeded)
  await it('RES-03: Báo lỗi an toàn khi vượt quá số lần retry tối đa', async () => {
    let callCount = 0;
    let threw = false;

    try {
      await fetchWithBackoff(async () => {
        callCount++;
        throw new Error('Mất mạng hoàn toàn');
      }, 3, 20);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.message, 'Mất mạng hoàn toàn');
    }

    assert.strictEqual(callCount, 3);
    assert.strictEqual(threw, true);
  });

  console.log('================================================================');
  console.log(`  TỔNG KẾT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests();
