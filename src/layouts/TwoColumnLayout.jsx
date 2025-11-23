import React from 'react';

const TwoColumnLayout = ({ left, right }) => {
  return (
    <div className="max-w-6xl mx-auto py-10 px-6 grid gap-10 lg:grid-cols-[2fr,1.5fr]">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
};

export default TwoColumnLayout;


