import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, CircleHelp, Hand, RotateCcw, Square, X } from 'lucide-react'
import { FilesetResolver, ImageSegmenter, GestureRecognizer } from '@mediapipe/tasks-vision'

const WASM = '/mediapipe/wasm'
const SEGMENT_MODEL = '/models/selfie_segmenter.tflite'
const GESTURE_MODEL = '/models/gesture_recognizer.task'
type Gesture = 'Open palm' | 'Closed fist' | 'Two fingers' | '—'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null), outputRef = useRef<HTMLCanvasElement>(null), maskRef = useRef<HTMLCanvasElement>(null), blurMaskRef = useRef<HTMLCanvasElement>(null), bgRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<{ segmenter: ImageSegmenter; gestures: GestureRecognizer } | null>(null), streamRef = useRef<MediaStream | null>(null), rafRef = useRef(0)
  const stableRef = useRef({ candidate: '—' as Gesture, count: 0, missed: 0, lastAction: 0, lastGesture: '—' as Gesture })
  const [cameraOn, setCameraOn] = useState(false), [backgroundReady, setBackgroundReady] = useState(false), [active, setActive] = useState(false), [paused, setPaused] = useState(false)
  const [gesture, setGesture] = useState<Gesture>('—'), [cameraList, setCameraList] = useState<MediaDeviceInfo[]>([]), [cameraId, setCameraId] = useState('')
  const [error, setError] = useState(''), [toast, setToast] = useState('')
  const sensitivity = 48, smooth = 5
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    let alive = true
    ;(async () => {
      let gpuError = ''
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM)
        const buildEngine = async (delegate: 'GPU' | 'CPU') => {
          const segmenter = await ImageSegmenter.createFromOptions(vision, { baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true })
          try {
            const gestures = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: GESTURE_MODEL, delegate }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45, cannedGesturesClassifierOptions: { categoryAllowlist: ['Open_Palm', 'Closed_Fist', 'Victory'], scoreThreshold: .5 } })
            return { segmenter, gestures }
          } catch (e) { segmenter.close(); throw e }
        }
        let engine: { segmenter: ImageSegmenter; gestures: GestureRecognizer }
        try { engine = await buildEngine('GPU') }
        catch (gpuIssue) { gpuError = gpuIssue instanceof Error ? gpuIssue.message : String(gpuIssue); engine = await buildEngine('CPU') }
        if (!alive) { engine.segmenter.close(); engine.gestures.close(); return }
        engineRef.current = engine
      } catch (e) { const detail = e instanceof Error ? e.message : String(e); setError(`AI models could not start. Check the local MediaPipe assets, then reload. ${gpuError ? `GPU: ${gpuError}. ` : ''}CPU: ${detail}`) }
    })()
    return () => { alive = false; cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); engineRef.current?.segmenter.close(); engineRef.current?.gestures.close() }
  }, [])

  const stopCamera = useCallback(() => { cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setCameraOn(false); setBackgroundReady(false); setGesture('—'); setActive(false); setPaused(false); if (outputRef.current) { const c = outputRef.current.getContext('2d'); c?.clearRect(0, 0, outputRef.current.width, outputRef.current.height) } }, [])
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access needs localhost or a secure HTTPS connection.'); return }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: cameraId ? { exact: cameraId } : undefined, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30, max: 30 } } })
      streamRef.current = stream
      const video = videoRef.current!; video.srcObject = stream; await video.play(); setCameraOn(true)
      navigator.mediaDevices.enumerateDevices().then(list => setCameraList(list.filter(d => d.kind === 'videoinput'))).catch(() => setCameraList([]))
      setError(message => message.startsWith('Camera permission') || message.startsWith('No camera') ? '' : message)
      notify('Camera connected. Step out of frame to capture your background.')
    } catch (e) { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Allow camera access for this page, then try again.' : e instanceof Error && e.name === 'NotFoundError' ? 'No camera was found. Connect a camera and try again.' : 'The camera may be in use by another app. Close it there and try again.') }
  }
  const captureBackground = () => {
    const video = videoRef.current, bg = bgRef.current
    if (!video || !bg || !cameraOn) return
    bg.width = video.videoWidth; bg.height = video.videoHeight; bg.getContext('2d')?.drawImage(video, 0, 0, bg.width, bg.height)
    setBackgroundReady(true); setActive(false); setPaused(false); notify('Background captured. Your camera position should stay still.')
  }
  const applyGesture = (g: Gesture) => {
    setGesture(g)
    const stable = stableRef.current
    if (g === '—') { stable.missed++; stable.candidate = '—'; stable.count = 0; if (stable.missed >= 3) stable.lastGesture = '—'; return }
    stable.missed = 0
    if (stable.candidate === g) stable.count++; else { stable.candidate = g; stable.count = 1 }
    if (stable.count < 3 || performance.now() - stable.lastAction < 250 || stable.lastGesture === g) return
    stable.lastAction = performance.now(); stable.lastGesture = g
    if (g === 'Open palm') {
      if (backgroundReady) { setActive(true); setPaused(false) }
      else notify('Open palm detected. Step out of frame and capture the background first.')
    }
    if (g === 'Closed fist') { setActive(false); setPaused(false) }
    if (g === 'Two fingers' && active) setPaused(p => !p)
  }
  useEffect(() => {
    if (!cameraOn) return
    let lastGestureAt = 0
    const loop = (now: number) => {
      const video = videoRef.current, output = outputRef.current, maskCanvas = maskRef.current, blurCanvas = blurMaskRef.current, bg = bgRef.current, engine = engineRef.current
      if (!video || !output || !maskCanvas || !blurCanvas || video.readyState < 2 || !video.videoWidth) { rafRef.current = requestAnimationFrame(loop); return }
      const w = Math.min(video.videoWidth, 640), h = Math.round(w * video.videoHeight / video.videoWidth)
      if (output.width !== w || output.height !== h) { output.width = w; output.height = h }
      const ctx = output.getContext('2d')!, mctx = maskCanvas.getContext('2d')!
      try {
        ctx.drawImage(video, 0, 0, w, h)
        if (engine && now - lastGestureAt >= 45) {
          lastGestureAt = now
          const result = engine.gestures.recognizeForVideo(video, now), category = result.gestures?.[0]?.[0]
          applyGesture(classifyGesture(category))
        }
        if (engine && active && !paused && backgroundReady && bg) {
          const result = engine.segmenter.segmentForVideo(video, now)
          const mask = result.confidenceMasks?.[0]
          if (mask) {
            try {
              const mw = mask.width, mh = mask.height, src = mask.getAsFloat32Array(), image = mctx.createImageData(mw, mh), threshold = sensitivity / 100
              if (maskCanvas.width !== mw || maskCanvas.height !== mh) { maskCanvas.width = mw; maskCanvas.height = mh; blurCanvas.width = mw; blurCanvas.height = mh }
              for (let i = 0; i < src.length; i++) { const value = src[i] > threshold ? 255 : 0; const j = i * 4; image.data[j] = 255; image.data[j + 1] = 255; image.data[j + 2] = 255; image.data[j + 3] = value }
              mctx.putImageData(image, 0, 0)
              if (smooth > 0) { const bctx = blurCanvas.getContext('2d')!; bctx.clearRect(0, 0, mw, mh); bctx.filter = `blur(${smooth / 3}px)`; bctx.drawImage(maskCanvas, 0, 0); bctx.filter = 'none' }
              const compositingMask = smooth > 0 ? blurCanvas : maskCanvas
              ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(compositingMask, 0, 0, w, h); ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(bg, 0, 0, w, h); ctx.restore()
            } finally {
              mask.close()
            }
          }
        }
      } catch (e) { if (!(e instanceof Error && e.message.includes('timestamp'))) setError('Frame processing paused. Restart the camera to continue.') }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop); return () => cancelAnimationFrame(rafRef.current)
  }, [cameraOn, sensitivity, smooth, active, paused, backgroundReady])

  return <main className="app-shell">
    <section className="popup-shell">
      <header className="app-header">
        <span className="header-doodle" aria-hidden="true">✳</span>
        <div className="title-block"><span className="eyebrow">A LITTLE CAMERA MAGIC</span><h1>Disappearing <em>in Plain Sight</em></h1></div>
        <span className={`camera-state ${cameraOn ? 'camera-on' : ''}`}><i/>{cameraOn ? 'LIVE' : 'OFF'}</span>
      </header>

      <section className="preview-card" aria-label="Camera preview">
        <video ref={videoRef} className="source-video" playsInline muted/>
        <canvas ref={outputRef} className="main-canvas"/>
        <canvas ref={maskRef} className="hidden-canvas"/><canvas ref={blurMaskRef} className="hidden-canvas"/><canvas ref={bgRef} className="hidden-canvas"/>
        {!cameraOn && <div className="preview-placeholder"><span className="placeholder-doodle" aria-hidden="true">✦</span><p>Your stage is ready</p></div>}
        {cameraOn && <div className={`live-label ${active && !paused ? 'invisible-label' : ''}`}><i/>{active && !paused ? 'INVISIBLE' : paused ? 'PAUSED' : 'LIVE'}</div>}
      </section>

      <div className="camera-actions">
        {cameraOn ? <button className="scribble-button secondary-button" onClick={stopCamera}><Square size={13} fill="currentColor"/> Stop</button> : <button className="scribble-button secondary-button" onClick={startCamera}><Camera size={14}/> Start camera</button>}
        <button className="scribble-button capture-button" disabled={!cameraOn} onClick={captureBackground}><RotateCcw size={14}/>{backgroundReady ? 'Retake background' : 'Capture background'}</button>
        {cameraOn && cameraList.length > 1 && <select className="camera-select" aria-label="Select camera" value={cameraId} onChange={e => { setCameraId(e.target.value); stopCamera() }}>{cameraList.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}</select>}
      </div>

      {!backgroundReady && <p className="helper-note"><span aria-hidden="true">↗</span> {cameraOn ? 'Step out of frame, then capture the empty background.' : 'Start the camera, then capture an empty background.'}</p>}
      {backgroundReady && !active && <p className="helper-note ready-note"><span aria-hidden="true">✎</span> Step back in and show an open palm to disappear.</p>}

      <section className="gesture-guide">
        <div className="guide-heading"><h2>Gesture guide</h2><span className={`listening-state ${cameraOn ? 'is-listening' : ''}`}>{cameraOn ? 'I’m watching' : 'Camera off'}</span></div>
        <div className="detected-gesture"><Hand size={16}/><span>Seen now: <strong>{gesture === '—' ? 'waiting for a hand' : gesture}</strong></span></div>
        <div className="gesture-grid">
          <div className={`gesture-card ${gesture === 'Open palm' ? 'gesture-active' : ''}`}><span className="gesture-doodle">✋</span><strong>Open palm</strong><small>Disappear</small></div>
          <div className={`gesture-card ${gesture === 'Closed fist' ? 'gesture-active' : ''}`}><span className="gesture-doodle">✊</span><strong>Closed fist</strong><small>Reappear</small></div>
          <div className={`gesture-card ${gesture === 'Two fingers' ? 'gesture-active' : ''}`}><span className="gesture-doodle">✌️</span><strong>Two fingers</strong><small>Pause / resume</small></div>
        </div>
        <p className="guide-tip"><CircleHelp size={13}/> Hold a gesture steady for a moment.</p>
      </section>
      <div className="privacy-scribble"><span>✳</span> Your camera stays on this device.</div>
      <footer className="creator-credit">created by minchara</footer>
    </section>
    {error && <div className="error-toast"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {toast && <div className="toast"><Check size={14}/>{toast}</div>}
  </main>
}
function classifyGesture(category?: { categoryName: string; score: number }): Gesture {
  if (!category || category.score < .5) return '—'
  if (category.categoryName === 'Open_Palm') return 'Open palm'
  if (category.categoryName === 'Closed_Fist') return 'Closed fist'
  if (category.categoryName === 'Victory') return 'Two fingers'
  return '—'
}
