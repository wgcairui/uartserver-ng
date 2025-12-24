/**
 * Debug script to test terminal API
 */

async function testAPI() {
  // 1. Login
  const loginResponse = await fetch('http://localhost:3333/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        username: 'test_device_user',
        password: 'test-password',
      },
    }),
  });

  const loginData = await loginResponse.json();
  console.log('Login response:', JSON.stringify(loginData, null, 2));

  if (loginData.status !== 'ok' || !loginData.data?.accessToken) {
    console.error('Login failed!');
    return;
  }

  const accessToken = loginData.data.accessToken;
  console.log('\nAccess token:', accessToken.substring(0, 50) + '...');

  // 2. Get terminal details
  console.log('\n=== Testing GET /api/terminals/AABBCCDDEEFF ===');
  const terminalResponse = await fetch('http://localhost:3333/api/terminals/AABBCCDDEEFF', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const terminalData = await terminalResponse.json();
  console.log('Terminal response:', JSON.stringify(terminalData, null, 2));

  // 3. Decode JWT to see userId
  const payload = accessToken.split('.')[1];
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
  console.log('\nJWT Payload:', JSON.stringify(decoded, null, 2));
}

testAPI().catch(console.error);
