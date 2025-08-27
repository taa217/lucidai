import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from '../services/document.service';
import { StorageService } from '../services/storage.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('api/documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Get all documents for the authenticated user
   */
  @Get('user/:userId')
  async getUserDocuments(@Param('userId') userId: string, @Request() req: any) {
    // Ensure user can only access their own documents
    if (req.user.id !== userId) {
      throw new Error('Unauthorized');
    }
    
    return {
      success: true,
      documents: await this.documentService.getUserDocuments(userId),
    };
  }

  /**
   * Get a single document
   */
  @Get(':documentId')
  async getDocument(@Param('documentId') documentId: string, @Request() req: any) {
    return {
      success: true,
      document: await this.documentService.getDocument(documentId, req.user.id),
    };
  }

  /**
   * Get a signed URL for a document
   */
  @Get(':documentId/url')
  async getDocumentUrl(@Param('documentId') documentId: string, @Request() req: any) {
    try {
      const document = await this.documentService.getDocument(documentId, req.user.id);
      if (!document) {
        return {
          success: false,
          message: 'Document not found',
        };
      }

      const signedUrl = await this.storageService.refreshDocumentUrl(document.storagePath);
      return {
        success: true,
        url: signedUrl,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Upload a new document
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req: any,
  ) {
    try {
      const userId = req.user.id;
      const tags = body.tags ? JSON.parse(body.tags) : [];
      const isPublic = body.isPublic === 'true';

      console.log('🔍 Debug - Starting document upload process');
      
      // Upload file to storage
      console.log('🔍 Debug - Calling storage service...');
      const uploadResult = await this.storageService.uploadFile(file, userId);
      console.log('🔍 Debug - Storage upload result:', uploadResult);

      // Create document record
      console.log('🔍 Debug - Creating document record...');
      const document = await this.documentService.createDocument({
        userId,
        filename: uploadResult.path.split('/').pop() || file.originalname, // Use the filename from storage path
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storagePath: uploadResult.path,
        tags,
        isPublic,
      });
      console.log('🔍 Debug - Document created:', document.id);

      return {
        success: true,
        document,
        message: 'Document uploaded successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Update a document
   */
  @Put(':documentId')
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() updateData: any,
    @Request() req: any,
  ) {
    try {
      const document = await this.documentService.updateDocument(
        documentId,
        req.user.id,
        updateData,
      );

      return {
        success: true,
        document,
        message: 'Document updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Delete a document
   */
  @Delete(':documentId')
  async deleteDocument(@Param('documentId') documentId: string, @Request() req: any) {
    try {
      await this.documentService.deleteDocument(documentId, req.user.id);

      return {
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Search documents
   */
  @Post('search')
  async searchDocuments(
    @Body() body: { userId: string; query: string; limit?: number },
    @Request() req: any,
  ) {
    // Ensure user can only search their own documents
    if (req.user.id !== body.userId) {
      throw new Error('Unauthorized');
    }

    const documents = await this.documentService.searchDocuments(
      body.userId,
      body.query,
      body.limit,
    );

    return {
      success: true,
      documents,
    };
  }

  /**
   * Get all collections for the authenticated user
   */
  @Get('collections/user/:userId')
  async getUserCollections(@Param('userId') userId: string, @Request() req: any) {
    // Ensure user can only access their own collections
    if (req.user.id !== userId) {
      throw new Error('Unauthorized');
    }

    return {
      success: true,
      collections: await this.documentService.getUserCollections(userId),
    };
  }

  /**
   * Get a single collection
   */
  @Get('collections/:collectionId')
  async getCollection(@Param('collectionId') collectionId: string, @Request() req: any) {
    return {
      success: true,
      collection: await this.documentService.getCollection(collectionId, req.user.id),
    };
  }

  /**
   * Create a new collection
   */
  @Post('collections')
  async createCollection(@Body() createData: any, @Request() req: any) {
    try {
      const collection = await this.documentService.createCollection({
        ...createData,
        userId: req.user.id,
      });

      return {
        success: true,
        collection,
        message: 'Collection created successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Update a collection
   */
  @Put('collections/:collectionId')
  async updateCollection(
    @Param('collectionId') collectionId: string,
    @Body() updateData: any,
    @Request() req: any,
  ) {
    try {
      const collection = await this.documentService.updateCollection(
        collectionId,
        req.user.id,
        updateData,
      );

      return {
        success: true,
        collection,
        message: 'Collection updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Delete a collection
   */
  @Delete('collections/:collectionId')
  async deleteCollection(@Param('collectionId') collectionId: string, @Request() req: any) {
    try {
      await this.documentService.deleteCollection(collectionId, req.user.id);

      return {
        success: true,
        message: 'Collection deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Add document to collection
   */
  @Post('collections/:collectionId/documents')
  async addDocumentToCollection(
    @Param('collectionId') collectionId: string,
    @Body() body: { documentId: string },
    @Request() req: any,
  ) {
    try {
      await this.documentService.addDocumentToCollection(
        collectionId,
        body.documentId,
        req.user.id,
      );

      return {
        success: true,
        message: 'Document added to collection successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Remove document from collection
   */
  @Delete('collections/:collectionId/documents/:documentId')
  async removeDocumentFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    try {
      await this.documentService.removeDocumentFromCollection(
        collectionId,
        documentId,
        req.user.id,
      );

      return {
        success: true,
        message: 'Document removed from collection successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get documents in a collection
   */
  @Get('collections/:collectionId/documents')
  async getCollectionDocuments(
    @Param('collectionId') collectionId: string,
    @Request() req: any,
  ) {
    const documents = await this.documentService.getCollectionDocuments(
      collectionId,
      req.user.id,
    );

    return {
      success: true,
      documents,
    };
  }
} 