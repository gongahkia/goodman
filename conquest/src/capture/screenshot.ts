import { browserApi } from '../lib/browser-api'
import { takeSmokeCaptureImage } from '../lib/storage'

import type { CapturedImage, Region } from '../lib/types'

const FULLPAGE_MAX_IMAGE_DIMENSION = 960
const REGION_MAX_IMAGE_DIMENSION = 1280
const OUTPUT_IMAGE_MIME = 'image/jpeg'
const OUTPUT_IMAGE_QUALITY = 0.72

export async function captureFullPage(): Promise<CapturedImage> {
  const smokeCaptureImage = await takeSmokeCaptureImage()
  if (smokeCaptureImage) return parseStoredCaptureImage(smokeCaptureImage)

  const image = await captureVisibleTabRaw()
  return optimizeImage(image, FULLPAGE_MAX_IMAGE_DIMENSION)
}

export async function captureRegion(region: Region): Promise<CapturedImage> {
  const fullPageImage = await captureVisibleTabRaw()
  const cropped = await cropImage(fullPageImage, region)
  return optimizeImage(cropped, REGION_MAX_IMAGE_DIMENSION)
}

async function captureVisibleTabRaw(): Promise<CapturedImage> {
  const dataUrl = await browserApi.tabs.captureVisibleTab({
    format: 'jpeg',
    quality: Math.round(OUTPUT_IMAGE_QUALITY * 100),
  })
  return parseDataUrl(dataUrl)
}

async function cropImage(image: CapturedImage, region: Region): Promise<CapturedImage> {
  const img = await loadImage(image)
  const canvas = new OffscreenCanvas(region.w, region.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Screenshot capture failed: could not get canvas context')

  ctx.drawImage(
    img,
    region.x, region.y, region.w, region.h,
    0, 0, region.w, region.h,
  )

  const blob = await canvas.convertToBlob({
    quality: OUTPUT_IMAGE_QUALITY,
    type: OUTPUT_IMAGE_MIME,
  })
  return blobToCapturedImage(blob)
}

async function optimizeImage(
  image: CapturedImage,
  maxDimension: number,
): Promise<CapturedImage> {
  const img = await loadImage(image)
  const { height, width } = getScaledDimensions(img.width, img.height, maxDimension)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Screenshot capture failed: could not get canvas context')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await canvas.convertToBlob({
    quality: OUTPUT_IMAGE_QUALITY,
    type: OUTPUT_IMAGE_MIME,
  })
  return blobToCapturedImage(blob)
}

function getScaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number, height: number } {
  const largestDimension = Math.max(width, height)
  if (largestDimension <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / largestDimension
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function loadImage(image: CapturedImage): Promise<ImageBitmap> {
  return fetch(`data:${image.mimeType};base64,${image.base64}`)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
}

function parseStoredCaptureImage(value: string): CapturedImage {
  if (value.startsWith('data:')) {
    return parseDataUrl(value)
  }

  return {
    base64: value,
    mimeType: 'image/png',
  }
}

function parseDataUrl(dataUrl: string): CapturedImage {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Screenshot capture failed: invalid image payload')
  }

  return {
    base64: match[2] ?? '',
    mimeType: match[1] ?? OUTPUT_IMAGE_MIME,
  }
}

async function blobToCapturedImage(blob: Blob): Promise<CapturedImage> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return {
    base64: btoa(binary),
    mimeType: blob.type || OUTPUT_IMAGE_MIME,
  }
}
