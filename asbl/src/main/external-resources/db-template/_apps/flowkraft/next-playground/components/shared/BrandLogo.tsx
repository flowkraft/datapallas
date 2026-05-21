export function BrandLogo({ width = 28, height = 28 }: { width?: number; height?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={width} height={height}
         style={{display:'inline-block',verticalAlign:'-6px',marginLeft:'3px',flexShrink:0,filter:'drop-shadow(0px 1px 3px rgba(0,0,0,0.7))'}}>
      <rect x="32" y="56" width="192" height="14" fill="#f0e2c0"/>
      <rect x="32" y="70" width="192" height="22" fill="#c9603a"/>
      <rect x="32" y="92" width="192" height="8" fill="#e8d4a8"/>
      <rect x="32" y="100" width="192" height="6" fill="#d4a843"/>
      <rect x="44"  y="106" width="36" height="98" fill="#f8f2e8"/>
      <rect x="110" y="106" width="36" height="98" fill="#f8f2e8"/>
      <rect x="176" y="106" width="36" height="98" fill="#f8f2e8"/>
      <rect x="77"  y="106" width="5" height="98" fill="#b89858"/>
      <rect x="143" y="106" width="5" height="98" fill="#b89858"/>
      <rect x="209" y="106" width="3" height="98" fill="#b89858"/>
      <rect x="32" y="204" width="192" height="6" fill="#d4a843"/>
      <rect x="20"  y="210" width="216" height="10" fill="#e8d4a8"/>
      <rect x="0"   y="220" width="256" height="14" fill="#c8a860"/>
    </svg>
  )
}
