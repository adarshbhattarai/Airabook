import enterpriseConfig from './playwright.enterprise.config.mjs';

export default {
  ...enterpriseConfig,
  testMatch: ['workspace-selection.spec.mjs', 'enterprise-team.spec.mjs'],
};
