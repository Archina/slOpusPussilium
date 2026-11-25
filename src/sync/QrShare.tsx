import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";

export function QrImage({ value, label }: { value: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!canvas.current) return;
    void QRCode.toCanvas(canvas.current, value, {
      width: 640,
      margin: 4,
      errorCorrectionLevel: "L",
      color: { dark: "#000000", light: "#ffffff" },
    }).then(() => {
      if (!canvas.current) return;
      canvas.current.style.width = "100%";
      canvas.current.style.height = "auto";
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not draw the pairing QR"));
  }, [value]);
  return <div className="qr-image"><canvas ref={canvas} aria-label={label} />{error && <p role="alert">{error}</p>}</div>;
}

export function PairingQr({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      const area = document.querySelector<HTMLTextAreaElement>(".qr-code-text");
      area?.focus();
      area?.select();
      setCopied(false);
    }
  };
  return <div className="pairing-qr">
    <QrImage value={value} label={label} />
    <div className="qr-actions">
      <button className="text-button" onClick={() => setExpanded(true)}>Enlarge QR</button>
      <button className="text-button" onClick={() => void copy()}>{copied ? "Copied" : "Copy pairing code"}</button>
    </div>
    {expanded && <div className="qr-fullscreen" role="dialog" aria-modal="true" aria-label="Enlarged pairing QR" onClick={() => setExpanded(false)}>
      <QrImage value={value} label="Enlarged pairing QR" />
      <button className="primary" onClick={() => setExpanded(false)}>Close enlarged QR</button>
    </div>}
    <details className="qr-code-fallback"><summary>Show text code</summary><textarea className="qr-code-text" readOnly rows={4} value={value} /></details>
    <p className="qr-hint">Keep this screen bright. If the camera cannot read it, copy the code and paste it on the other device.</p>
  </div>;
}

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };

function makeDetector(): BarcodeDetectorLike | null {
  const Detector = (globalThis as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (!Detector) return null;
  try { return new Detector({ formats: ["qr_code"] }); } catch { return null; }
}

function decodeImage(image: ImageData) {
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

export function QrScanner({ onResult, onCancel }: { onResult: (value: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const resultHandler = useRef(onResult);
  resultHandler.current = onResult;
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;
    let busy = false;
    const detector = makeDetector();
    const scan = async () => {
      if (cancelled || !video.current || !canvas.current) return;
      if (!busy && video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        busy = true;
        const target = canvas.current;
        const width = video.current.videoWidth;
        const height = video.current.videoHeight;
        const scale = Math.min(1, 900 / Math.max(width, height));
        if (width && height) {
          target.width = Math.round(width * scale);
          target.height = Math.round(height * scale);
          const context = target.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(video.current, 0, 0, target.width, target.height);
            let value: string | null = null;
            try {
              if (detector) value = (await detector.detect(target))[0]?.rawValue ?? null;
              if (!value) {
                const image = context.getImageData(0, 0, target.width, target.height);
                value = decodeImage(image);
              }
            } catch { /* Detector failures fall through to the next frame. */ }
            if (value) { resultHandler.current(value); return; }
          }
        }
        busy = false;
      }
      timer = window.setTimeout(scan, 120);
    };
    void navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    }).then((media) => {
      stream = media;
      if (!video.current) return;
      video.current.srcObject = media;
      return video.current.play().then(() => { timer = window.setTimeout(scan, 120); });
    }).catch((reason) => setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Camera permission was denied. Paste the pairing code instead." : "Camera unavailable. Paste the pairing code instead."));
    return () => { cancelled = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, []);

  const readPhoto = async (file: File) => {
    setWorking(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const target = document.createElement("canvas");
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      target.width = Math.round(bitmap.width * scale);
      target.height = Math.round(bitmap.height * scale);
      const context = target.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(bitmap, 0, 0, target.width, target.height);
      const value = decodeImage(context.getImageData(0, 0, target.width, target.height));
      if (value) onResult(value);
      else setError("No QR code was found in that image. Try a closer, brighter photo.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read that image");
    } finally {
      setWorking(false);
    }
  };

  return <div className="qr-scanner">
    <div className="qr-camera"><video ref={video} muted playsInline /><canvas ref={canvas} /><span className="qr-reticle" /></div>
    <p className="qr-hint">Fill the frame with the QR code and hold steady. Keep the other screen bright.</p>
    {error && <p className="qr-error" role="alert">{error}</p>}
    <label className="qr-photo">Use a screenshot or photo<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readPhoto(file); event.target.value = ""; }} /></label>
    {working && <p className="qr-hint">Reading image…</p>}
    <label className="pairing-code">Or paste the pairing code<textarea rows={4} value={manual} onChange={(event) => setManual(event.target.value)} /></label>
    <div className="qr-actions"><button className="text-button" onClick={onCancel}>Cancel</button><button className="primary" disabled={!manual.trim()} onClick={() => onResult(manual.trim())}>Use pasted code</button></div>
  </div>;
}
