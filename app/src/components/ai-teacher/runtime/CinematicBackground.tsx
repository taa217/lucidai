import React from 'react'

export const CinematicBackground: React.FC<{ t: number }> = ({ t }) => {
  const driftX = Math.sin((t || 0) * 0.15) * 20
  const driftY = Math.cos((t || 0) * 0.13) * 16
  const blobScale = 1 + Math.sin((t || 0) * 0.25) * 0.05
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
      <div style={{
        position: 'absolute', width: '140%', height: '140%', left: '-20%', top: '-20%',
        background: 'radial-gradient(1200px 800px at 30% 20%, rgba(59,130,246,0.18), transparent 60%)',
        transform: `translate(${driftX}px, ${driftY}px)`
      }} />
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: 9999,
        background: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.18), transparent 60%)',
        filter: 'blur(40px)',
        left: '10%', top: '30%',
        transform: `scale(${blobScale}) translateY(${driftY * 0.4}px)`
      }} />
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: 9999,
        background: 'radial-gradient(circle at 50% 50%, rgba(34,197,94,0.12), transparent 60%)',
        filter: 'blur(50px)',
        right: '0%', top: '10%',
        transform: `scale(${1.02 + Math.sin((t || 0) * 0.2) * 0.03}) translateX(${driftX * 0.3}px)`
      }} />
    </div>
  )
}

export default CinematicBackground


