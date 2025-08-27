import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { UserDocument, DocumentType, DocumentStatus } from '../entities/user-document.entity';
import { DocumentCollection } from '../entities/document-collection.entity';
import { StorageService } from './storage.service';

export interface CreateDocumentDto {
  userId: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface UpdateDocumentDto {
  originalFilename?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface CreateCollectionDto {
  userId: string;
  name: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}

export interface UpdateCollectionDto {
  name?: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(UserDocument)
    private documentRepository: Repository<UserDocument>,
    @InjectRepository(DocumentCollection)
    private collectionRepository: Repository<DocumentCollection>,
    private storageService: StorageService,
  ) {}

  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId: string): Promise<UserDocument[]> {
    try {
      return await this.documentRepository.find({
        where: { userId, status: DocumentStatus.COMPLETED },
        relations: ['collections'],
        order: { uploadDate: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get user documents:', error);
      throw error;
    }
  }

  /**
   * Get a single document by ID
   */
  async getDocument(documentId: string, userId: string): Promise<UserDocument> {
    try {
      const document = await this.documentRepository.findOne({
        where: { id: documentId, userId },
        relations: ['collections'],
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      return document;
    } catch (error) {
      this.logger.error('Failed to get document:', error);
      throw error;
    }
  }

  /**
   * Create a new document record
   */
  async createDocument(createDocumentDto: CreateDocumentDto): Promise<UserDocument> {
    try {
      const documentType = this.getDocumentTypeFromMimeType(createDocumentDto.mimeType);
      
      const document = this.documentRepository.create({
        ...createDocumentDto,
        documentType,
        status: DocumentStatus.UPLOADED,
        uploadDate: new Date(),
        tags: createDocumentDto.tags || [],
        isPublic: createDocumentDto.isPublic || false,
      });

      const savedDocument = await this.documentRepository.save(document);
      
      // Update status to completed
      savedDocument.status = DocumentStatus.COMPLETED;
      return await this.documentRepository.save(savedDocument);
    } catch (error) {
      this.logger.error('Failed to create document:', error);
      throw error;
    }
  }

  /**
   * Update a document
   */
  async updateDocument(
    documentId: string,
    userId: string,
    updateDocumentDto: UpdateDocumentDto
  ): Promise<UserDocument> {
    try {
      const document = await this.getDocument(documentId, userId);
      
      Object.assign(document, updateDocumentDto);
      return await this.documentRepository.save(document);
    } catch (error) {
      this.logger.error('Failed to update document:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const document = await this.getDocument(documentId, userId);
      
      // Delete from storage
      if (document.storagePath) {
        await this.storageService.deleteFile(document.storagePath);
      }
      
      // Delete from database
      await this.documentRepository.remove(document);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete document:', error);
      throw error;
    }
  }

  /**
   * Search documents
   */
  async searchDocuments(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<UserDocument[]> {
    try {
      return await this.documentRepository.find({
        where: [
          { userId, originalFilename: Like(`%${query}%`) },
          { userId, tags: In([query]) },
        ],
        relations: ['collections'],
        order: { uploadDate: 'DESC' },
        take: limit,
      });
    } catch (error) {
      this.logger.error('Failed to search documents:', error);
      throw error;
    }
  }

  /**
   * Get all collections for a user
   */
  async getUserCollections(userId: string): Promise<DocumentCollection[]> {
    try {
      const collections = await this.collectionRepository.find({
        where: { userId },
        relations: ['documents'],
        order: { createdAt: 'DESC' },
      });

      // Add document count
      return collections.map(collection => ({
        ...collection,
        documentCount: collection.documents?.length || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to get user collections:', error);
      throw error;
    }
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(collectionId: string, userId: string): Promise<DocumentCollection> {
    try {
      const collection = await this.collectionRepository.findOne({
        where: { id: collectionId, userId },
        relations: ['documents'],
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      return {
        ...collection,
        documentCount: collection.documents?.length || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get collection:', error);
      throw error;
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(createCollectionDto: CreateCollectionDto): Promise<DocumentCollection> {
    try {
      const collection = this.collectionRepository.create({
        ...createCollectionDto,
        color: createCollectionDto.color || '#3B82F6',
        isPublic: createCollectionDto.isPublic || false,
      });

      return await this.collectionRepository.save(collection);
    } catch (error) {
      this.logger.error('Failed to create collection:', error);
      throw error;
    }
  }

  /**
   * Update a collection
   */
  async updateCollection(
    collectionId: string,
    userId: string,
    updateCollectionDto: UpdateCollectionDto
  ): Promise<DocumentCollection> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      
      Object.assign(collection, updateCollectionDto);
      return await this.collectionRepository.save(collection);
    } catch (error) {
      this.logger.error('Failed to update collection:', error);
      throw error;
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string, userId: string): Promise<boolean> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      await this.collectionRepository.remove(collection);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete collection:', error);
      throw error;
    }
  }

  /**
   * Add document to collection
   */
  async addDocumentToCollection(
    collectionId: string,
    documentId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      const document = await this.getDocument(documentId, userId);

      if (!collection.documents) {
        collection.documents = [];
      }

      // Check if document is already in collection
      const exists = collection.documents.some(doc => doc.id === documentId);
      if (exists) {
        throw new BadRequestException('Document already in collection');
      }

      collection.documents.push(document);
      await this.collectionRepository.save(collection);
      return true;
    } catch (error) {
      this.logger.error('Failed to add document to collection:', error);
      throw error;
    }
  }

  /**
   * Remove document from collection
   */
  async removeDocumentFromCollection(
    collectionId: string,
    documentId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      
      if (!collection.documents) {
        return true;
      }

      collection.documents = collection.documents.filter(doc => doc.id !== documentId);
      await this.collectionRepository.save(collection);
      return true;
    } catch (error) {
      this.logger.error('Failed to remove document from collection:', error);
      throw error;
    }
  }

  /**
   * Get documents in a collection
   */
  async getCollectionDocuments(collectionId: string, userId: string): Promise<UserDocument[]> {
    try {
      const collection = await this.getCollection(collectionId, userId);
      return collection.documents || [];
    } catch (error) {
      this.logger.error('Failed to get collection documents:', error);
      throw error;
    }
  }

  /**
   * Get document type from MIME type
   */
  private getDocumentTypeFromMimeType(mimeType: string): DocumentType {
    if (mimeType.includes('pdf')) return DocumentType.PDF;
    if (mimeType.includes('word') || mimeType.includes('docx')) return DocumentType.DOCX;
    if (mimeType.includes('text/plain')) return DocumentType.TXT;
    if (mimeType.includes('epub')) return DocumentType.EPUB;
    if (mimeType.includes('image/')) return DocumentType.IMAGE;
    if (mimeType.includes('video/')) return DocumentType.VIDEO;
    if (mimeType.includes('audio/')) return DocumentType.AUDIO;
    return DocumentType.OTHER;
  }
} 