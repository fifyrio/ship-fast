import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { processAndUploadVideo, uploadToR2 } from './r2-upload';
import { createClient } from './supabase/server';
import { recordVideoCompletion } from './credits-manager';

export interface VideoProcessingResult {
  videoUrl: string;
  thumbnailUrl: string;
  videoFileSize: number;
  thumbnailFileSize: number;
  localVideoPath: string;
  localThumbnailPath: string;
}

export interface VideoMetadata {
  taskId: string;
  userId?: string;
  originalPrompt?: string;
  triggers?: string[];
  duration?: string;
  quality?: string;
  aspectRatio?: string;
}

/**
 * Download video from URL to local temporary file
 */
export async function downloadVideo(url: string, fileName: string): Promise<{ filePath: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    // Create temp directory if it doesn't exist
    // Use /tmp in production environments or process.cwd()/temp in development
    const tempDir = process.env.NODE_ENV === 'production' 
      ? '/tmp'
      : path.join(process.cwd(), 'temp');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, fileName);
    const file = fs.createWriteStream(filePath);
    
    // Choose http or https based on URL
    const client = url.startsWith('https') ? https : http;
    
    console.log(`📥 Downloading video from: ${url}`);
    console.log(`📁 Saving to: ${filePath}`);
    
    const request = client.get(url, (response) => {
      // Check if response is successful
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      let downloadedBytes = 0;
      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      
      response.pipe(file);
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          console.log(`📊 Download progress: ${progress}% (${downloadedBytes}/${totalBytes} bytes)`);
        }
      });
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Download completed: ${downloadedBytes} bytes`);
        resolve({
          filePath,
          fileSize: downloadedBytes
        });
      });
      
      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file async
        reject(err);
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file async
      reject(err);
    });
    
    // Set timeout for download
    request.setTimeout(300000, () => { // 5 minutes timeout
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Process video and thumbnail from KIE API: download both files, upload to R2
 */
export async function processKieVideoAndThumbnail(
  kieVideoUrl: string,
  kieThumbnailUrl: string,
  metadata: VideoMetadata
): Promise<VideoProcessingResult> {
  let localVideoPath: string | null = null;
  let localThumbnailPath: string | null = null;
  
  try {
    console.log(`🎬 Processing KIE video and thumbnail for task: ${metadata.taskId}`);
    console.log(`   - Video URL: ${kieVideoUrl}`);
    console.log(`   - Thumbnail URL: ${kieThumbnailUrl}`);
    
    // Generate unique filenames
    const timestamp = Date.now();
    const videoFileName = `kie-video-${metadata.taskId}-${timestamp}.mp4`;
    const thumbnailFileName = `kie-thumbnail-${metadata.taskId}-${timestamp}.jpg`;
    
    // Download both video and thumbnail in parallel
    console.log(`📥 Downloading video and thumbnail...`);
    const [videoDownload, thumbnailDownload] = await Promise.all([
      downloadVideo(kieVideoUrl, videoFileName),
      downloadVideo(kieThumbnailUrl, thumbnailFileName)
    ]);
    
    localVideoPath = videoDownload.filePath;
    localThumbnailPath = thumbnailDownload.filePath;
    
    console.log(`📁 Files downloaded:`);
    console.log(`   - Video: ${localVideoPath} (${videoDownload.fileSize} bytes)`);
    console.log(`   - Thumbnail: ${localThumbnailPath} (${thumbnailDownload.fileSize} bytes)`);
    
    // Upload both to R2
    console.log(`☁️ Uploading to Cloudflare R2...`);
    const [videoUrl, thumbnailUrl] = await Promise.all([
      uploadToR2(localVideoPath, `videos/video-${timestamp}-${metadata.taskId.slice(0, 8)}.mp4`, 'video/mp4'),
      uploadToR2(localThumbnailPath, `thumbnails/thumb-${timestamp}-${metadata.taskId.slice(0, 8)}.jpg`, 'image/jpeg')
    ]);
    
    console.log(`✅ Upload complete:`);
    console.log(`   - Video URL: ${videoUrl}`);
    console.log(`   - Thumbnail URL: ${thumbnailUrl}`);
    
    return {
      videoUrl,
      thumbnailUrl,
      videoFileSize: videoDownload.fileSize,
      thumbnailFileSize: thumbnailDownload.fileSize,
      localVideoPath,
      localThumbnailPath
    };
    
  } catch (error) {
    console.error(`❌ Error processing video for task ${metadata.taskId}:`, error);
    
    // Cleanup on error
    if (localVideoPath && fs.existsSync(localVideoPath)) {
      try {
        fs.unlinkSync(localVideoPath);
        console.log(`🧹 Cleaned up video file: ${localVideoPath}`);
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup video file: ${cleanupError}`);
      }
    }
    
    if (localThumbnailPath && fs.existsSync(localThumbnailPath)) {
      try {
        fs.unlinkSync(localThumbnailPath);
        console.log(`🧹 Cleaned up thumbnail file: ${localThumbnailPath}`);
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup thumbnail file: ${cleanupError}`);
      }
    }
    
    throw error;
  }
}

/**
 * Save processed video to database
 */
export async function saveVideoToDatabase(
  processingResult: VideoProcessingResult,
  metadata: VideoMetadata
): Promise<{ videoId: string }> {
  try {
    console.log(`💾 Saving video to database for task: ${metadata.taskId}`);
    
    const supabase = createClient();
    console.log('user_id', metadata.userId);
    // Prepare video data
    const videoData = {
      user_id: metadata.userId || null,
      task_id: metadata.taskId, // Store the KIE task ID for tracking
      title: `ASMR Video ${new Date().toISOString().slice(0, 10)}`,
      description: 'AI-generated ASMR video via KIE API',
      prompt: metadata.originalPrompt || 'Generated via KIE API',
      triggers: metadata.triggers || [],
      category: 'Object', // Default category
      status: 'ready',
      credit_cost: 20, // Runway costs 20 credits
      duration: metadata.duration || '5s',
      resolution: metadata.quality || '720p',
      aspect_ratio: metadata.aspectRatio || '16:9',
      preview_url: processingResult.videoUrl,
      download_url: processingResult.videoUrl,
      thumbnail_url: processingResult.thumbnailUrl,
      file_size: processingResult.videoFileSize,
      provider: 'kie-runway',
      generation_completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select('id')
      .single();
    
    if (error) {
      console.error('❌ Database error:', error);
      throw new Error(`Failed to save video to database: ${error.message}`);
    }
    
    if (!data) {
      throw new Error('Failed to save video to database: No data returned');
    }
    
    console.log(`✅ Video saved to database with ID: ${data.id}`);
    
    return { videoId: data.id };
    
  } catch (error) {
    console.error(`❌ Error saving video to database:`, error);
    throw error;
  }
}

/**
 * Cleanup temporary files
 */
export function cleanupTempFiles(filePaths: string[]): void {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Cleaned up temporary file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup temporary file ${filePath}:`, error);
    }
  });
}

