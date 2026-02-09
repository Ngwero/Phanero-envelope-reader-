/**
 * Image preprocessing pipeline for better OCR accuracy
 * Handles: resize, grayscale, contrast, binarization, sharpen
 */

/**
 * Load image from data URL or blob into a canvas
 */
const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Apply preprocessing to image for better OCR results
 * @param {string|Blob} imageSource - Data URL or Blob
 * @param {Object} options - Preprocessing options
 * @returns {Promise<Blob>} - Processed image as PNG blob
 */
export const preprocessImage = async (imageSource, options = {}) => {
  const {
    maxWidth = 2000,
    maxHeight = 2000,
    enableGrayscale = true,
    enableContrast = true,
    contrastFactor = 1.2,
    enableBinarization = false,
    enableSharpen = false,
  } = options

  try {
    // Convert to data URL if needed
    let dataUrl = imageSource
    if (imageSource instanceof Blob) {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(imageSource)
      })
    }

    const img = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Step 1: Resize if needed (keep aspect ratio)
    let { width, height } = img
    const originalDimensions = { width, height }

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    canvas.width = width
    canvas.height = height

    // Step 2: Draw image
    ctx.drawImage(img, 0, 0, width, height)

    // Step 3: Get image data
    let imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    // Step 4: Grayscale
    if (enableGrayscale) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
        data[i] = gray     // R
        data[i + 1] = gray // G
        data[i + 2] = gray // B
        // data[i + 3] stays as alpha
      }
    }

    // Step 5: Contrast enhancement
    if (enableContrast) {
      const factor = contrastFactor
      const intercept = 128 * (1 - factor)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept))
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept))
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept))
      }
    }

    // Step 6: Binarization (Otsu-like threshold)
    if (enableBinarization) {
      // Calculate threshold (simplified Otsu)
      const histogram = new Array(256).fill(0)
      for (let i = 0; i < data.length; i += 4) {
        histogram[data[i]]++
      }

      let sum = 0
      let sumB = 0
      let wB = 0
      let wF = 0
      let maxVariance = 0
      let threshold = 128

      for (let i = 0; i < 256; i++) {
        sum += i * histogram[i]
      }

      for (let i = 0; i < 256; i++) {
        wB += histogram[i]
        if (wB === 0) continue
        wF = data.length / 4 - wB
        if (wF === 0) break

        sumB += i * histogram[i]
        const mB = sumB / wB
        const mF = (sum - sumB) / wF
        const variance = wB * wF * (mB - mF) * (mB - mF)

        if (variance > maxVariance) {
          maxVariance = variance
          threshold = i
        }
      }

      // Apply threshold
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i]
        const value = gray > threshold ? 255 : 0
        data[i] = value
        data[i + 1] = value
        data[i + 2] = value
      }
    }

    // Step 7: Light sharpen (unsharp mask)
    if (enableSharpen) {
      const sharpenKernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ]
      const tempData = new Uint8ClampedArray(data)
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0, g = 0, b = 0
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4
              const kernelIdx = (ky + 1) * 3 + (kx + 1)
              r += tempData[idx] * sharpenKernel[kernelIdx]
              g += tempData[idx + 1] * sharpenKernel[kernelIdx]
              b += tempData[idx + 2] * sharpenKernel[kernelIdx]
            }
          }
          const idx = (y * width + x) * 4
          data[idx] = Math.min(255, Math.max(0, r))
          data[idx + 1] = Math.min(255, Math.max(0, g))
          data[idx + 2] = Math.min(255, Math.max(0, b))
        }
      }
    }

    // Put processed data back
    imageData.data = data
    ctx.putImageData(imageData, 0, 0)

    // Convert to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob())
      }, 'image/png', 0.95)
    })
  } catch (error) {
    console.warn('Preprocessing failed, using original image:', error)
    // Fallback: return original as blob
    if (imageSource instanceof Blob) {
      return imageSource
    }
    // Convert data URL to blob
    const response = await fetch(imageSource)
    return await response.blob()
  }
}
