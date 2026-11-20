import React from 'react';
import MarketingLayout from '@/layouts/MarketingLayout';
import Signup from '@/pages/Signup';

const PersonalSignup = () => (
  <MarketingLayout>
    <Signup loginPath="/v2/personal-login" />
  </MarketingLayout>
);

export default PersonalSignup;
