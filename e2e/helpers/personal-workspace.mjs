/**
 * Supply Spring workspace access for Firebase emulator smoke tests.
 * Firebase authentication and book/page operations still use the real emulators.
 */
export async function mockPersonalWorkspaceAccess(page) {
  await page.route(/\/api\/v1\/me(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'smoke-user', status: 'ACTIVE', systemRole: 'USER' },
      accounts: [{
        id: 'smoke-personal',
        type: 'PERSONAL',
        name: 'Personal Workspace',
        accountStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        role: 'PERSONAL_OWNER',
      }],
    }),
  }));

  // The dashboard's onboarding notice also reads Spring, independently of login.
  await page.route(/\/api\/v1\/enterpriseOnboardingRequest\/mine(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [],
      page: { number: 0, size: 20, totalItems: 0, totalPages: 0 },
    }),
  }));
}
