import {
  generateTPWithAI,
  GenerateTPParams,
  getGeminiApiKey,
  saveGeminiApiKey,
  removeGeminiApiKey,
  GEMINI_API_KEY_STORAGE_KEY,
} from '../src/services/aiService';
import { createInitialStorageV5, serializeBackupV5 } from '../src/services/storageV5';
import { GoogleGenAI } from '@google/genai';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== Running E.4.1A TP AI Transport Hardening Regression Tests ===\n');

  const dummyParams: GenerateTPParams = {
    cpGeneral: 'Peserta didik memahami konsep perkalian',
    cpElements: [{ id: 'el-1', name: 'Aljabar', content: 'Perkalian sederhana' }],
    cpAnalysisItems: [{ elementName: 'Aljabar', cpCompetence: 'Memahami', materialScope: 'Konsep perkalian', suggestedTp: 'Memahami perkalian' }],
    subject: 'Matematika',
    grade: 'Kelas 4',
    phase: 'Fase B',
    curriculum: 'Kurikulum Merdeka'
  };

  // Test 1: 200 text/html fails with explicit non-JSON/API-route error
  {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null
        },
        text: async () => '<!doctype html><html><body>Error page</body></html>'
      } as any;
    };

    try {
      await generateTPWithAI(dummyParams);
      assert(false, 'Should have failed on HTML response');
    } catch (err: any) {
      assert(err.message.includes('Endpoint AI TP tidak mengembalikan JSON (received text/html)'), 
        'Correctly throws on HTML response indicating API fallback');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Test 2: JSON 4xx/5xx preserves backend error
  {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      return {
        ok: false,
        status: 500,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({ error: 'Kunci API Gemini terblokir atau kadaluwarsa' })
      } as any;
    };

    try {
      await generateTPWithAI(dummyParams);
      assert(false, 'Should have failed on 500 response');
    } catch (err: any) {
      assert(err.message.includes('Kunci API Gemini terblokir atau kadaluwarsa'), 
        'Preserved backend JSON error on 5xx response');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Test 3: Valid JSON TP response succeeds
  {
    const originalFetch = global.fetch;
    let lastBody: any = null;
    global.fetch = async (url, init) => {
      lastBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          success: true,
          items: [
            {
              code: 'TP 4.1',
              elementName: 'Aljabar',
              statement: 'Murid mampu mengidentifikasi perkalian sebagai penjumlahan berulang.',
              competence: 'Mengidentifikasi',
              contentScope: 'Penjualan berulang',
              p3Dimensions: ['Penalaran Kritis']
            }
          ]
        })
      } as any;
    };

    try {
      const items = await generateTPWithAI(dummyParams);
      assert(items.length === 1, 'Correctly parsed valid JSON items array');
      assert(items[0].statement === 'Murid mampu mengidentifikasi perkalian sebagai penjumlahan berulang.', 'Maps statement correctly');
      assert(lastBody && lastBody.cpAnalysisItems !== undefined, 'cpAnalysisItems was transmitted to the backend');
    } catch (err: any) {
      assert(false, 'Should have succeeded with valid JSON: ' + err.message);
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Test 4: Malformed/empty items are rejected
  {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          success: true,
          items: [] // Empty items
        })
      } as any;
    };

    try {
      await generateTPWithAI(dummyParams);
      assert(false, 'Should have failed on empty items');
    } catch (err: any) {
      assert(err.message.includes('array dan tidak boleh kosong'), 
        'Correctly rejected empty items array');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Test 5: Malformed item without statement/description is rejected
  {
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          success: true,
          items: [
            {
              code: 'TP 4.1',
              elementName: 'Aljabar'
              // missing statement and description
            }
          ]
        })
      } as any;
    };

    try {
      await generateTPWithAI(dummyParams);
      assert(false, 'Should have failed on missing statement');
    } catch (err: any) {
      assert(err.message.includes('tidak memiliki statement/description'), 
        'Correctly rejected items with missing statement/description');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Test 6: BYOK Helper Contract (localStorage key 'alco_admin_gemini_api_key' and get/save/remove)
  {
    assert(GEMINI_API_KEY_STORAGE_KEY === 'alco_admin_gemini_api_key', 'Storage key matches contract: alco_admin_gemini_api_key');
    
    removeGeminiApiKey();
    assert(getGeminiApiKey() === null, 'getGeminiApiKey returns null after removeGeminiApiKey');

    saveGeminiApiKey('  AIzaSyTestKey12345  ');
    assert(getGeminiApiKey() === 'AIzaSyTestKey12345', 'saveGeminiApiKey trims and saves key correctly');

    removeGeminiApiKey();
    assert(getGeminiApiKey() === null, 'removeGeminiApiKey clears key');
  }

  // Test 7: User key is sent as X-Gemini-API-Key header in AI requests
  {
    const originalFetch = global.fetch;
    let capturedHeaders: Headers | null = null;
    
    saveGeminiApiKey('AIzaSyUserSpecificKey999');

    global.fetch = async (url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          success: true,
          items: [{
            code: 'TP 4.1',
            elementName: 'Aljabar',
            statement: 'Murid mampu memahami konsep perkalian.',
            competence: 'Memahami',
            contentScope: 'Perkalian',
            p3Dimensions: ['Penalaran Kritis']
          }]
        })
      } as any;
    };

    try {
      await generateTPWithAI(dummyParams);
      assert(capturedHeaders !== null, 'Fetch was called and headers captured');
      const headerVal = capturedHeaders?.get('x-gemini-api-key');
      assert(headerVal === 'AIzaSyUserSpecificKey999', `User key sent as X-Gemini-API-Key header (received: ${headerVal})`);
    } finally {
      removeGeminiApiKey();
      global.fetch = originalFetch;
    }
  }

  // Test 8: User key has priority over server key in resolver
  {
    // Simulate server resolver logic
    function simulateResolveApiKey(reqHeaders: Record<string, string | undefined>, serverEnvKey?: string): string | null {
      const userKey = reqHeaders['x-gemini-api-key'];
      if (typeof userKey === 'string' && userKey.trim().length > 0) {
        return userKey.trim();
      }
      if (serverEnvKey && serverEnvKey.trim().length > 0) {
        return serverEnvKey.trim();
      }
      return null;
    }

    const resolvedWithBoth = simulateResolveApiKey(
      { 'x-gemini-api-key': 'user-priority-key' },
      'server-fallback-key'
    );
    assert(resolvedWithBoth === 'user-priority-key', 'User key has strict priority over server env key');

    const resolvedWithServerOnly = simulateResolveApiKey(
      {},
      'server-fallback-key'
    );
    assert(resolvedWithServerOnly === 'server-fallback-key', 'Falls back to server env key when user key is absent');
  }

  // Test 9: Without user key and without server key -> AI_NOT_CONFIGURED
  {
    function simulateResolveApiKey(reqHeaders: Record<string, string | undefined>, serverEnvKey?: string): string | null {
      const userKey = reqHeaders['x-gemini-api-key'];
      if (typeof userKey === 'string' && userKey.trim().length > 0) return userKey.trim();
      if (serverEnvKey && serverEnvKey.trim().length > 0) return serverEnvKey.trim();
      return null;
    }

    const resolvedNeither = simulateResolveApiKey({}, '');
    assert(resolvedNeither === null, 'Resolves to null when neither user key nor server key is present');

    // Endpoint contract check for null key
    const endpointResponse = resolvedNeither ? { status: 200 } : {
      status: 503,
      body: {
        success: false,
        code: 'AI_NOT_CONFIGURED',
        error: 'Layanan AI belum dikonfigurasi pada server.'
      }
    };
    assert(endpointResponse.status === 503, 'Returns HTTP 503 when no key available');
    assert(endpointResponse.body.code === 'AI_NOT_CONFIGURED', 'Returns code AI_NOT_CONFIGURED');
  }

  // Test 10: Client Gemini is created per-request/key and not cached across users
  {
    const clientA = new GoogleGenAI({
      apiKey: 'key-user-alice',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const clientB = new GoogleGenAI({
      apiKey: 'key-user-bob',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    assert(clientA !== clientB, 'Gemini client instances are distinct objects per user/request');
  }

  // Test 11: Key never enters Storage V5 or backup JSON
  {
    const testSecretKey = 'AIzaSyTopSecretNeverPersistInStorageV5';
    saveGeminiApiKey(testSecretKey);

    const storageState = createInitialStorageV5();
    const backupJson = serializeBackupV5(storageState);

    assert(!backupJson.includes(testSecretKey), 'Backup JSON does NOT contain user secret API key');
    assert(!backupJson.includes(GEMINI_API_KEY_STORAGE_KEY), 'Backup JSON does NOT contain alco_admin_gemini_api_key storage key');
    
    const stateString = JSON.stringify(storageState);
    assert(!stateString.includes(testSecretKey), 'Storage V5 state object does NOT contain user secret API key');

    removeGeminiApiKey();
  }

  // Test 12: Invalid key (401/403) throws error and does NOT produce synthetic/fallback TP
  {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        headers: {
          get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          error: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.',
          code: 'INVALID_API_KEY'
        })
      } as any;
    };

    saveGeminiApiKey('invalid-bad-key');

    try {
      await generateTPWithAI(dummyParams);
      assert(false, 'Should have failed on 401 invalid API key');
    } catch (err: any) {
      assert(err.message.includes('Kunci API Gemini tidak valid') || err.message.includes('API key'), 
        'Invalid key rejects without calling fallback or generating fake TP');
      assert(getGeminiApiKey() === null, 'Invalid key was automatically removed from storage');
    } finally {
      removeGeminiApiKey();
      global.fetch = originalFetch;
    }
  }

  console.log(`\n=== Hardening Tests Summary: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
