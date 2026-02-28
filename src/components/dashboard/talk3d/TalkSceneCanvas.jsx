import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import ProceduralAssistantAvatar from '@/components/dashboard/talk3d/ProceduralAssistantAvatar';
import TalkMicMesh from '@/components/dashboard/talk3d/TalkMicMesh';

const TalkScene = ({
  status,
  isListening,
  isSpeaking,
  onToggle,
  prefersReducedMotion,
  colors,
}) => {
  const sceneGroupRef = useRef(null);
  const fog = useMemo(() => new THREE.Fog(colors.sceneFog, 5, 13), [colors.sceneFog]);
  const hemiGround = useMemo(() => new THREE.Color(colors.hemiGround), [colors.hemiGround]);

  useFrame((state, delta) => {
    if (!sceneGroupRef.current || prefersReducedMotion) return;
    const t = state.clock.elapsedTime;
    const pointerX = state.pointer.x || 0;
    const pointerY = state.pointer.y || 0;
    const baseYaw = Math.sin(t * 0.32) * 0.06;
    const pointerYaw = pointerX * 0.22;
    const pointerPitch = -pointerY * 0.08;

    sceneGroupRef.current.rotation.y = THREE.MathUtils.lerp(
      sceneGroupRef.current.rotation.y,
      baseYaw + pointerYaw,
      Math.min(1, delta * 3.5),
    );
    sceneGroupRef.current.rotation.x = THREE.MathUtils.lerp(
      sceneGroupRef.current.rotation.x,
      pointerPitch,
      Math.min(1, delta * 3.5),
    );

    const targetCameraX = pointerX * 0.45;
    const targetCameraY = 0.08 + pointerY * 0.22;
    state.camera.position.x = THREE.MathUtils.lerp(
      state.camera.position.x,
      targetCameraX,
      Math.min(1, delta * 2.8),
    );
    state.camera.position.y = THREE.MathUtils.lerp(
      state.camera.position.y,
      targetCameraY,
      Math.min(1, delta * 2.8),
    );
    state.camera.lookAt(0, 0.15, 0);
  });

  return (
    <>
      <color attach="background" args={[colors.sceneBg]} />
      <primitive attach="fog" object={fog} />

      <hemisphereLight
        intensity={0.72}
        color={colors.hemiSky}
        groundColor={hemiGround}
      />
      <directionalLight
        position={[2.4, 2.9, 3.2]}
        intensity={1.05}
        color={colors.keyLight}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight
        position={[-2.7, 1.9, -2.6]}
        intensity={0.55}
        color={colors.rimLight}
      />
      <ambientLight intensity={0.22} color={colors.ambientLight} />

      <mesh position={[0, -2.2, -0.5]} receiveShadow>
        <planeGeometry args={[11, 11]} />
        <meshStandardMaterial color={colors.floor} roughness={0.95} metalness={0.02} />
      </mesh>

      <group ref={sceneGroupRef} position={[0, -0.02, 0]}>
        <ProceduralAssistantAvatar
          isListening={isListening}
          isSpeaking={isSpeaking}
          prefersReducedMotion={prefersReducedMotion}
          colors={colors}
        />
        <TalkMicMesh
          status={status}
          isListening={isListening}
          isSpeaking={isSpeaking}
          prefersReducedMotion={prefersReducedMotion}
          onToggle={onToggle}
          colors={colors}
        />
      </group>

      <ContactShadows
        position={[0, -2.08, 0]}
        opacity={0.45}
        scale={7}
        blur={2}
        far={4.5}
        color={colors.shadow}
      />
    </>
  );
};

const TalkSceneCanvas = ({
  status,
  isListening,
  isSpeaking,
  onToggle,
  prefersReducedMotion,
  colors,
}) => {
  return (
    <Canvas
      shadows
      dpr={[1, 1.7]}
      camera={{ position: [0, 0.08, 4.2], fov: 37 }}
      gl={{ antialias: true, alpha: false }}
    >
      <TalkScene
        status={status}
        isListening={isListening}
        isSpeaking={isSpeaking}
        onToggle={onToggle}
        prefersReducedMotion={prefersReducedMotion}
        colors={colors}
      />
    </Canvas>
  );
};

export default TalkSceneCanvas;
