import React, { useEffect } from 'react';

const MyComponent = ({ someProp, ...typographyProps }) => {
  useEffect(() => {
    console.log('typographyProps changed!');
  }, [typographyProps]); // This should be flagged by our rule

  return <div {...typographyProps}>Hello</div>;
};

export default MyComponent;
