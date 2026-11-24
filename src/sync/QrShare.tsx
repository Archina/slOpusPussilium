import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";

export function QrImage({ value, label }: { value: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, value, { width: 280, margin: 2, errorCorrectionLevel: "M", color: { dark: "#f4b294", light: "#100a22" } })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not draw the pairing QR"));
  }, [value]);
  return <div className="qr-image"><canvas ref={canvas} aria-label={label} />{error && <p role="alert">{error}</p>}</div>;
}

export function QrScanner({ onResult, onCancel }: { onResult: (value: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;
    const scan = () => {
      if (cancelled || !video.current || !overlay.current) return;
      if (video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const canvas = overlay.current;
        if (canvas.width !== video.current.videoWidth || canvas.height !== video.current.videoHeight) {
          canvas.width = video.current.videoWidth;
          canvas.height = video.current.videoHeight;
        }
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (result?.data) { onResult(result.data); return; }
        }
      }
      frame = requestAnimationFrame(scan);
    };
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((media) => {
        stream = media;
        if (!video.current) return;
        video.current.srcObject = media;
        return video.current.play().then(() => { frame = requestAnimationFrame(scan); });
      })
      .catch((reason) => setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Camera permission was denied. Paste the pairing code instead." : "Camera unavailable. Paste the pairing code instead."));
    return () => { cancelled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [onResult]);
  return <div className="qr-scanner">
    <div className="qr-camera"><video ref={video} muted playsInline /><canvas ref={overlay} /><span className="qr-reticle" /></div>
    {error && <p className="qr-error" role="alert">{error}</p>}
    <label className="pairing-code">Or paste the pairing code<textarea rows={3} value={manual} onChange={(event) => setManual(event.target.value)} /></label>
    <div className="qr-actions"><button className="text-button" onClick={onCancel}>Cancel</button><button className="primary" disabled={!manual.trim()} onClick={() => onResult(manual.trim())}>Use pasted code</button></div>
  </div>;
}
