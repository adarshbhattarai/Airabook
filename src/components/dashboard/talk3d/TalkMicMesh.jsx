import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const TalkMicMesh = ({
  status,
  onToggle,
  isListening,
  isSpeaking,
  prefersReducedMotion,
  colors,
}) => {
  const groupRef = useRef(null);
  const coreMaterialRef = useRef(null);
  const ringMaterialRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const glowColor = useMemo(() => new THREE.Color(colors.micGlow), [colors.micGlow]);
  const baseColor = useMemo(() => new THREE.Color(colors.micBase), [colors.micBase]);

  useFrame((state) => {
    if (!groupRef.current || !coreMaterialRef.current || !ringMaterialRef.current) return;

    const t = state.clock.elapsedTime;
    const active = status !== 'idle';
    const pulse = prefersReducedMotion ? 0 : Math.sin(t * (isSpeaking ? 8 : 4)) * 0.06;
    const scale = active ? 1.02 + pulse : 1;

    groupRef.current.scale.setScalar(scale + (hovered ? 0.03 : 0));
    groupRef.current.position.z = 0.86 + (active ? 0.03 : 0);

    coreMaterialRef.current.emissive.copy(glowColor);
    coreMaterialRef.current.color.copy(baseColor);
    coreMaterialRef.current.emissiveIntensity = active ? (isSpeaking ? 0.85 : 0.42) : 0.12;

    ringMaterialRef.current.emissive.copy(glowColor);
    ringMaterialRef.current.emissiveIntensity = active ? (isSpeaking ? 0.95 : 0.45) : 0.18;
  });

  return (
    <group
      ref={groupRef}
      position={[0, -1.42, 0.86]}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
      }}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.37, 0.37, 0.2, 48]} />
        <meshStandardMaterial
          ref={coreMaterialRef}
          color={colors.micBase}
          roughness={0.28}
          metalness={0.48}
        />
      </mesh>

      <mesh position={[0, 0, 0.11]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.18, 32]} />
        <meshStandardMaterial color={colors.micGlyph} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh position={[0, -0.12, 0.11]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.12, 16]} />
        <meshStandardMaterial color={colors.micGlyph} roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0, -0.18, 0.11]} castShadow>
        <torusGeometry args={[0.07, 0.014, 10, 30, Math.PI]} />
        <meshStandardMaterial color={colors.micGlyph} roughness={0.4} metalness={0.3} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.045]} castShadow>
        <torusGeometry args={[0.455, 0.035, 18, 56]} />
        <meshStandardMaterial
          ref={ringMaterialRef}
          color={colors.micRing}
          emissive={colors.micGlow}
          emissiveIntensity={0.2}
          roughness={0.22}
          metalness={0.58}
        />
      </mesh>
    </group>
  );
};

export default TalkMicMesh;
