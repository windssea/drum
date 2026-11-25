import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, memo, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { APPROACH, LANES, chart, type Session } from './game'

const strike = 3.1
const depth = 29
const spacing = 1.87
const laneX = (index: number) => (index - 1.5) * spacing
const sparkCount = 22

function CameraRig() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    camera.position.set(0, 5.65, 9.25)
    camera.lookAt(0, 0, -2.35)
    const aspect = size.width / Math.max(size.height, 1)
    const fovToFitPads = THREE.MathUtils.radToDeg(2 * Math.atan(4.15 / (7.8 * aspect)))
    camera.fov = THREE.MathUtils.clamp(Math.max(42 * (1.56 / aspect) ** 0.36, fovToFitPads), 38, 72)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

function LaneTrack({ index, session, reduced }: { index: number; session: RefObject<Session>; reduced: boolean }) {
  const lane = LANES[index]
  const pad = useRef<THREE.Group>(null)
  const light = useRef<THREE.MeshBasicMaterial>(null)
  const echo = useRef<THREE.Mesh>(null)
  const echoMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const sparks = useRef<THREE.Points>(null)
  const sparkMaterial = useRef<THREE.PointsMaterial>(null)
  const positions = useMemo(() => new Float32Array(sparkCount * 3), [])
  const x = laneX(index)

  useFrame(() => {
    const hit = session.current.impacts[lane.id]
    const age = hit ? Math.max(0, performance.now() - hit.at) : Infinity
    const intensity = hit ? 0.45 + (hit.velocity / 127) * 0.55 : 0
    const decay = Math.max(0, 1 - age / 460)
    light.current!.opacity = 0.16 + decay * intensity * 0.79
    pad.current!.position.y = reduced ? 0 : -0.12 * (Math.max(0, 1 - age / 150) ** 3) * intensity
    echo.current!.visible = !reduced && age < 660
    sparks.current!.visible = !reduced && age < 570
    if (echo.current!.visible) {
      echo.current!.scale.setScalar(0.55 + age / 370)
      echoMaterial.current!.opacity = (1 - age / 660) ** 2 * intensity
    }
    if (!sparks.current!.visible) return
    const time = age / 570
    for (let dot = 0; dot < sparkCount; dot++) {
      const angle = dot * 2.39996
      const reach = (0.35 + (dot % 7) * 0.21) * intensity * time
      positions[dot * 3] = Math.cos(angle) * reach
      positions[dot * 3 + 1] = Math.sin(time * Math.PI) * (0.4 + (dot % 5) * 0.24) * intensity
      positions[dot * 3 + 2] = Math.sin(angle) * reach - time * 0.26
    }
    sparks.current!.geometry.getAttribute('position').needsUpdate = true
    sparkMaterial.current!.opacity = (1 - time) * 0.88
  })

  return (
    <group position={[x, 0, 0]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.035, strike - depth / 2]}>
        <planeGeometry args={[spacing - 0.026, depth + 1.3]} />
        <meshBasicMaterial color={lane.color} transparent opacity={0.064} depthWrite={false} />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * (spacing / 2 - 0.04), 0, strike - depth / 2]}>
          <boxGeometry args={[0.018, 0.018, depth + 1.24]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.28} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, strike]}>
        <planeGeometry args={[spacing - 0.08, 3.5]} />
        <meshBasicMaterial ref={light} color={lane.color} opacity={0.16} transparent depthWrite={false} />
      </mesh>
      <group ref={pad}>
        <mesh position={[0, 0.107, strike]}>
          <boxGeometry args={[1.58, 0.21, 0.86]} />
          <meshBasicMaterial color="#1d263b" />
        </mesh>
        <mesh position={[0, 0.214, strike]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1.58, 0.86]} />
          <meshBasicMaterial color={lane.color} opacity={0.34} transparent />
        </mesh>
        <mesh position={[0, 0.227, strike + 0.414]}>
          <boxGeometry args={[1.53, 0.023, 0.024]} />
          <meshBasicMaterial color={lane.color} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.231, strike]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.31, 0.062]} />
          <meshBasicMaterial color={lane.color} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={echo} visible={false} rotation-x={-Math.PI / 2} position={[0, 0.24, strike]}>
        <ringGeometry args={[0.54, 0.61, 40]} />
        <meshBasicMaterial ref={echoMaterial} color={lane.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={sparks} visible={false} frustumCulled={false} position={[0, 0.39, strike]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} usage={THREE.DynamicDrawUsage} />
        </bufferGeometry>
        <pointsMaterial ref={sparkMaterial} color={lane.color} size={0.094} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  )
}

const noteLane = chart.map(note => LANES.findIndex(lane => lane.id === note.lane))

function Notes({ session }: { session: RefObject<Session> }) {
  const meshes = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const round = session.current.round
    const elapsed = round ? performance.now() - round.startAt : -Infinity
    chart.forEach((note, index) => {
      const mesh = meshes.current[index]
      if (!mesh) return
      const remaining = note.at - elapsed
      mesh.visible = Boolean(round && !round.finished && !round.resolved.has(index) && remaining <= APPROACH && remaining >= -180)
      if (mesh.visible) mesh.position.z = strike - remaining / APPROACH * (depth - 1)
    })
  })

  return <>{chart.map((note, index) => (
    <group key={`${note.at}-${note.lane}`} ref={mesh => { meshes.current[index] = mesh }} visible={false} position-x={laneX(noteLane[index])}>
      <mesh position-y={0.35}>
        <boxGeometry args={[1.42, 0.15, 0.46]} />
        <meshBasicMaterial color={LANES[noteLane[index]].color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.435, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.27, 0.15]} />
        <meshBasicMaterial color="#f6f8ff" transparent opacity={0.75} />
      </mesh>
    </group>
  ))}</>
}

