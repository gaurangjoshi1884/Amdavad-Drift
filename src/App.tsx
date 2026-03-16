/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Timer, MapPin, Trophy, RotateCcw, Play, ChevronLeft, ChevronRight, Zap, Car } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Constants
const ROAD_WIDTH = 12;
const ROAD_LENGTH = 5000;
const INITIAL_TIME = 45;
const CHECKPOINT_BONUS = 20;
const FOG_COLOR = 0xFF8C00; // Deep Sunset Orange

const CHECKPOINTS = [
  { distance: 1500, label: 'Sardar Bridge' },
  { distance: 3500, label: 'Riverfront House' },
  { distance: 5000, label: 'Usmanpura Cross Roads' }
];

// Building Colors (Dusty browns and creams)
const BUILDING_COLORS = [0xD2B48C, 0xF5F5DC, 0xDEB887, 0xBC8F8F, 0xEEDC82];

const MUSIC_TRACKS = [
  'race-music1.mp3',
  'race-music2.mp3',
  'race-music3.mp3'
];

type CarType = '800' | 'NANO' | 'CITY';

interface CarStats {
  name: string;
  color: number;
  speed: number;
  handling: number;
  description: string;
}

const CAR_CONFIGS: Record<CarType, CarStats> = {
  '800': {
    name: 'The 800',
    color: 0xffffff,
    speed: 60,
    handling: 0.12,
    description: 'Balanced speed and handling. A classic.'
  },
  'NANO': {
    name: 'The Nano',
    color: 0xffff00,
    speed: 45,
    handling: 0.18,
    description: 'Slow but agile. Perfect for tight spots.'
  },
  'CITY': {
    name: 'The City',
    color: 0xc0c0c0,
    speed: 80,
    handling: 0.08,
    description: 'High speed, but harder to steer.'
  }
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'START' | 'SELECT' | 'PLAYING' | 'GAMEOVER' | 'WIN'>('START');
  const [selectedCar, setSelectedCar] = useState<CarType>('800');
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [distance, setDistance] = useState(ROAD_LENGTH);
  const [checkpoint, setCheckpoint] = useState(0);
  const [currentTrack, setCurrentTrack] = useState(MUSIC_TRACKS[0]);

  // Audio State
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pingRef = useRef<HTMLAudioElement | null>(null);

  // Control States
  const [isGassing, setIsGassing] = useState(false);
  const [isSteeringLeft, setIsSteeringLeft] = useState(false);
  const [isSteeringRight, setIsSteeringRight] = useState(false);

  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carRef = useRef<THREE.Group | null>(null);
  const wheelsRef = useRef<THREE.Mesh[]>([]);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const requestRef = useRef<number | null>(null);

  // Handle Audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      audioRef.current?.play().catch(() => {
        console.log("Autoplay blocked, waiting for interaction");
      });
    } else {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  }, [gameState]);

  const createCarModel = (type: CarType, scene: THREE.Scene) => {
    // Remove old car if exists
    if (carRef.current) {
      scene.remove(carRef.current);
      wheelsRef.current = [];
    }

    const carGroup = new THREE.Group();
    const config = CAR_CONFIGS[type];

    let bodyGeo, cabinGeo, bodyPos, cabinPos;

    if (type === '800') {
      bodyGeo = new THREE.BoxGeometry(1.4, 0.7, 2.8);
      cabinGeo = new THREE.BoxGeometry(1.2, 0.6, 1.6);
      bodyPos = 0.5;
      cabinPos = { x: 0, y: 1.1, z: 0.2 };
    } else if (type === 'NANO') {
      bodyGeo = new THREE.BoxGeometry(1.3, 1.0, 2.2);
      cabinGeo = new THREE.BoxGeometry(1.1, 0.8, 1.4);
      bodyPos = 0.6;
      cabinPos = { x: 0, y: 1.4, z: 0 };
    } else {
      bodyGeo = new THREE.BoxGeometry(1.5, 0.5, 3.5);
      cabinGeo = new THREE.BoxGeometry(1.2, 0.4, 1.8);
      bodyPos = 0.4;
      cabinPos = { x: 0, y: 0.8, z: -0.2 };
    }

    const bodyMat = new THREE.MeshStandardMaterial({ color: config.color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyPos;
    body.castShadow = true;
    carGroup.add(body);

    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(cabinPos.x, cabinPos.y, cabinPos.z);
    carGroup.add(cabin);

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa });
    const lightL = new THREE.Mesh(lightGeo, lightMat);
    const lightR = new THREE.Mesh(lightGeo, lightMat);
    const lightZ = type === 'CITY' ? -1.75 : (type === '800' ? -1.4 : -1.1);
    lightL.position.set(-0.5, bodyPos + 0.1, lightZ);
    lightR.position.set(0.5, bodyPos + 0.1, lightZ);
    carGroup.add(lightL, lightR);

    // Taillights
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 });
    const tailL = new THREE.Mesh(lightGeo, tailMat);
    const tailR = new THREE.Mesh(lightGeo, tailMat);
    const tailZ = type === 'CITY' ? 1.75 : (type === '800' ? 1.4 : 1.1);
    tailL.position.set(-0.5, bodyPos + 0.1, tailZ);
    tailR.position.set(0.5, bodyPos + 0.1, tailZ);
    carGroup.add(tailL, tailR);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wheelZ = type === 'CITY' ? 1.2 : (type === '800' ? 1.0 : 0.8);
    const wheelPositions = [
      [-0.7, 0.35, wheelZ], [0.7, 0.35, wheelZ],
      [-0.7, 0.35, -wheelZ], [0.7, 0.35, -wheelZ]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      carGroup.add(wheel);
      wheelsRef.current.push(wheel);
    });

    scene.add(carGroup);
    carRef.current = carGroup;
    return carGroup;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffccaa, 1.2);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // --- Road Texture ---
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
      }
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(10, 0, 15, 512);
      ctx.fillRect(487, 0, 15, 512);
      ctx.setLineDash([40, 40]);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.stroke();
    }
    const roadTexture = new THREE.CanvasTexture(canvas);
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(1, ROAD_LENGTH / 10);

    const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
    const roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -ROAD_LENGTH / 2;
    road.receiveShadow = true;
    scene.add(road);

    // --- Environment ---
    const createBuilding = (x: number, z: number) => {
      const h = 8 + Math.random() * 30;
      const w = 6 + Math.random() * 8;
      const geo = new THREE.BoxGeometry(w, h, w);
      const mat = new THREE.MeshStandardMaterial({ 
        color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)] 
      });
      const b = new THREE.Mesh(geo, mat);
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
    };

    const createLaari = (x: number, z: number) => {
      const laari = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(2, 1, 1.5);
      const bodyMat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.8;
      body.castShadow = true;
      laari.add(body);
      const roofGeo = new THREE.PlaneGeometry(2.2, 1.7);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = 1.8;
      roof.rotation.x = Math.PI / 2;
      laari.add(roof);
      laari.position.set(x, 0, z);
      scene.add(laari);
    };

    for (let i = 0; i < ROAD_LENGTH; i += 45) {
      createBuilding(-15 - Math.random() * 10, -i);
      createBuilding(15 + Math.random() * 10, -i);
      if (Math.random() > 0.4) createLaari(-8, -i - 15);
      if (Math.random() > 0.4) createLaari(8, -i - 30);
    }

    // --- Checkpoints ---
    CHECKPOINTS.forEach((cp, index) => {
      if (index === CHECKPOINTS.length - 1) return; // Skip last one for finish line

      // Floating Yellow Ring
      const ringGeo = new THREE.TorusGeometry(5, 0.2, 16, 100);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFD700 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 5, -cp.distance);
      scene.add(ring);

      // Label
      const labelGeo = new THREE.BoxGeometry(4, 1, 0.5);
      const labelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(0, 11, -cp.distance);
      scene.add(label);
    });

    // --- Finish Line ---
    const bannerGroup = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 15);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const poleL = new THREE.Mesh(poleGeo, poleMat);
    poleL.position.set(-ROAD_WIDTH/2, 7.5, 0);
    const poleR = new THREE.Mesh(poleGeo, poleMat);
    poleR.position.set(ROAD_WIDTH/2, 7.5, 0);
    bannerGroup.add(poleL, poleR);
    const canvasBanner = document.createElement('canvas');
    canvasBanner.width = 512;
    canvasBanner.height = 128;
    const ctxB = canvasBanner.getContext('2d');
    if (ctxB) {
      ctxB.fillStyle = '#ffffff';
      ctxB.fillRect(0, 0, 512, 128);
      ctxB.fillStyle = '#000000';
      ctxB.font = 'bold 40px Arial';
      ctxB.textAlign = 'center';
      ctxB.fillText(CHECKPOINTS[CHECKPOINTS.length - 1].label.toUpperCase(), 256, 85);
    }
    const bannerTex = new THREE.CanvasTexture(canvasBanner);
    const bannerGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 3);
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 12, 0);
    bannerGroup.add(banner);
    bannerGroup.position.z = -ROAD_LENGTH;
    scene.add(bannerGroup);

    // Initial Car
    createCarModel('800', scene);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      renderer.dispose();
    };
  }, []);

  // Update car model when selection changes
  useEffect(() => {
    if (sceneRef.current) {
      createCarModel(selectedCar, sceneRef.current);
    }
  }, [selectedCar]);

  // Game Loop
  useEffect(() => {
    const animate = () => {
      if (gameState === 'PLAYING') {
        const delta = clockRef.current.getDelta();
        const car = carRef.current;
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const config = CAR_CONFIGS[selectedCar];

        if (car && camera && renderer && scene) {
          if (isGassing) {
            car.position.z -= config.speed * delta;
            // Spin wheels
            wheelsRef.current.forEach(wheel => {
              wheel.rotation.x -= config.speed * delta * 0.5;
            });
            // Adrenaline effect: increase music pitch/speed
            if (audioRef.current) {
              audioRef.current.playbackRate = 1 + (config.speed / 100);
            }
          } else {
            if (audioRef.current) {
              audioRef.current.playbackRate = 1.0;
            }
          }

          let steerDir = 0;
          if (isSteeringLeft) steerDir = 1;
          if (isSteeringRight) steerDir = -1;
          
          const targetX = steerDir * (ROAD_WIDTH / 2 - 1.5);
          if (steerDir !== 0) {
            car.position.x += (targetX - car.position.x) * config.handling;
            car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, steerDir * 0.2, 0.1);
          } else {
            car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, 0, 0.1);
          }

          // Third-Person Chase Cam
          const targetCamPos = new THREE.Vector3(
            car.position.x,
            car.position.y + 1.5,
            car.position.z + 3
          );
          camera.position.lerp(targetCamPos, 0.2);
          camera.lookAt(car.position);

          const currentZ = -car.position.z;
          setDistance(Math.max(0, Math.floor(ROAD_LENGTH - currentZ)));

          const currentCheckpoint = CHECKPOINTS[checkpoint];
          if (currentZ >= currentCheckpoint.distance) {
            if (checkpoint < CHECKPOINTS.length - 1) {
              setCheckpoint(prev => prev + 1);
              setTimeLeft(prev => prev + CHECKPOINT_BONUS);
              if (pingRef.current) {
                pingRef.current.currentTime = 0;
                pingRef.current.play().catch(() => {});
              }
            } else {
              setGameState('WIN');
              setIsGassing(false);
              setIsSteeringLeft(false);
              setIsSteeringRight(false);
            }
          }

          setTimeLeft(prev => {
            const next = prev - delta;
            if (next <= 0) {
              setGameState('GAMEOVER');
              return 0;
            }
            return next;
          });

          renderer.render(scene, camera);
        }
      } else if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, checkpoint, isGassing, isSteeringLeft, isSteeringRight, selectedCar]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === 'SELECT') setGameState('START');
        if (gameState === 'PLAYING') setGameState('SELECT');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const startGame = () => {
    if (carRef.current) {
      carRef.current.position.set(0, 0, 0);
      carRef.current.rotation.y = 0;
    }
    
    // Pick a random track
    const randomTrack = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    setCurrentTrack(randomTrack);
    
    // Reset audio element if it exists
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = randomTrack;
      audioRef.current.load();
    }

    setCheckpoint(0);
    setTimeLeft(INITIAL_TIME);
    setDistance(ROAD_LENGTH);
    setGameState('PLAYING');
    clockRef.current.start();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-orange-900 font-sans text-white select-none">
      {/* Audio Tag */}
      <audio 
        ref={audioRef}
        id="bgMusic" 
        loop 
        src={currentTrack} 
      />
      <audio 
        ref={pingRef}
        id="pingSound" 
        src="https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3" 
      />

      {/* 3D Canvas Container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6">
        
        {/* HUD */}
        {gameState === 'PLAYING' && (
          <div className="w-full flex justify-between items-start pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-3">
              <Timer className="w-6 h-6 text-orange-400" />
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-60">Time Left</p>
                <p className={`text-2xl font-bold tabular-nums ${timeLeft < 10 ? 'text-red-500 animate-pulse' : ''}`}>
                  {timeLeft.toFixed(1)}s
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-3">
                <MapPin className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-60">To Usmanpura</p>
                  <p className="text-2xl font-bold tabular-nums">{distance}m</p>
                </div>
              </div>
              
              {/* Mute Button */}
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-volume-x"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-volume-2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Screens */}
        <AnimatePresence mode="wait">
          {gameState === 'START' && (
            <motion.div 
              key="start-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-gradient-to-br from-orange-600/40 via-orange-900/80 to-black/90 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center"
              >
                <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter text-orange-500 drop-shadow-[0_5px_15px_rgba(255,140,0,0.5)] leading-none mb-4">
                  Amdavad Drift
                </h1>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-12 tracking-[0.2em] uppercase opacity-90">
                  Bhattha to Usmanpura
                </h2>
                
                <button 
                  onClick={() => setGameState('SELECT')}
                  className="group relative px-16 py-6 bg-orange-500 text-white font-black text-2xl rounded-full overflow-hidden transition-all hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(255,140,0,0.3)]"
                >
                  <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <span className="relative flex items-center gap-3 group-hover:text-orange-600 transition-colors">
                    <Play className="w-8 h-8 fill-current" />
                    START ADVENTURE
                  </span>
                </button>
              </motion.div>

              {/* Copyright Footer */}
              <p className="absolute bottom-8 text-[10px] uppercase tracking-[0.2em] text-white/50 font-medium">
                COPYRIGHT © STANDARDPLUS BPO PVT. LTD.
              </p>
            </motion.div>
          )}

          {gameState === 'SELECT' && (
            <motion.div 
              key="select-screen"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/80 backdrop-blur-md p-8"
            >
              <div className="w-full max-w-5xl">
                <div className="flex justify-between items-center mb-12">
                  <button 
                    onClick={() => setGameState('START')}
                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors uppercase text-sm font-bold tracking-widest"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Back to Title
                  </button>
                  <h2 className="text-4xl font-black italic uppercase text-white tracking-widest">Choose Your Ride</h2>
                  <div className="w-24" /> {/* Spacer */}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  {(Object.keys(CAR_CONFIGS) as CarType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedCar(type)}
                      className={`relative p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-6 ${selectedCar === type ? 'bg-orange-500/20 border-orange-500 scale-105 shadow-[0_0_40px_rgba(255,140,0,0.2)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${selectedCar === type ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/40'}`}>
                        <Car className="w-10 h-10" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-2xl font-black uppercase mb-2">{CAR_CONFIGS[type].name}</h3>
                        <p className="text-sm text-white/60 leading-relaxed h-12">{CAR_CONFIGS[type].description}</p>
                      </div>
                      
                      <div className="w-full space-y-4 mt-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest opacity-60">
                            <span>Top Speed</span>
                            <span className="text-orange-400">{CAR_CONFIGS[type].speed}</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(CAR_CONFIGS[type].speed / 80) * 100}%` }}
                              className="h-full bg-orange-500" 
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest opacity-60">
                            <span>Handling</span>
                            <span className="text-emerald-400">{Math.round(CAR_CONFIGS[type].handling * 100)}</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(CAR_CONFIGS[type].handling / 0.18) * 100}%` }}
                              className="h-full bg-emerald-500" 
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-4">
                  <button 
                    onClick={startGame}
                    className="px-20 py-6 bg-orange-500 text-white font-black text-3xl rounded-full hover:bg-white hover:text-black transition-all hover:scale-110 active:scale-95 shadow-[0_15px_40px_rgba(255,140,0,0.3)]"
                  >
                    RACE NOW
                  </button>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">Press ESC to go back</p>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-xl w-full"
            >
              <h2 className="text-6xl font-black italic uppercase text-red-500 mb-4">Time Up!</h2>
              <p className="text-white/60 mb-12">Game Over: You got stuck in Amdavad Traffic!</p>
              <button 
                onClick={() => setGameState('SELECT')}
                className="flex items-center gap-3 px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-orange-500 hover:text-white transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                TRY AGAIN
              </button>
            </motion.div>
          )}

          {gameState === 'WIN' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center pointer-events-auto bg-orange-500/80 backdrop-blur-xl w-full"
            >
              <Trophy className="w-24 h-24 text-white mb-6 animate-bounce" />
              <h2 className="text-6xl font-black italic uppercase text-white mb-4">Usmanpura!</h2>
              <p className="text-white/80 mb-12">You conquered Ashram Road in {CAR_CONFIGS[selectedCar].name}.</p>
              <button 
                onClick={() => setGameState('SELECT')}
                className="flex items-center gap-3 px-8 py-4 bg-black text-white font-bold rounded-full hover:bg-white hover:text-black transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                RACE AGAIN
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        {gameState === 'PLAYING' && (
          <div className="w-full flex justify-between items-end pointer-events-auto p-4 gap-4">
            <div className="flex gap-4">
              <button 
                onMouseDown={() => setIsSteeringLeft(true)}
                onMouseUp={() => setIsSteeringLeft(false)}
                onMouseLeave={() => setIsSteeringLeft(false)}
                onTouchStart={() => setIsSteeringLeft(true)}
                onTouchEnd={() => setIsSteeringLeft(false)}
                className={`w-20 h-20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 transition-all ${isSteeringLeft ? 'bg-white/40 scale-90' : 'bg-white/10'}`}
              >
                <ChevronLeft className="w-10 h-10" />
              </button>
              <button 
                onMouseDown={() => setIsSteeringRight(true)}
                onMouseUp={() => setIsSteeringRight(false)}
                onMouseLeave={() => setIsSteeringRight(false)}
                onTouchStart={() => setIsSteeringRight(true)}
                onTouchEnd={() => setIsSteeringRight(false)}
                className={`w-20 h-20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 transition-all ${isSteeringRight ? 'bg-white/40 scale-90' : 'bg-white/10'}`}
              >
                <ChevronRight className="w-10 h-10" />
              </button>
            </div>

            <button 
              onMouseDown={() => setIsGassing(true)}
              onMouseUp={() => setIsGassing(false)}
              onMouseLeave={() => setIsGassing(false)}
              onTouchStart={() => setIsGassing(true)}
              onTouchEnd={() => setIsGassing(false)}
              className={`w-24 h-32 rounded-3xl flex flex-col items-center justify-center backdrop-blur-md border border-white/20 transition-all ${isGassing ? 'bg-emerald-500/40 scale-95' : 'bg-white/10'}`}
            >
              <Zap className={`w-10 h-10 mb-2 transition-colors ${isGassing ? 'text-emerald-400' : 'text-white/40'}`} />
              <span className="text-xs font-bold uppercase tracking-widest opacity-60">Gas</span>
            </button>
          </div>
        )}
      </div>

      {/* Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-radial-gradient from-transparent to-black/40" />
    </div>
  );
}
