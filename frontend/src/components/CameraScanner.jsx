import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { Camera, AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';

// The 1D/2D symbologies this app actually uses (EAN-13, CODE128, plus QR as a
// catch-all). Limiting formats makes decoding faster and more reliable.
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

const REGION_ID = 'camera-scanner-region';

// Camera barcode scanner in a modal. Calls onScan(code) when a barcode is read.
// By default the scanner stops and the modal closes after a successful scan;
// pass continuous to keep scanning (e.g. adding multiple items in a row).
// Short confirmation beep on a shared, already-unlocked AudioContext.
// A new AudioContext created outside a user gesture starts "suspended" and
// stays silent, so we create/resume it on the opening gesture and reuse it.
function playBeep(ctx) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880; // A5 — a clear, short "ding"
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* audio not available — silent */ }
}

// Minimum gap between two accepted scans, regardless of barcode.
const SCAN_COOLDOWN_MS = 1000;

export default function CameraScanner({ open, onClose, onScan, title = 'Scan Barcode', continuous = false }) {
  const lastScanAtRef = useRef(0);
  const audioCtxRef = useRef(null);
  // Latest callbacks, so the effect can stay mounted across prop changes
  // without tearing down (and restarting) the camera.
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return undefined;

    setError('');
    setStarting(true);

    // Create + unlock the audio context now. The scanner is opened by a button
    // tap, so this runs close enough to the gesture for browsers to allow it.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    } catch { /* audio unavailable */ }

    const scanner = new Html5Qrcode(REGION_ID, { formatsToSupport: SCAN_FORMATS, verbose: false });

    const handleSuccess = (decodedText) => {
      // Enforce a flat 1s cooldown between accepted scans. The camera fires
      // this callback many times per second while a code is in frame, so this
      // stops one barcode from being added repeatedly and paces the next scan.
      const now = Date.now();
      if (now - lastScanAtRef.current < SCAN_COOLDOWN_MS) return;
      lastScanAtRef.current = now;

      playBeep(audioCtxRef.current);
      onScanRef.current(decodedText);
      if (!continuous) onCloseRef.current();
    };

    // Track the start promise so cleanup always waits for start to settle
    // before stopping — stopping mid-start is what leaked the camera before.
    const startPromise = scanner
      .start(
        { facingMode: 'environment' }, // prefer the rear camera on phones
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.7778 },
        handleSuccess,
        () => { /* per-frame "not found" — ignore */ }
      )
      .then(() => { setStarting(false); return true; })
      .catch((err) => {
        setStarting(false);
        const msg = /permission|NotAllowed/i.test(err?.message || '')
          ? 'Camera permission denied. Allow camera access in your browser settings and try again.'
          : /NotFound|no camera/i.test(err?.message || '')
            ? 'No camera found on this device.'
            : 'Unable to start the camera. It may be in use by another app.';
        setError(msg);
        return false; // start failed → nothing to stop
      });

    return () => {
      // Wait for start() to finish, then fully release the camera + DOM.
      // Guard with the scanner's own state so we never call stop() when it
      // isn't running (which throws and would leave the track alive).
      startPromise.then((started) => {
        if (!started) return;
        const stopIfRunning = () => {
          try {
            if (scanner.getState && scanner.getState() === Html5QrcodeScannerState.SCANNING) {
              return scanner.stop();
            }
          } catch { /* ignore */ }
          return Promise.resolve();
        };
        Promise.resolve(stopIfRunning())
          .catch(() => {})
          .finally(() => { try { scanner.clear(); } catch { /* ignore */ } });
      });

      // Release the audio context.
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [open, continuous]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-3">
        {error ? (
          <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <div id={REGION_ID} className="w-full h-full" />
              {starting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Camera size={28} className="animate-pulse" />
                  <span className="text-sm">Starting camera…</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 text-center">
              Point the rear camera at the barcode. A beep confirms each scan.
              {continuous ? ' Keeps scanning (1s gap between items) until you close this window.' : ''}
            </p>
          </>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
