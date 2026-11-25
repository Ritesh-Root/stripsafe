import { Button } from '@astryxdesign/core/Button'
import { Camera, ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  onBack: () => void
  onImage: (file: Blob, label: string) => void
  busy: boolean
}

export function ScanScreen({ onBack, onImage, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cameraError, setCameraError] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const video = videoRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true)
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream = next
        if (video) {
          video.srcObject = next
          void video.play().catch(() => setCameraError(true))
        }
      })
      .catch(() => setCameraError(true))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onImage(blob, 'Camera photo')
    }, 'image/jpeg', 0.92)
  }

  async function useSample() {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/sample-strip.png`)
    const blob = await response.blob()
    onImage(blob, 'Labelled sample strip')
  }

  return (
    <>
      <div className="viewfinder">
        {cameraError ? (
          <p className="guide">Camera is unavailable. Upload a photo or try the labelled sample strip.</p>
        ) : (
          <video ref={videoRef} playsInline muted aria-label="Camera preview" />
        )}
        <p className="guide">Line up the batch number, then take a photo</p>
      </div>
      <div className="actions tight">
        <Button label={busy ? 'Reading the strip' : 'Take photo'} variant="primary" width="100%" isDisabled={busy || cameraError} isLoading={busy} onClick={capture} icon={<Camera aria-hidden="true" size={18} />} />
        <Button label="Upload an image" variant="secondary" width="100%" isDisabled={busy} onClick={() => fileRef.current?.click()} icon={<ImagePlus aria-hidden="true" size={18} />} />
        <Button label="Try the labelled sample strip" variant="secondary" width="100%" isDisabled={busy} onClick={() => void useSample()} />
        <Button label="Back" variant="ghost" width="100%" onClick={onBack} />
      </div>
      <input
        ref={fileRef}
        className="sr"
        type="file"
        accept="image/*"
        aria-label="Upload a photo of the strip"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImage(file, file.name)
          event.target.value = ''
        }}
      />
    </>
  )
}
