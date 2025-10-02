import React from 'react'

export const FallbackVisuals: React.FC<any> = ({ slide, timeSeconds, timeline }) => {
  const activeEvents = (timeline || []).filter((t: any) => (t?.at ?? 0) <= (timeSeconds || 0)).map((t: any) => t.event)
  const showIntro = activeEvents.includes('intro') || activeEvents.length === 0
  const showBeat2 = activeEvents.some((e: any) => (e || '').includes('reveal:1') || (e || '').includes('reveal:main'))
  const showBeat3 = activeEvents.some((e: any) => (e || '').includes('reveal:2'))
  const showBeat4 = activeEvents.some((e: any) => (e || '').includes('reveal:3'))
  const t = timeSeconds || 0
  const driftX = Math.sin(t * 0.6) * 6
  const driftY = Math.cos(t * 0.5) * 5
  return (
    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, system-ui, Arial', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#60a5fa', marginBottom: 16, transform: `translate(${driftX}px, ${driftY * 0.2}px)`, opacity: showIntro ? 1 : 0.9, transition: 'opacity 0.4s linear' }}>{slide?.title || 'Lesson Topic'}</h1>
      {showIntro && <p style={{ opacity: 0.95, transition: 'opacity 0.5s ease' }}>Starting the lesson...</p>}
      <div style={{ marginTop: 24, width: '90%', maxWidth: '640px' }}>
        <svg width="100%" height="220" viewBox="0 0 800 220" style={{ display: 'block' }}>
          <rect x="0" y="0" width="800" height="220" rx="10" fill="#0b1220" stroke="#1f2a44" />
          <circle cx={120 + driftX} cy={110 + driftY} r="42" fill={showBeat2 ? '#22c55e' : '#475569'} style={{ transition: 'fill 0.4s ease' }} />
          <rect x="200" y="72" width={showBeat3 ? 480 : 200} height="28" rx="8" fill="#334155" style={{ transition: 'width 0.5s ease' }} />
          <rect x="200" y="112" width={showBeat4 ? 400 : 160} height="24" rx="8" fill="#1f2a44" style={{ transition: 'width 0.5s ease' }} />
          <text x="200" y="60" fill="#94a3b8" fontSize="14">Core idea</text>
        </svg>
      </div>
    </div>
  )
}

export default FallbackVisuals


