import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

// Set ffmpeg path with better error handling
try {
  if (ffmpegStatic) {
    console.log('Setting FFmpeg path to:', ffmpegStatic);
    ffmpeg.setFfmpegPath(ffmpegStatic);
  } else {
    console.warn('ffmpeg-static not found, trying system ffmpeg');
    // Try to use system ffmpeg as fallback
    ffmpeg.setFfmpegPath('ffmpeg');
  }
} catch (error) {
  console.error('Error setting FFmpeg path:', error);
  // Fallback to system ffmpeg
  ffmpeg.setFfmpegPath('ffmpeg');
}

// Initialize S3 client for R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

// Helper to generate unique filename
function generateUniqueFilename(originalName: string, prefix?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = path.extname(originalName)
  const name = path.basename(originalName, ext)
  return `${prefix ? prefix + '-' : ''}${name}-${timestamp}-${random}${ext}`
}

// Extract first frame from video
export async function extractVideoThumbnail(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['00:00:01'], // Extract frame at 1 second
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '400x300', // Fixed size for consistency
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
  })
}

// Upload file to R2
export async function uploadToR2(
  filePath: string,
  key: string,
  contentType: string
): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(filePath)
    
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })

    await r2Client.send(command)
    
    // Return the public URL
    return `${process.env.R2_ENDPOINT}/${key}`
  } catch (error) {
    console.error('Error uploading to R2:', error)
    throw error
  }
}

// Process and upload video with thumbnail
export async function processAndUploadVideo(
  videoPath: string,
  videoTitle: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  try {
    // Generate unique filenames
    const videoFilename = generateUniqueFilename(path.basename(videoPath), 'video')
    const thumbnailFilename = generateUniqueFilename(`${videoTitle}.jpg`, 'thumbnail')
    
    // Create temporary thumbnail file
    const tempThumbnailPath = path.join('/tmp', `thumbnail-${Date.now()}.jpg`)
    
    // Extract thumbnail
    await extractVideoThumbnail(videoPath, tempThumbnailPath)
    
    // Upload video
    const videoUrl = await uploadToR2(
      videoPath,
      `videos/${videoFilename}`,
      'video/mp4'
    )
    
    // Upload thumbnail
    const thumbnailUrl = await uploadToR2(
      tempThumbnailPath,
      `thumbnails/${thumbnailFilename}`,
      'image/jpeg'
    )
    
    // Clean up temporary thumbnail
    try {
      await fs.promises.unlink(tempThumbnailPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary thumbnail:', cleanupError)
    }
    
    return { videoUrl, thumbnailUrl }
  } catch (error) {
    console.error('Error processing and uploading video:', error)
    throw error
  }
}

// Upload image from buffer
export async function uploadImageToR2(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  try {
    const imageFilename = generateUniqueFilename(filename, 'image')
    
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: `images/${imageFilename}`,
      Body: buffer,
      ContentType: contentType,
    })

    await r2Client.send(command)
    
    // Return the public URL
    return `${process.env.R2_ENDPOINT}/images/${imageFilename}`
  } catch (error) {
    console.error('Error uploading image to R2:', error)
    throw error
  }
}

// Upload all videos from sample_videos directory
export async function uploadSampleVideos(): Promise<Array<{
  id: string
  title: string
  videoUrl: string
  thumbnailUrl: string
  originalFilename: string
}>> {
  const sampleVideosDir = path.join(process.cwd(), 'sample_videos')
  const results = []
  
  try {
    const files = await fs.promises.readdir(sampleVideosDir)
    const videoFiles = files.filter(file => file.endsWith('.mp4'))
    
    for (const file of videoFiles) {
      const filePath = path.join(sampleVideosDir, file)
      const title = path.basename(file, '.mp4')
      
      console.log(`Processing ${file}...`)
      
      try {
        const { videoUrl, thumbnailUrl } = await processAndUploadVideo(filePath, title)
        
        results.push({
          id: `fallback-${results.length + 1}`,
          title,
          videoUrl,
          thumbnailUrl,
          originalFilename: file
        })
        
        console.log(`✓ Uploaded ${file}`)
      } catch (error) {
        console.error(`✗ Failed to upload ${file}:`, error)
      }
    }
    
    return results
  } catch (error) {
    console.error('Error reading sample videos directory:', error)
    throw error
  }
}