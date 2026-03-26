import type { CapturedImage, QuizAnalysisResult } from '../lib/types'

export interface VisionLLMProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  analyzeImage(image: CapturedImage, prompt: string, signal?: AbortSignal): Promise<QuizAnalysisResult>
  listVisionModels(): Promise<string[]>
}
