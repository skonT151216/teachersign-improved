import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
export default function LocalQr({ value }: { value: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let active = true; setSrc(''); QRCode.toDataURL(value, { width: 160, margin: 1 }).then(image => { if (active) setSrc(image); }); return () => { active = false; }; }, [value]);
  return src ? <img src={src} alt="QR" className="w-40 h-40" /> : <p>QR 생성 중…</p>;
}
