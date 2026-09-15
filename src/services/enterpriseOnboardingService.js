const DEMO_ENTERPRISE_SIGNIN_URL = import.meta.env.VITE_ENTERPRISE_DEMO_SIGNIN_URL || 'http://localhost:8000/signin';
const DEMO_ENTERPRISE_LOGIN_URL = import.meta.env.VITE_ENTERPRISE_DEMO_LOGIN_URL || 'http://localhost:8000/login';

/**
 * Demo-only enterprise onboarding request.
 * The request is submitted by an already authenticated Personal Account.
 */
export const submitEnterpriseOnboardingDemo = async ({ onboarding }) => {
  const onboardingPayload = Object.fromEntries(
    Object.entries(onboarding).filter(([key]) => !['password', 'confirm_password'].includes(key))
  );

  const response = await fetch(DEMO_ENTERPRISE_SIGNIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(onboardingPayload),
  });

  if (response.status !== 201) {
    throw new Error(`Enterprise demo endpoint returned ${response.status}`);
  }

  return response;
};

/**
 * Demo-only enterprise login request.
 * Replace this with Firebase/session validation when the real backend is ready.
 */
export const submitEnterpriseLoginDemo = async ({ workspaceSlug, email, password }) => {
  const response = await fetch(DEMO_ENTERPRISE_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      flow: 'enterprise_login',
      workspace_slug: workspaceSlug,
      contact_email: email,
      password,
    }),
  });

  if (response.status !== 201) {
    throw new Error(`Enterprise login demo endpoint returned ${response.status}`);
  }

  return response;
};
