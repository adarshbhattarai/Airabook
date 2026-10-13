import React from 'react';
import MarketingLayout from '@/layouts/MarketingLayout';
import Login from '@/pages/Login';

const PersonalLogin = () => (
  <MarketingLayout>
    <Login signupPath="/v2/personal-signup" />
  </MarketingLayout>
);

export default PersonalLogin;
