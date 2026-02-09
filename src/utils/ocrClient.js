/**
 * Robust OCR client with preprocessing, retries, and smart fallback
 */

import Tesseract from 'tesseract.js'
import { preprocessImage } from './imagePreprocessing.js'

const DEBUG = import.meta.env.VITE_OCR_DEBUG === 'true'
const V2_ENABLED = import.meta.env.VITE_OCR_V2_ENABLED !== 'false' // Default true

// Singleton Tesseract worker
let tesseractWorker = null
const getTesseractWorker = async () => {
  if (!tesseractWorker) {
    tesseractWorker = await Tesseract.createWorker('eng')
    await tesseractWorker.setParameters({
      tessedit_pageseg_mode: '6', // Uniform block of text
    })
  }
  return tesseractWorker
}

/**
 * Sleep utility for retries
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * OCR.space API client with retry logic
 */
const callOcrSpace = async (blob, options = {}, retryCount = 0) => {
  const {
    apiKey = '',
    language = 'eng',
    isOverlayRequired = true,
    detectOrientation = true,
    scale = true,
    OCREngine = 2,
    timeout = 15000,
  } = options

  const maxRetries = 2
  const backoffMs = [500, 1500]

  try {
    const formData = new FormData()
    formData.append('file', blob, 'image.png')

    const params = new URLSearchParams({
      language,
      isOverlayRequired: String(isOverlayRequired),
      detectOrientation: String(detectOrientation),
      scale: String(scale),
      OCREngine: String(OCREngine),
    })

    if (apiKey) {
      params.append('apikey', apiKey)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(`https://api.ocr.space/parse/image?${params.toString()}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 429 && retryCount < maxRetries) {
        // Rate limit - retry with backoff
        await sleep(backoffMs[retryCount])
        return callOcrSpace(blob, options, retryCount + 1)
      }
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json()

    // Check for API errors
    if (data.IsErroredOnProcessing === true) {
      const errorMsg = data.ErrorMessage || 'Unknown OCR.space error'
      if (DEBUG) {
        console.error('OCR.space API error:', errorMsg, data)
      }
      throw new Error(errorMsg)
    }

    // Check for empty results
    if (!data.ParsedResults || data.ParsedResults.length === 0) {
      if (retryCount < maxRetries && OCREngine === 2) {
        // Try with engine 1
        await sleep(backoffMs[retryCount])
        return callOcrSpace(blob, { ...options, OCREngine: 1 }, retryCount + 1)
      }
      throw new Error('No text detected')
    }

    const parsedText = data.ParsedResults[0].ParsedText || ''
    if (!parsedText.trim() || parsedText.trim() === 'No text detected') {
      if (retryCount < maxRetries) {
        // Try alternate params
        await sleep(backoffMs[retryCount])
        const altOptions = {
          ...options,
          OCREngine: OCREngine === 2 ? 1 : 2,
          detectOrientation: !detectOrientation,
        }
        return callOcrSpace(blob, altOptions, retryCount + 1)
      }
      throw new Error('No text detected')
    }

    return {
      text: parsedText,
      engine: 'ocrspace',
      confidence: data.ParsedResults[0].TextOverlay?.HasOverlay ? 'high' : 'medium',
      diagnostics: DEBUG ? {
        http_status: response.status,
        ocrspace_raw_response: data,
        ocrspace_engine: OCREngine,
        retry_count: retryCount,
      } : undefined,
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('OCR request timeout')
    }
    if (retryCount < maxRetries && !error.message.includes('No text detected')) {
      await sleep(backoffMs[retryCount])
      return callOcrSpace(blob, options, retryCount + 1)
    }
    throw error
  }
}

/**
 * Tesseract.js OCR with singleton worker
 */
const callTesseract = async (imageDataUrl, options = {}) => {
  const {
    pagesegMode = '6',
    fallbackPagesegMode = '11',
  } = options

  try {
    const worker = await getTesseractWorker()
    
    // Try primary PSM mode
    await worker.setParameters({
      tessedit_pageseg_mode: pagesegMode,
    })

    const result = await worker.recognize(imageDataUrl)
    let text = result.data.text || ''
    let confidence = result.data.confidence || 0

    // If low confidence or empty, try fallback PSM
    if ((!text.trim() || confidence < 30) && pagesegMode !== fallbackPagesegMode) {
      await worker.setParameters({
        tessedit_pageseg_mode: fallbackPagesegMode,
      })
      const fallbackResult = await worker.recognize(imageDataUrl)
      if (fallbackResult.data.text && fallbackResult.data.text.trim().length > text.trim().length) {
        text = fallbackResult.data.text
        confidence = fallbackResult.data.confidence || 0
      }
    }

    return {
      text,
      engine: 'tesseract',
      confidence: confidence > 0 ? `${Math.round(confidence)}%` : 'unknown',
      diagnostics: DEBUG ? {
        pageseg_mode_used: text ? pagesegMode : fallbackPagesegMode,
        confidence,
        word_count: text.split(/\s+/).filter(Boolean).length,
      } : undefined,
    }
  } catch (error) {
    console.error('Tesseract error:', error)
    throw error
  }
}

/**
 * Main OCR function with preprocessing and smart fallback
 */
export const runOCR = async (imageSource, options = {}) => {
  const {
    mode = 'auto', // 'auto', 'ocrspace', 'tesseract'
    apiKey = '',
    enablePreprocessing = true,
    preprocessingOptions = {},
    ocrSpaceOptions = {},
  } = options

  const diagnostics = {
    engine_used: null,
    preprocessing_applied: false,
    image_dimensions_before: null,
    image_dimensions_after: null,
    attempts: [],
  }

  try {
    // Step 1: Preprocess image
    let processedBlob
    let imageDataUrl = imageSource

    if (enablePreprocessing && V2_ENABLED) {
      try {
        // Get original dimensions if possible
        if (typeof imageSource === 'string') {
          const img = new Image()
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = imageSource
          })
          diagnostics.image_dimensions_before = { width: img.width, height: img.height }
        }

        processedBlob = await preprocessImage(imageSource, preprocessingOptions)
        diagnostics.preprocessing_applied = true

        // Convert blob to data URL for Tesseract
        imageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(processedBlob)
        })

        // Get processed dimensions
        const img = new Image()
        await new Promise((resolve) => {
          img.onload = resolve
          img.src = imageDataUrl
        })
        diagnostics.image_dimensions_after = { width: img.width, height: img.height }
      } catch (error) {
        console.warn('Preprocessing failed, using original:', error)
        if (imageSource instanceof Blob) {
          processedBlob = imageSource
        } else {
          const response = await fetch(imageSource)
          processedBlob = await response.blob()
        }
        imageDataUrl = imageSource
      }
    } else {
      if (imageSource instanceof Blob) {
        processedBlob = imageSource
      } else {
        const response = await fetch(imageSource)
        processedBlob = await response.blob()
      }
    }

    // Step 2: Run OCR based on mode
    let result

    if (mode === 'tesseract' || (!V2_ENABLED && mode === 'auto')) {
      // Direct to Tesseract
      result = await callTesseract(imageDataUrl, ocrSpaceOptions)
      diagnostics.engine_used = 'tesseract'
    } else if (mode === 'ocrspace') {
      // Direct to OCR.space
      result = await callOcrSpace(processedBlob, { apiKey, ...ocrSpaceOptions })
      diagnostics.engine_used = 'ocrspace'
    } else {
      // AUTO mode: Try OCR.space first, fallback to Tesseract
      try {
        result = await callOcrSpace(processedBlob, { apiKey, ...ocrSpaceOptions })
        diagnostics.engine_used = 'ocrspace'
        diagnostics.attempts.push('ocrspace-success')
      } catch (ocrSpaceError) {
        diagnostics.attempts.push(`ocrspace-failed: ${ocrSpaceError.message}`)
        if (DEBUG) {
          console.warn('OCR.space failed, trying Tesseract:', ocrSpaceError)
        }
        result = await callTesseract(imageDataUrl, ocrSpaceOptions)
        diagnostics.engine_used = 'tesseract-fallback'
        diagnostics.attempts.push('tesseract-fallback')
      }
    }

    // Step 3: Validate result
    if (!result.text || !result.text.trim()) {
      throw new Error('No text detected after OCR processing')
    }

    // Step 4: Choose best result (if multiple attempts)
    const finalResult = {
      text: result.text,
      engine: result.engine || diagnostics.engine_used,
      confidence: result.confidence,
      diagnostics: DEBUG ? {
        ...diagnostics,
        ...result.diagnostics,
        parsed_text_length: result.text.length,
        word_count: result.text.split(/\s+/).filter(Boolean).length,
      } : undefined,
    }

    if (DEBUG) {
      console.log('OCR Result:', finalResult)
    }

    return finalResult
  } catch (error) {
    if (DEBUG) {
      console.error('OCR Error:', { error, diagnostics })
    }
    throw error
  }
}

/**
 * Cleanup Tesseract worker (call on app unmount)
 */
export const cleanupOCR = async () => {
  if (tesseractWorker) {
    await tesseractWorker.terminate()
    tesseractWorker = null
  }
}
