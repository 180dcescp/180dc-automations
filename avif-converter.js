import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AVIF Converter utility for client logo optimization
 * Supports multiple source formats: JPEG, PNG, WebP, GIF, BMP, TIFF
 */
class AVIFConverter {
  constructor() {
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif'];
    this.tempDir = path.join(__dirname, 'temp');
    this.ensureTempDir();
  }

  /**
   * Ensure temp directory exists for processing
   */
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Convert image buffer to AVIF format
   * @param {Buffer} imageBuffer - Source image buffer
   * @param {string} filename - Original filename for reference
   * @param {Object} options - Conversion options
   * @returns {Promise<Buffer>} AVIF image buffer
   */
  async convertToAVIF(imageBuffer, filename = 'image', options = {}) {
    try {
      const defaultOptions = {
        quality: 80, // AVIF quality (0-100)
        effort: 4,   // Compression effort (0-9, higher = better compression)
        lossless: false,
        chromaSubsampling: '4:4:4' // Better quality for logos
      };

      const conversionOptions = { ...defaultOptions, ...options };

      console.log(`🔄 Converting ${filename} to AVIF format...`);

      // Use Sharp to convert to AVIF
      const avifBuffer = await sharp(imageBuffer)
        .avif(conversionOptions)
        .toBuffer();

      const originalSize = imageBuffer.length;
      const avifSize = avifBuffer.length;
      const compressionRatio = ((originalSize - avifSize) / originalSize * 100).toFixed(1);

      console.log(`✅ AVIF conversion successful for ${filename}`);
      console.log(`📊 Size reduction: ${originalSize} bytes → ${avifSize} bytes (${compressionRatio}% smaller)`);

      return avifBuffer;
    } catch (error) {
      console.error(`❌ Error converting ${filename} to AVIF:`, error.message);
      throw new Error(`AVIF conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert image from URL to AVIF format
   * @param {string} imageUrl - Source image URL
   * @param {string} filename - Filename for the converted image
   * @param {Object} options - Conversion options
   * @returns {Promise<Buffer>} AVIF image buffer
   */
  async convertUrlToAVIF(imageUrl, filename = 'image', options = {}) {
    try {
      console.log(`🌐 Fetching image from URL: ${imageUrl}`);

      // Fetch the image with proper headers
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };

      const response = await fetch(imageUrl, { 
        headers,
        redirect: 'follow',
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || (!contentType.startsWith('image/') && contentType !== 'application/octet-stream')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      if (imageBuffer.length === 0) {
        throw new Error('Empty image data received');
      }

      // Check if the image is already in AVIF format
      const imageInfo = await sharp(imageBuffer).metadata();
      if (imageInfo.format === 'avif') {
        console.log(`ℹ️ Image ${filename} is already in AVIF format`);
        return imageBuffer;
      }

      // Convert to AVIF
      return await this.convertToAVIF(imageBuffer, filename, options);
    } catch (error) {
      console.error(`❌ Error converting URL to AVIF:`, error.message);
      throw error;
    }
  }

  /**
   * Check if a file format is supported for conversion
   * @param {string} format - File format to check
   * @returns {boolean} Whether the format is supported
   */
  isFormatSupported(format) {
    return this.supportedFormats.includes(format.toLowerCase());
  }

  /**
   * Get image metadata without processing
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} Image metadata
   */
  async getImageMetadata(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      return {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: imageBuffer.length,
        hasAlpha: metadata.hasAlpha,
        channels: metadata.channels
      };
    } catch (error) {
      console.error('Error getting image metadata:', error.message);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        files.forEach(file => {
          const filePath = path.join(this.tempDir, file);
          fs.unlinkSync(filePath);
        });
        console.log('🧹 Cleaned up temporary files');
      }
    } catch (error) {
      console.warn('Warning: Could not clean up temporary files:', error.message);
    }
  }
}

export default AVIFConverter;
