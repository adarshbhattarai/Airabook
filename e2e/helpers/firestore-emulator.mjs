const projectId = 'demo-project';
let authTokenPromise;

const assertEmulatorOnly = () => {
  if (process.env.PLAYWRIGHT_USE_EMULATOR !== 'true') {
    throw new Error('Firestore test helpers require PLAYWRIGHT_USE_EMULATOR=true.');
  }

  const configuredHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const hostWithProtocol = configuredHost.includes('://') ? configuredHost : `http://${configuredHost}`;
  const parsedHost = new URL(hostWithProtocol);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsedHost.hostname)) {
    throw new Error(`Refusing Firestore test helper call to non-local host: ${parsedHost.hostname}`);
  }
  return `${parsedHost.protocol}//${parsedHost.host}`;
};

const documentUrl = (baseUrl, path) => {
  const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${baseUrl}/v1/projects/${projectId}/databases/(default)/documents/${encodedPath}`;
};

const getEmulatorAuthToken = async () => {
  if (!authTokenPromise) {
    authTokenPromise = (async () => {
      const email = process.env.PLAYWRIGHT_EMAIL;
      const password = process.env.PLAYWRIGHT_PASSWORD;
      if (!email || !password) {
        throw new Error('Firestore emulator assertions require the seeded PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD.');
      }
      const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      if (!response.ok) {
        throw new Error(`Firebase Auth emulator sign-in failed (${response.status}): ${await response.text()}`);
      }
      const { idToken } = await response.json();
      return idToken;
    })();
  }
  return authTokenPromise;
};

const decodeValue = (value = {}) => {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
};

const decodeFields = (fields = {}) => Object.fromEntries(
  Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
);

export async function getEmulatorDocument(path) {
  const baseUrl = assertEmulatorOnly();
  const idToken = await getEmulatorAuthToken();
  const response = await fetch(documentUrl(baseUrl, path), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore emulator read failed (${response.status}): ${await response.text()}`);
  }
  const document = await response.json();
  return decodeFields(document.fields || {});
}

export async function setEmulatorStringField(path, field, value) {
  const baseUrl = assertEmulatorOnly();
  const idToken = await getEmulatorAuthToken();
  const url = new URL(documentUrl(baseUrl, path));
  url.searchParams.set('updateMask.fieldPaths', field);
  url.searchParams.set('currentDocument.exists', 'true');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields: { [field]: { stringValue: String(value) } } }),
  });
  if (!response.ok) {
    throw new Error(`Firestore emulator update failed (${response.status}): ${await response.text()}`);
  }
}
