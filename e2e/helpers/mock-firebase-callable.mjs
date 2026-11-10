export async function mockFirebaseCallable(page, callableName, handleCall) {
  await page.route(`**/${callableName}`, async (route) => {
    const request = route.request();
    const origin = request.headers().origin || '*';
    const requestedHeaders = request.headers()['access-control-request-headers'];

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': requestedHeaders || 'authorization, content-type, x-firebase-appcheck',
          'Access-Control-Max-Age': '3600',
        },
      });
      return;
    }

    const responseBody = await handleCall(route);
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responseBody),
    });
  });
}
