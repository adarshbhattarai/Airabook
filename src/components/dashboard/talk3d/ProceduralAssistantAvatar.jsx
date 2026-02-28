import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ProceduralAssistantAvatar = ({
  isListening,
  isSpeaking,
  prefersReducedMotion,
  colors,
}) => {
  const groupRef = useRef(null);
  const hairBandRef = useRef(null);

  const hairBandColor = useMemo(
    () => new THREE.Color(colors.hairBand || '#68f1b7'),
    [colors.hairBand],
  );

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (prefersReducedMotion) return;

    const t = state.clock.elapsedTime;
    const baseBob = isSpeaking ? 0.055 : isListening ? 0.038 : 0.02;
    const sway = isSpeaking ? 0.12 : 0.07;
    groupRef.current.position.y = Math.sin(t * 1.6) * baseBob;
    groupRef.current.rotation.y = Math.sin(t * 0.8) * sway;
    groupRef.current.rotation.x = Math.sin(t * 0.6) * 0.02;

    if (hairBandRef.current) {
      hairBandRef.current.rotation.z += delta * (isSpeaking ? 0.5 : 0.2);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.35, 0]}>
      <mesh position={[0, -1.12, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.55, 1.05, 8, 16]} />
        <meshStandardMaterial color={colors.jacket} roughness={0.58} metalness={0.05} />
      </mesh>

      <mesh position={[0, -0.95, 0.43]} castShadow>
        <capsuleGeometry args={[0.38, 0.75, 8, 12]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.65} metalness={0.02} />
      </mesh>

      <mesh position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.66, 28, 28]} />
        <meshStandardMaterial color={colors.skin} roughness={0.62} metalness={0.02} />
      </mesh>

      <mesh position={[0, 0.2, -0.22]} castShadow>
        <sphereGeometry args={[0.61, 30, 30]} />
        <meshStandardMaterial color={colors.hair} roughness={0.7} metalness={0.04} />
      </mesh>

      <mesh position={[0.43, 0.18, -0.13]} castShadow>
        <capsuleGeometry args={[0.18, 0.9, 6, 14]} />
        <meshStandardMaterial color={colors.hair} roughness={0.72} metalness={0.03} />
      </mesh>

      <mesh ref={hairBandRef} position={[0.3, 0.56, -0.11]} castShadow>
        <torusGeometry args={[0.14, 0.04, 14, 40]} />
        <meshStandardMaterial
          color={hairBandColor}
          emissive={hairBandColor}
          emissiveIntensity={isListening || isSpeaking ? 0.35 : 0.15}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      <mesh position={[-0.21, 0.09, 0.57]} castShadow>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color={colors.eye} roughness={0.35} metalness={0.06} />
      </mesh>
      <mesh position={[0.21, 0.09, 0.57]} castShadow>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color={colors.eye} roughness={0.35} metalness={0.06} />
      </mesh>

      <mesh position={[0, -0.14, 0.58]} castShadow rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.035, 8, 30, Math.PI]} />
        <meshStandardMaterial color={colors.smile} roughness={0.5} metalness={0.05} />
      </mesh>
    </group>
  );
};

export default ProceduralAssistantAvatar;
