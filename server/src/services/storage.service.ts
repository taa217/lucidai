import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export interface UploadResult {
  path: string;
  url: string;
  size: number;
}

export interface StorageConfig {
  url: string;
  key: string;
  bucket: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');
    this.bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET', 'documents');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('Supabase configuration missing. Storage features will be disabled.');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    folder: string = 'documents'
  ): Promise<UploadResult> {
    try {
      if (!this.supabase) {
        throw new Error('Supabase not configured');
      }

      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.originalname}`;
      const filePath = `${folder}/${userId}/${fileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        this.logger.error('Upload failed:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Generate a signed URL that expires in 1 hour (3600 seconds)
      const { data: urlData, error: urlError } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(filePath, 3600);

      if (urlError) {
        this.logger.error('Signed URL generation failed:', urlError);
        throw new Error(`Signed URL generation failed: ${urlError.message}`);
      }

      return {
        path: filePath,
        url: urlData.signedUrl,
        size: file.size,
      };
    } catch (error) {
      this.logger.error('File upload error:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      if (!this.supabase) {
        throw new Error('Supabase not configured');
      }

      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([filePath]);

      if (error) {
        this.logger.error('Delete failed:', error);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('File deletion error:', error);
      return false;
    }
  }

  /**
   * Get a signed URL for private file access
   */
  async getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (!this.supabase) {
        throw new Error('Supabase not configured');
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        this.logger.error('Signed URL generation failed:', error);
        throw new Error(`Signed URL generation failed: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error) {
      this.logger.error('Signed URL error:', error);
      throw error;
    }
  }

  /**
   * Refresh a signed URL for a document
   */
  async refreshDocumentUrl(storagePath: string): Promise<string> {
    return this.getSignedUrl(storagePath, 3600); // 1 hour expiry
  }

  /**
   * Generate a thumbnail for a document
   */
  async generateThumbnail(
    filePath: string,
    userId: string
  ): Promise<string | null> {
    try {
      if (!this.supabase) {
        return null;
      }

      // For now, we'll return null as thumbnail generation requires additional processing
      // In a full implementation, you might use a service like Cloudinary or AWS Lambda
      // to generate thumbnails from PDFs and other documents
      return null;
    } catch (error) {
      this.logger.error('Thumbnail generation error:', error);
      return null;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      if (!this.supabase) {
        return false;
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .list(filePath.split('/').slice(0, -1).join('/'));

      if (error) {
        return false;
      }

      const fileName = filePath.split('/').pop();
      return data.some(file => file.name === fileName);
    } catch (error) {
      this.logger.error('File existence check error:', error);
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string): Promise<any> {
    try {
      if (!this.supabase) {
        return null;
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .list(filePath.split('/').slice(0, -1).join('/'));

      if (error) {
        return null;
      }

      const fileName = filePath.split('/').pop();
      return data.find(file => file.name === fileName);
    } catch (error) {
      this.logger.error('File metadata error:', error);
      return null;
    }
  }
} 