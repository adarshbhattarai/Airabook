import { useEffect, useState } from 'react';

const useWebGLSupport = () => {
  const [state, setState] = useState({ checked: false, supported: false });

  useEffect(() => {
    if (typeof window === 'undefined') {
      setState({ checked: true, supported: false });
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const hasWebGL2 = !!canvas.getContext('webgl2');
      const hasWebGL1 = !!canvas.getContext('webgl') || !!canvas.getContext('experimental-webgl');
      setState({ checked: true, supported: hasWebGL2 || hasWebGL1 });
    } catch (error) {
      console.warn('[talk3d] WebGL support check failed:', error);
      setState({ checked: true, supported: false });
    }
  }, []);

  return state;
};

export default useWebGLSupport;