const markers = Array.from({ length: 19 }, (_, index) => index)
const bars = Array.from({ length: 48 }, (_, index) => ({
  x: (index - 23.5) * 0.57,
  height: (0.25 + Math.sin(index * 2.84) ** 2 * 2.6) * (0.35 + Math.abs(index - 23.5) / 20),
}))

function Horizon({ session, reduced }: { session: RefObject<Session>; reduced: boolean }) {
  const equalizer = useRef<THREE.Group>(null)
  const field = useMemo(() => Float32Array.from({ length: 93 * 3 }, (_, i) => {
    const star = Math.floor(i / 3) + 1
    const fraction = (Math.sin(star * (i % 3 + 13) * 46.278) * 2048) % 1 + 0.5
    return i % 3 === 0 ? (fraction - 0.5) * 28 : i % 3 === 1 ? 1 + fraction * 8 : -23 - fraction * 16
  }), [])
  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime
    const now = performance.now()
    const energy = Math.max(0, ...Object.values(session.current.impacts).map(hit => (
      Math.max(0, 1 - (now - hit.at) / 600) * (hit.velocity / 127)
    )))
    equalizer.current?.children.forEach((bar, index) => {
      const scale = reduced ? 0.84 : 0.56 + Math.sin(elapsed * 2.1 + index * 0.86) ** 2 * 0.35 + energy * (0.7 + index % 5 * 0.15)
      bar.scale.y = scale
      bar.position.y = bars[index].height * scale / 2
    })
  })
  return (
    <>
      <group ref={equalizer} position-z={-27}>
        {bars.map(({ x, height }, index) => (
          <mesh key={x} position={[x, height / 2, 0]}>
            <boxGeometry args={[0.08, height, 0.035]} />
            <meshBasicMaterial color={index % 3 === 0 ? '#9a8afb' : '#4e64aa'} transparent opacity={0.31} />
          </mesh>
        ))}
      </group>
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[field, 3]} /></bufferGeometry>
        <pointsMaterial color="#a9aff5" size={0.056} transparent opacity={0.58} sizeAttenuation />
      </points>
      {markers.map(mark => (
        <mesh key={mark} position={[0, 0.003, strike - mark * 1.61]}>
          <boxGeometry args={[mark % 4 === 0 ? 14 : 7.45, 0.012, mark % 4 === 0 ? 0.027 : 0.014]} />
          <meshBasicMaterial color="#889de1" transparent opacity={mark % 4 === 0 ? 0.23 : 0.13} />
        </mesh>
      ))}
    </>
  )
}

function FlatStage({ session, reduced }: { session: RefObject<Session>; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const node = canvas.current!
    const context = node.getContext('2d')
    if (!context) return
    let frame = 0
    function draw(now: number) {
      const width = node.clientWidth
      const height = node.clientHeight
      if (node.width !== width || node.height !== height) {
        node.width = width
        node.height = height
      }
      const ctx = context!
      ctx.clearRect(0, 0, width, height)
      const hitLine = height * 0.87
      LANES.forEach((lane, index) => {
        const x = width * (0.1 + 0.2 * index)
        const active = session.current.impacts[lane.id]
        const flash = active ? Math.max(0, 1 - (now - active.at) / (reduced ? 200 : 450)) : 0
        ctx.fillStyle = lane.color
        ctx.globalAlpha = 0.075 + flash * 0.25
        ctx.fillRect(x, height * 0.18, width * 0.197, hitLine - height * 0.18)
        ctx.globalAlpha = 0.76
        ctx.fillRect(x + 6, hitLine, width * 0.2 - 12, 4)
      })
      const round = session.current.round
      if (round && !round.finished) chart.forEach((note, index) => {
        const remaining = note.at - (now - round.startAt)
        if (remaining > APPROACH || remaining < -180 || round.resolved.has(index)) return
        const lane = noteLane[index]
        ctx.fillStyle = LANES[lane].color
        ctx.globalAlpha = 0.9
        ctx.fillRect(width * (0.1 + lane * 0.2) + 7, hitLine - remaining / APPROACH * height * 0.68, width * 0.2 - 14, 9)
      })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [reduced, session])
  return <canvas ref={canvas} className="flat-stage" aria-hidden="true" />
}

class StageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export const DrumStage = memo(function DrumStage({ session, reduced }: { session: RefObject<Session>; reduced: boolean }) {
  const fallback = <FlatStage session={session} reduced={reduced} />
  const hasWebGL = useMemo(() => {
    try {
      const probe = document.createElement('canvas').getContext('webgl2')
      probe?.getExtension('WEBGL_lose_context')?.loseContext()
      return Boolean(probe)
    } catch {
      return false
    }
  }, [])
  return (
    <div className="scene" aria-hidden="true">
      {hasWebGL ? <StageBoundary fallback={fallback}>
        <Canvas dpr={[1, 1.55]} gl={{ alpha: true, antialias: true }}>
          <CameraRig />
          <Horizon session={session} reduced={reduced} />
          {LANES.map((lane, index) => <LaneTrack key={lane.id} index={index} session={session} reduced={reduced} />)}
          <Notes session={session} />
        </Canvas>
      </StageBoundary> : fallback}
    </div>
  )
})