/**
 * Complete video processing workflow with KIE-provided thumbnail
 */
export async function completeVideoProcessing(
  kieVideoUrl: string,
  kieThumbnailUrl: string,
  metadata: VideoMetadata
): Promise<{ videoId: string; videoUrl: string; thumbnailUrl: string }> {
  let processingResult: VideoProcessingResult | null = null;
  
  try {
    // Process the video and thumbnail (download both, upload to R2)
    processingResult = await processKieVideoAndThumbnail(kieVideoUrl, kieThumbnailUrl, metadata);
    
    // Save to database
    const { videoId } = await saveVideoToDatabase(processingResult, metadata);
    
    // Record video completion in credit transactions
    if (metadata.userId) {
      const completionResult = await recordVideoCompletion(
        metadata.userId,
        metadata.taskId,
        videoId
      );
      
      if (!completionResult.success) {
        console.warn(`Failed to record video completion: ${completionResult.error}`);
      }
    }
    
    // Cleanup temp files
    cleanupTempFiles([processingResult.localVideoPath, processingResult.localThumbnailPath]);
    
    return {
      videoId,
      videoUrl: processingResult.videoUrl,
      thumbnailUrl: processingResult.thumbnailUrl
    };
    
  } catch (error) {
    // Cleanup temp files on error
    if (processingResult) {
      cleanupTempFiles([
        processingResult.localVideoPath,
        processingResult.localThumbnailPath
      ].filter(Boolean));
    }
    
    throw error;
  }
}