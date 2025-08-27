# Supabase Storage Setup Guide

This guide will help you set up Supabase Storage for the Lucid Learning Platform's library feature.

## What is Supabase Storage?

Supabase Storage is a file storage solution that provides:
- **Secure file uploads** with authentication
- **CDN distribution** for fast global access
- **Row-level security** for fine-grained access control
- **Automatic image transformations** and optimizations
- **Generous free tier** (1GB storage, 2GB bandwidth)

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Fill in project details:
   - **Name**: `lucid-learning-storage` (or your preferred name)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
5. Click "Create new project"

## Step 2: Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **Service Role Key** (anon public key won't work for server-side operations)

## Step 3: Create Storage Bucket

1. In your Supabase dashboard, go to **Storage**
2. Click "Create a new bucket"
3. Configure the bucket:
   - **Name**: `documents`
   - **Public bucket**: ✅ **Checked** (for now, we'll secure with RLS)
   - **File size limit**: `50MB` (adjust as needed)
   - **Allowed MIME types**: 
     ```
     application/pdf,
     application/vnd.openxmlformats-officedocument.wordprocessingml.document,
     text/plain,
     application/epub+zip,
     image/*,
     video/*,
     audio/*
     ```

## Step 4: Configure Row Level Security (RLS)

1. In the Storage section, click on your `documents` bucket
2. Go to **Policies** tab
3. Click "New Policy"
4. Create the following policies:

### Policy 1: Users can upload their own files
```sql
-- Policy name: "Users can upload their own files"
-- Operation: INSERT
-- Target roles: authenticated
-- Policy definition:
(auth.uid()::text = (storage.foldername(name))[1])
```

### Policy 2: Users can view their own files
```sql
-- Policy name: "Users can view their own files"
-- Operation: SELECT
-- Target roles: authenticated
-- Policy definition:
(auth.uid()::text = (storage.foldername(name))[1])
```

### Policy 3: Users can update their own files
```sql
-- Policy name: "Users can update their own files"
-- Operation: UPDATE
-- Target roles: authenticated
-- Policy definition:
(auth.uid()::text = (storage.foldername(name))[1])
```

### Policy 4: Users can delete their own files
```sql
-- Policy name: "Users can delete their own files"
-- Operation: DELETE
-- Target roles: authenticated
-- Policy definition:
(auth.uid()::text = (storage.foldername(name))[1])
```

## Step 5: Update Environment Variables

1. Copy your `.env.example` to `.env` in the server directory
2. Add your Supabase credentials:

```env
# Supabase Storage Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_STORAGE_BUCKET=documents
```

## Step 6: Test the Setup

1. Start your server:
   ```bash
   cd server
   npm run start:dev
   ```

2. Test file upload through your application
3. Check the Supabase Storage dashboard to see uploaded files

## File Structure

Files will be stored in the following structure:
```
documents/
├── user-id-1/
│   ├── 1234567890-document1.pdf
│   └── 1234567891-document2.docx
└── user-id-2/
    ├── 1234567892-notes.txt
    └── 1234567893-presentation.pptx
```

## Security Features

### Row Level Security (RLS)
- Users can only access files in their own folder
- File paths include user ID for isolation
- Automatic cleanup when users are deleted

### File Validation
- MIME type validation on upload
- File size limits enforced
- Secure file naming with timestamps

### Access Control
- Service role key for server operations
- User authentication required for all operations
- No public access to files by default

## Advanced Configuration

### Custom Domains
You can set up a custom domain for your storage:
1. Go to **Settings** → **Storage**
2. Add your custom domain
3. Update DNS records as instructed

### Image Transformations
Supabase can automatically resize and optimize images:
```typescript
// Example: Get a 300x300 thumbnail
const thumbnailUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}?width=300&height=300&resize=cover`
```

### CDN Configuration
Files are automatically served through a global CDN for fast access worldwide.

## Troubleshooting

### Common Issues

1. **"Supabase not configured" error**
   - Check your environment variables
   - Ensure service role key is correct

2. **"Upload failed" error**
   - Verify bucket exists and is named `documents`
   - Check file size limits
   - Ensure MIME type is allowed

3. **"Unauthorized" error**
   - Verify RLS policies are correctly configured
   - Check that user authentication is working

### Debug Mode
Enable debug logging in your server:
```env
LOG_LEVEL=debug
```

## Cost Optimization

### Free Tier Limits
- **Storage**: 1GB
- **Bandwidth**: 2GB/month
- **File uploads**: 50,000/month

### Monitoring Usage
1. Go to **Settings** → **Usage**
2. Monitor storage and bandwidth usage
3. Set up alerts for approaching limits

### Optimization Tips
- Compress large files before upload
- Use appropriate image formats (WebP for images)
- Implement file cleanup for unused documents
- Consider implementing file deduplication

## Next Steps

1. **Run the database migration**:
   ```bash
   cd server
   npm run migration:run
   ```

2. **Test the complete flow**:
   - Upload a document
   - View it in the library
   - Create collections
   - Add documents to collections

3. **Monitor performance** and adjust settings as needed

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [Storage API Reference](https://supabase.com/docs/reference/javascript/storage-createbucket)
- [Community Forum](https://github.com/supabase/supabase/discussions) 